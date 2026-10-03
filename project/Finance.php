<?php

namespace project;

use core\collections\StrictDictionary;
use core\communication\body\DictionaryBody;
use core\communication\Request;
use core\communication\Response;
use core\database\sql\query\Query;
use core\database\sql\Sql;
use core\http\HttpCode;
use core\locale\Lexicon;
use DateTime;
use models\Setting\Setting;
use PDOException;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceRate;

use const models\extensions\Editable\PROPERTY_EDITABLE;

/**
 * Shared logic of the finance widget endpoints (see bootstrap.php)
 */
class Finance {
    /** Date (YYYY-MM-DD) of the last rate cache clearing */
    public const SETTING_RATE_CACHE_CLEARED = 'finance:rate_cache_cleared';
    public const RATE_CACHE_MAX_AGE_DAYS = 28;
    public const RATE_API = 'https://api.frankfurter.dev/v1/latest';
    public const RATE_API_TIMEOUT = 10;
    public const RATE_PRECISION = 8;

    public const NAME_MAX_LENGTH = 64;
    public const ICON_MAX_LENGTH = 64;
    public const NOTE_MAX_LENGTH = 250;
    /** Largest value of DECIMAL(14, 2) */
    public const AMOUNT_MAX = 999999999999.99;
    public const RECENT_DEFAULT = 5;
    public const RECENT_MAX = 50;

    public const PATTERN_CURRENCY = '/^[A-Z]{3}$/';
    public const PATTERN_COLOR = '/^#[0-9a-f]{6}([0-9a-f]{2})?$/i';
    public const PATTERN_ICON = '/^(:?nf-[a-z0-9_-]+)|(?:[A-Za-z])$/i';
    public const PATTERN_MONTH = '/^\d{4}-(0[1-9]|1[0-2])$/';



    /**
     * Decoded JSON object from the request body. Responds with 400 when the body is not a non-empty JSON object.
     */
    public static function body(Request $request, Response $response): StrictDictionary {
        $fields = $request
            ->body(DictionaryBody::class)
            ->getFields();

        if (empty($fields->toArray())) {
            $response->sendMessage(
                Lexicon::group(Tabby::LEXICON_GROUP)->tr('Request body must be a JSON object'),
                HttpCode::CE_BAD_REQUEST
            );
        }

        return $fields;
    }

    /**
     * @return array<FinanceCategory> Categories that are not deleted, ordered by name
     */
    public static function activeCategories(): array {
        $factory = FinanceCategory::getDescription()->getFactory();

        return $factory->allExecute(
            $factory->allQuery(where: '`deleted_at` IS NULL')
                ->order('`name`')
        );
    }

    public static function isCurrency(mixed $value): bool {
        return is_string($value) && preg_match(self::PATTERN_CURRENCY, $value) === 1;
    }

    /**
     * @param mixed $value Valid date in YYYY-MM-DD format within the range of SQL DATE
     */
    public static function isDate(mixed $value): bool {
        if (!is_string($value)) {
            return false;
        }

        $date = DateTime::createFromFormat('!Y-m-d', $value);
        return $date !== false
            && $date->format('Y-m-d') === $value
            && intval($date->format('Y')) >= 1000;
    }

    /**
     * @param mixed $value Valid month in YYYY-MM format
     */
    public static function isMonth(mixed $value): bool {
        return is_string($value)
            && preg_match(self::PATTERN_MONTH, $value) === 1
            && self::isDate($value .'-01');
    }

    /**
     * @param mixed $value Non-empty string of at most $maxLength characters after trimming
     */
    public static function isText(mixed $value, int $maxLength, bool $allowEmpty = false): bool {
        if (!is_string($value)) {
            return false;
        }

        $length = mb_strlen(trim($value));
        return ($allowEmpty || $length > 0) && $length <= $maxLength;
    }

    /**
     * Exchange rate used for conversions: 1 $from = rate $to.
     *
     * 1. Return 1.0 when $from === $to.
     * 2. Look up the rate cached today in finance_rate.
     * 3. Otherwise fetch it from the rate API and cache it (once a day per currency pair).
     *
     * @return float|null null when the rate could not be fetched, endpoints answer with 502
     */
    public static function rate(string $from, string $to): ?float {
        if ($from === $to) {
            return 1.0;
        }

        $today = Sql::dateNow();
        $cached = FinanceRate::first(where: Query::infer(
            '`from_currency` = ? AND `to_currency` = ? AND `date` = ?',
            $from, $to, $today
        ));

        if (!is_null($cached)) {
            return $cached->rate;
        }

        $rate = self::fetchRate($from, $to);
        if (is_null($rate)) {
            return null;
        }

        $cache = new FinanceRate();
        $cache->from = $from;
        $cache->to = $to;
        $cache->date = $today;
        $cache->rate = $rate;
        $cache->createdAt = Sql::datetimeNow();

        try {
            $cache->save();
        } catch (PDOException) {
            // A concurrent request has cached the same rate in the meantime (unique key), the fetched rate is still valid
        }

        return $rate;
    }

    /**
     * GET https://api.frankfurter.dev/v1/latest?base=EUR&symbols=CZK -> { "rates": { "CZK": 24.47 }, ... }
     */
    private static function fetchRate(string $from, string $to): ?float {
        $curl = curl_init(self::RATE_API .'?'. http_build_query([
            'base' => $from,
            'symbols' => $to,
        ]));

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => self::RATE_API_TIMEOUT,
        ]);

        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        if (!is_string($body) || $status !== 200) {
            return null;
        }

        $rate = json_decode($body, associative: true)['rates'][$to] ?? null;
        if ((!is_int($rate) && !is_float($rate)) || $rate <= 0) {
            return null;
        }

        return round((float) $rate, self::RATE_PRECISION);
    }

    /**
     * Runs at most once per month, the last run is remembered in setting SETTING_RATE_CACHE_CLEARED.
     *
     * Deletes cached rates older than RATE_CACHE_MAX_AGE_DAYS, so the rates of the current days are preserved.
     */
    public static function clearRateCache(): void {
        $setting = Setting::fromName(self::SETTING_RATE_CACHE_CLEARED);
        if (!is_null($setting) && str_starts_with($setting->toString(), date('Y-m'))) {
            return;
        }

        $description = FinanceRate::getDescription();
        Sql::delete($description->getTable())
            ->where(Query::infer(
                '`date` < ?',
                date('Y-m-d', strtotime('-'. self::RATE_CACHE_MAX_AGE_DAYS .' days'))
            ))
            ->run($description->getConnection());

        if (is_null($setting)) {
            // Created with the value directly, saving a freshly inserted model again would insert it twice
            Setting::fromName(
                self::SETTING_RATE_CACHE_CLEARED,
                true,
                Sql::dateNow(),
                [PROPERTY_EDITABLE => false]
            );

            return;
        }

        $setting->value = Sql::dateNow();
        $setting->save();
    }
}
