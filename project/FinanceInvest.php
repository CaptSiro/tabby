<?php

namespace project;

use core\database\sql\query\Query;
use core\database\sql\Sql;
use models\Setting\Setting;
use PDOException;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceFund;
use project\models\Finance\FinanceInvestment;
use project\models\Finance\FinanceQuote;
use project\models\Finance\FinanceTransaction;

use const models\extensions\Editable\PROPERTY_EDITABLE;

/**
 * Investing plan of the finance widget (endpoints /invest, /funds, /investments, /quotes in FinanceController)
 *
 * Every month on the reminder day the widget shows a reminder to invest a part of the previous month's surplus:
 *
 *   surplus = income - expenses of the previous month
 *   share   = maxShare * balance / (balance + halfPoint)
 *   invest  = surplus * share
 *
 * The share approaches maxShare but never reaches it, at a balance of halfPoint it is exactly half of maxShare. The
 * amount is split between the funds by their weights, preferring the funds that are below their target share of all the
 * money invested so far.
 */
class FinanceInvest {
    /** JSON FinanceInvestSettings (widgets/finance/finance.d.ts) */
    public const SETTING = 'finance:invest';

    public const DEFAULT_DAY = 10;
    public const DEFAULT_MAX_SHARE = 50;
    public const DEFAULT_HALF_POINT = 240000;
    /** Reminder days are limited to 28, so every month has one */
    public const DAY_MAX = 28;
    public const PAUSE_MAX = 120;
    public const WEIGHT_MAX = 1000;
    public const RECENT = 10;

    public const QUOTE_API = 'https://query1.finance.yahoo.com/v8/finance/chart/';
    public const QUOTE_API_TIMEOUT = 8;
    /** Yahoo answers 429 to requests without a browser-like user agent */
    public const QUOTE_API_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    public const PATTERN_SYMBOL = '/^[A-Za-z0-9.^=-]{1,32}$/';
    /** Prices quoted in minor units of a currency, e.g. pence on the London Stock Exchange */
    public const MINOR_CURRENCIES = ['GBp' => 'GBP', 'GBX' => 'GBP', 'ZAc' => 'ZAR', 'ILA' => 'ILS'];

    /**
     * Hint how much more to invest into a fund that is below its 52-week high: [minimal drop, multiplier], the first
     * matching row is used
     */
    public const DIP_HINTS = [
        [0.20, 1.5],
        [0.10, 1.25],
        [0.05, 1.1],
        [0.00, 1.0],
    ];



    /** @var array<string, float> conversion rates of this request, "FROM:TO" => rate */
    private static array $rates = [];



    /**
     * @throws FinanceRateException
     */
    public static function convert(float $amount, string $from, string $to): float {
        if ($from === $to) {
            return $amount;
        }

        $key = "$from:$to";
        if (!isset(self::$rates[$key])) {
            $rate = Finance::rate($from, $to);
            if (is_null($rate)) {
                throw new FinanceRateException($from, $to);
            }

            self::$rates[$key] = $rate;
        }

        return $amount * self::$rates[$key];
    }

    /**
     * Fraction (0 - 1) of the surplus that is recommended to be invested at the given balance
     */
    public static function share(float $balance, float $maxShare, float $halfPoint): float {
        if ($balance <= 0 || $halfPoint <= 0) {
            return 0;
        }

        return $maxShare / 100 * $balance / ($balance + $halfPoint);
    }

    /**
     * @return string YYYY-MM shifted by $months
     */
    public static function shiftMonth(string $month, int $months): string {
        return date('Y-m', strtotime("$month-01 $months months"));
    }



    // Settings
    /**
     * @param string $currency used for halfPoint when the settings do not exist yet
     * @return array FinanceInvestSettings
     */
    public static function settings(string $currency): array {
        $stored = json_decode(Setting::fromName(self::SETTING)?->toString() ?? '', associative: true);

        return array_merge([
            'enabled' => true,
            'day' => self::DEFAULT_DAY,
            'maxShare' => self::DEFAULT_MAX_SHARE,
            'halfPoint' => self::DEFAULT_HALF_POINT,
            'currency' => $currency,
            'balance' => null,
            'pausedUntil' => null,
            'handledMonth' => null,
        ], is_array($stored) ? $stored : []);
    }

    public static function saveSettings(array $settings): void {
        $value = json_encode($settings);
        $setting = Setting::fromName(self::SETTING);

        if (is_null($setting)) {
            // Created with the value directly, saving a freshly inserted model again would insert it twice
            Setting::fromName(self::SETTING, true, $value, [PROPERTY_EDITABLE => false]);
            return;
        }

        $setting->value = $value;
        $setting->save();
    }



    // Plan
    /**
     * Month of the newest reminder that is due by $today: the current month once its reminder day has come, the
     * previous month before that
     */
    public static function reminderMonth(array $settings, string $today): string {
        $month = substr($today, 0, 7);

        return intval(substr($today, 8, 2)) >= $settings['day']
            ? $month
            : self::shiftMonth($month, -1);
    }

    /**
     * Balance set by the user, adjusted by the income, expenses and investments that happened since: dated on or after
     * the day the balance was set and recorded after it was set. Older records are already part of the set balance.
     *
     * @return float|null null when the balance was never set
     * @throws FinanceRateException
     */
    public static function balance(array $settings, string $currency): ?float {
        $balance = $settings['balance'];
        if (!is_array($balance)) {
            return null;
        }

        $since = Query::infer(
            '`date` >= ? AND `created_at` > ?',
            $balance['date'], $balance['setAt']
        );

        [$income, $expenses] = self::flows(FinanceTransaction::all(where: $since), $currency);

        $invested = 0;
        foreach (FinanceInvestment::all(where: $since) as $investment) {
            $invested += self::convert($investment->amount, $investment->currency, $currency);
        }

        return self::convert($balance['amount'], $balance['currency'], $currency) + $income - $expenses - $invested;
    }

    /**
     * @param array<FinanceTransaction> $transactions
     * @return array{float, float} [income, expenses] in $currency
     * @throws FinanceRateException
     */
    public static function flows(array $transactions, string $currency): array {
        $types = [];
        if (!empty($transactions)) {
            foreach (FinanceCategory::all() as $category) {
                $types[$category->id] = $category->type;
            }
        }

        $income = 0;
        $expenses = 0;

        foreach ($transactions as $transaction) {
            // amount * rate is the amount in its base currency (remembered rate), same as in /summary
            $amount = self::convert($transaction->getBaseAmount(), $transaction->baseCurrency, $currency);

            if (($types[$transaction->categoryId] ?? null) === FinanceCategory::TYPE_INCOME) {
                $income += $amount;
            } else {
                $expenses += $amount;
            }
        }

        return [$income, $expenses];
    }

    /**
     * @return array<FinanceFund> funds that are not deleted, ordered by weight
     */
    public static function activeFunds(): array {
        $factory = FinanceFund::getDescription()->getFactory();

        return $factory->allExecute(
            $factory->allQuery(where: '`deleted_at` IS NULL')
                ->order('`weight`', 'DESC')
                ->order('`name`')
        );
    }

    /**
     * Splits $amount (whole units) between the funds. Each fund should hold weight / sum of weights of all the money
     * invested so far plus $amount, the amount is split by how much each fund is missing to its share.
     *
     * @param array<FinanceFund> $funds
     * @param array<int, float> $invested fund id => money invested so far, in the same currency as $amount
     * @return array<array{fundId: int, amount: float}>
     */
    public static function allocate(float $amount, array $funds, array $invested): array {
        $funds = array_values(array_filter($funds, fn(FinanceFund $x) => $x->weight > 0));
        $weights = array_sum(array_map(fn(FinanceFund $x) => $x->weight, $funds));

        if (empty($funds) || $amount <= 0) {
            return array_map(fn(FinanceFund $x) => ['fundId' => $x->id, 'amount' => 0], $funds);
        }

        $total = $amount;
        foreach ($funds as $fund) {
            $total += $invested[$fund->id] ?? 0;
        }

        $missing = [];
        foreach ($funds as $fund) {
            $missing[$fund->id] = max(0, $fund->weight / $weights * $total - ($invested[$fund->id] ?? 0));
        }

        // the missing amounts sum up to at least $amount, they are 0 only when nothing was invested in any fund
        $sum = array_sum($missing);

        $allocation = [];
        $remainder = $amount;
        $largest = null;

        foreach ($funds as $fund) {
            $share = $sum > 0
                ? $missing[$fund->id] / $sum
                : $fund->weight / $weights;

            $allocation[$fund->id] = floor($amount * $share);
            $remainder -= $allocation[$fund->id];

            if (is_null($largest) || $allocation[$fund->id] > $allocation[$largest]) {
                $largest = $fund->id;
            }
        }

        // whole units lost by rounding down go to the largest part
        $allocation[$largest] += $remainder;

        return array_map(
            fn(FinanceFund $x) => ['fundId' => $x->id, 'amount' => $allocation[$x->id]],
            $funds
        );
    }

    /**
     * @return array FinanceInvestState (widgets/finance/finance.d.ts)
     * @throws FinanceRateException
     * @throws PDOException when the investing tables do not exist
     */
    public static function state(string $currency, string $today): array {
        $settings = self::settings($currency);
        $funds = self::activeFunds();

        $reminderMonth = self::reminderMonth($settings, $today);
        $sourceMonth = self::shiftMonth($reminderMonth, -1);

        // income and expenses of the month before the reminder
        [$income, $expenses] = self::flows(
            FinanceTransaction::all(where: Query::infer(
                '`date` >= ? AND `date` <= ?',
                "$sourceMonth-01", date('Y-m-t', strtotime("$sourceMonth-01"))
            )),
            $currency
        );

        $surplus = $income - $expenses;
        $balance = self::balance($settings, $currency);
        $halfPoint = self::convert($settings['halfPoint'], $settings['currency'], $currency);
        $share = self::share($balance ?? 0, $settings['maxShare'], $halfPoint);
        $amount = max(0, floor($surplus * $share));

        // money invested into each fund so far, deleted funds included so they can be shown in the recent list
        $invested = [];
        $investments = FinanceInvestment::all();
        foreach ($investments as $investment) {
            $invested[$investment->fundId] = ($invested[$investment->fundId] ?? 0)
                + self::convert($investment->amount, $investment->currency, $currency);
        }

        usort($investments, fn(FinanceInvestment $a, FinanceInvestment $b) =>
            [$b->date, $b->id] <=> [$a->date, $a->id]
        );
        $recent = array_slice($investments, 0, self::RECENT);

        $missing = array_values(array_diff(
            array_unique(array_map(fn(FinanceInvestment $x) => $x->fundId, $recent)),
            array_map(fn(FinanceFund $x) => $x->id, $funds)
        ));

        $deletedFunds = empty($missing)
            ? []
            : FinanceFund::all(where: Query::infer(
                '`id_finance_fund` IN ('. implode(', ', array_fill(0, count($missing), '?')) .')',
                ...$missing
            ));

        $isPaused = !is_null($settings['pausedUntil']) && $reminderMonth < $settings['pausedUntil'];
        $isHandled = !is_null($settings['handledMonth']) && $reminderMonth <= $settings['handledMonth'];

        return [
            'currency' => $currency,
            'settings' => $settings,
            'balance' => is_null($balance) ? null : round($balance, 2),
            'halfPoint' => round($halfPoint, 2),
            'reminderMonth' => $reminderMonth,
            'sourceMonth' => $sourceMonth,
            'income' => round($income, 2),
            'expenses' => round($expenses, 2),
            'surplus' => round($surplus, 2),
            'share' => $share,
            'amount' => $amount,
            'allocation' => self::allocate($amount, $funds, $invested),
            'isDue' => $settings['enabled'] && !$isPaused && !$isHandled && $amount >= 1,
            'isPaused' => $isPaused,
            'funds' => [...$funds, ...$deletedFunds],
            'invested' => array_map(
                fn($fundId, $total) => ['fundId' => $fundId, 'total' => round($total, 2)],
                array_keys($invested),
                $invested
            ),
            'recent' => $recent,
        ];
    }



    // Quotes
    /**
     * Only the quotes of today are used, older ones are deleted
     */
    public static function clearQuotes(): void {
        $description = FinanceQuote::getDescription();
        Sql::delete($description->getTable())
            ->where(Query::infer('`date` < ?', Sql::dateNow()))
            ->run($description->getConnection());
    }

    /**
     * Price of the symbol, fetched at most once a day
     *
     * @return FinanceQuote|null null when it could not be fetched
     */
    public static function quote(string $symbol): ?FinanceQuote {
        $today = Sql::dateNow();
        $cached = FinanceQuote::first(where: Query::infer(
            '`symbol` = ? AND `date` = ?',
            $symbol, $today
        ));

        if (!is_null($cached)) {
            return $cached;
        }

        $quote = self::fetchQuote($symbol);
        if (is_null($quote)) {
            return null;
        }

        $quote->date = $today;
        $quote->createdAt = Sql::datetimeNow();

        try {
            $quote->save();
        } catch (PDOException) {
            // A concurrent request has cached the same quote in the meantime (unique key), the fetched one is still valid
        }

        return $quote;
    }

    /**
     * GET https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d
     *   -> { "chart": { "result": [{ "meta": { "currency": "EUR", "regularMarketPrice": 172.86, ... },
     *        "indicators": { "quote": [{ "close": [143.2, null, ...] }] } }] } }
     *
     * Unofficial endpoint without an API key, it may change or start to refuse requests.
     */
    private static function fetchQuote(string $symbol): ?FinanceQuote {
        $curl = curl_init(self::QUOTE_API . rawurlencode($symbol) .'?'. http_build_query([
            'range' => '1y',
            'interval' => '1d',
        ]));

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => self::QUOTE_API_TIMEOUT,
            CURLOPT_USERAGENT => self::QUOTE_API_USER_AGENT,
        ]);

        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        if (!is_string($body) || $status !== 200) {
            return null;
        }

        $result = json_decode($body, associative: true)['chart']['result'][0] ?? null;
        $price = $result['meta']['regularMarketPrice'] ?? null;
        $currency = $result['meta']['currency'] ?? null;

        if ((!is_int($price) && !is_float($price)) || $price <= 0 || !is_string($currency)) {
            return null;
        }

        $closes = array_filter(
            $result['indicators']['quote'][0]['close'] ?? [],
            fn($x) => is_int($x) || is_float($x)
        );
        $high = max([$price, ...$closes]);

        $metaHigh = $result['meta']['fiftyTwoWeekHigh'] ?? null;
        if (is_int($metaHigh) || is_float($metaHigh)) {
            $high = max($high, $metaHigh);
        }

        $divisor = 1;
        if (isset(self::MINOR_CURRENCIES[$currency])) {
            $currency = self::MINOR_CURRENCIES[$currency];
            $divisor = 100;
        }

        if (!Finance::isCurrency($currency)) {
            return null;
        }

        $quote = new FinanceQuote();
        $quote->symbol = $symbol;
        $quote->price = round($price / $divisor, 6);
        $quote->high = round($high / $divisor, 6);
        $quote->currency = $currency;

        return $quote;
    }

    /**
     * @return array FinanceFundQuote (widgets/finance/finance.d.ts)
     */
    public static function quoteOf(FinanceFund $fund, string $currency): array {
        $quote = self::quote($fund->symbol);
        if (is_null($quote)) {
            return [
                'fundId' => $fund->id,
                'symbol' => $fund->symbol,
                'isAvailable' => false,
            ];
        }

        $drop = $quote->high > 0
            ? max(0, 1 - $quote->price / $quote->high)
            : 0;

        $multiplier = 1.0;
        foreach (self::DIP_HINTS as [$minimum, $hint]) {
            if ($drop >= $minimum) {
                $multiplier = $hint;
                break;
            }
        }

        try {
            $rate = self::convert(1, $currency, $quote->currency);
        } catch (FinanceRateException) {
            $rate = null;
        }

        return [
            'fundId' => $fund->id,
            'symbol' => $fund->symbol,
            'isAvailable' => true,
            'price' => $quote->price,
            'high' => $quote->high,
            'currency' => $quote->currency,
            'drop' => round($drop, 4),
            'multiplier' => $multiplier,
            'rate' => $rate,
        ];
    }
}
