<?php

namespace project;

use core\database\sql\Model;
use core\database\sql\query\Query;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceFund;
use project\models\Finance\FinanceInvestment;
use project\models\Finance\FinanceTransaction;

/**
 * Money movements of the finance widget: transactions (expenses and income) and investments listed together
 * (endpoints /movements, /months and /summary in FinanceController, page components/Finance/FinanceMovementsPage)
 *
 * Every movement has a type (FinanceCategory::TYPES or TYPE_INVESTMENT) and a reference: the category of a transaction
 * or the fund of an investment. Amounts are compared in the requested currency: amount * rate is the amount of
 * a transaction in its base currency (remembered rate), investments are in their currency, both are converted to the
 * requested currency with the current rate, the same as in /summary.
 */
class FinanceMovements {
    public const TYPE_INVESTMENT = 'investment';
    public const TYPES = [FinanceCategory::TYPE_EXPENSE, FinanceCategory::TYPE_INCOME, self::TYPE_INVESTMENT];

    public const ORDER_DATE_DESC = 'date-desc';
    public const ORDER_DATE_ASC = 'date-asc';
    public const ORDER_AMOUNT_DESC = 'amount-desc';
    public const ORDER_AMOUNT_ASC = 'amount-asc';
    public const ORDERS = [self::ORDER_DATE_DESC, self::ORDER_DATE_ASC, self::ORDER_AMOUNT_DESC, self::ORDER_AMOUNT_ASC];

    public const PORTION_SIZE = 20;
    /** Longest range of the monthly totals */
    public const MONTHS_MAX = 60;

    protected const KIND_TRANSACTION = 'transaction';
    protected const KIND_INVESTMENT = 'investment';



    /**
     * One row per movement: kind, id, type, ref (category or fund id), date, base_amount (in base_currency),
     * base_currency, updated_at
     */
    protected static function union(): string {
        $transactions = '`'. FinanceTransaction::getTable() .'`';
        $categories = '`'. FinanceCategory::getTable() .'`';
        $investments = '`'. FinanceInvestment::getTable() .'`';

        return "SELECT '". self::KIND_TRANSACTION ."' AS `kind`, t.`id_finance_transaction` AS `id`, c.`type` AS `type`,"
            ." t.`id_finance_category` AS `ref`, t.`date` AS `date`, t.`amount` * t.`rate` AS `base_amount`,"
            ." t.`base_currency` AS `base_currency`, t.`updated_at` AS `updated_at`"
            ." FROM $transactions t JOIN $categories c ON c.`id_finance_category` = t.`id_finance_category`"
            ." UNION ALL"
            ." SELECT '". self::KIND_INVESTMENT ."', i.`id_finance_investment`, '". self::TYPE_INVESTMENT ."',"
            ." i.`id_finance_fund`, i.`date`, i.`amount`, i.`currency`, i.`updated_at`"
            ." FROM $investments i";
    }

    protected static function placeholders(int $count): string {
        return implode(', ', array_fill(0, $count, '?'));
    }

    protected static function fetchAll(string $sql, array $parameters = []): array {
        return FinanceTransaction::getDescription()
            ->getConnection()
            ->fetchAll(Query::infer($sql, ...$parameters));
    }

    /**
     * @param string|null $type one of TYPES, null for all
     * @param int|null $ref id of a category or fund of the type
     * @param string|null $month YYYY-MM
     * @return array{string, array} FROM clause of the filtered movements (alias m) and its parameters
     */
    protected static function from(?string $type, ?int $ref, ?string $month): array {
        $conditions = [];
        $parameters = [];

        if (!is_null($type)) {
            $conditions[] = 'm.`type` = ?';
            $parameters[] = $type;
        }

        if (!is_null($ref)) {
            $conditions[] = 'm.`ref` = ?';
            $parameters[] = $ref;
        }

        if (!is_null($month)) {
            $conditions[] = 'm.`date` >= ? AND m.`date` <= ?';
            $parameters[] = "$month-01";
            $parameters[] = date('Y-m-t', strtotime("$month-01"));
        }

        $sql = ' FROM ('. self::union() .') AS m';
        if (!empty($conditions)) {
            $sql .= ' WHERE '. implode(' AND ', $conditions);
        }

        return [$sql, $parameters];
    }

    /**
     * @return array{string, array} SQL expression of the amount of a movement in $currency and its parameters
     * @throws FinanceRateException
     */
    protected static function amountExpression(string $currency): array {
        $currencies = array_column(
            self::fetchAll('SELECT DISTINCT m.`base_currency` FROM ('. self::union() .') AS m'),
            'base_currency'
        );

        $sql = '';
        $parameters = [];

        foreach ($currencies as $baseCurrency) {
            if ($baseCurrency === $currency) {
                continue;
            }

            $sql .= ' WHEN ? THEN ?';
            $parameters[] = $baseCurrency;
            $parameters[] = FinanceInvest::convert(1, $baseCurrency, $currency);
        }

        if ($sql === '') {
            return ['m.`base_amount`', []];
        }

        return ['m.`base_amount` * CASE m.`base_currency`'. $sql .' ELSE 1 END', $parameters];
    }



    /**
     * @param string $order one of ORDERS
     * @param int $page starting at 1, pages past the last one fall back to the last one
     * @return array{movements: array, page: int, pages: int, count: int} FinanceMovement[] of the page
     * @throws FinanceRateException when ordered by amount and a rate cannot be fetched
     */
    public static function page(?string $type, ?int $ref, ?string $month, string $order, string $currency, int $page): array {
        [$from, $parameters] = self::from($type, $ref, $month);

        $count = intval(self::fetchAll('SELECT COUNT(*) AS `n`'. $from, $parameters)[0]['n'] ?? 0);
        $pages = max(1, intdiv($count + self::PORTION_SIZE - 1, self::PORTION_SIZE));
        $page = min(max(1, $page), $pages);

        $orderParameters = [];
        switch ($order) {
            case self::ORDER_DATE_ASC: {
                $orderBy = 'm.`date` ASC, m.`updated_at` ASC';
                break;
            }

            case self::ORDER_AMOUNT_DESC:
            case self::ORDER_AMOUNT_ASC: {
                [$amount, $orderParameters] = self::amountExpression($currency);
                $orderBy = $amount . ($order === self::ORDER_AMOUNT_DESC ? ' DESC' : ' ASC') .', m.`date` DESC';
                break;
            }

            default: {
                $orderBy = 'm.`date` DESC, m.`updated_at` DESC';
            }
        }

        // ties keep the same order on every page, newer records first unless the oldest are requested
        $orderBy .= $order === self::ORDER_DATE_ASC
            ? ', m.`kind`, m.`id` ASC'
            : ', m.`kind`, m.`id` DESC';

        $rows = self::fetchAll(
            'SELECT m.`kind`, m.`id`, m.`type`'. $from .' ORDER BY '. $orderBy .' LIMIT ? OFFSET ?',
            [...$parameters, ...$orderParameters, self::PORTION_SIZE, ($page - 1) * self::PORTION_SIZE]
        );

        return [
            'movements' => self::load($rows),
            'page' => $page,
            'pages' => $pages,
            'count' => $count,
        ];
    }

    /**
     * @return array FinanceMovement[] changed last, newest first
     */
    public static function recent(int $count): array {
        if ($count <= 0) {
            return [];
        }

        [$from, $parameters] = self::from(null, null, null);

        return self::load(self::fetchAll(
            'SELECT m.`kind`, m.`id`, m.`type`'. $from .' ORDER BY m.`updated_at` DESC, m.`kind`, m.`id` DESC LIMIT ?',
            [...$parameters, $count]
        ));
    }

    /**
     * @return array<array{type: string, id: int, total: float}> totals of the month per category and fund in $currency,
     * largest first
     * @throws FinanceRateException
     */
    public static function breakdown(string $month, string $currency): array {
        [$from, $parameters] = self::from(null, null, $month);

        $rows = self::fetchAll(
            'SELECT m.`type`, m.`ref`, m.`base_currency`, SUM(m.`base_amount`) AS `total`'. $from
            .' GROUP BY m.`type`, m.`ref`, m.`base_currency`',
            $parameters
        );

        $totals = [];
        foreach ($rows as $row) {
            $key = $row['type'] .':'. $row['ref'];
            $totals[$key] ??= [
                'type' => $row['type'],
                'id' => intval($row['ref']),
                'total' => 0,
            ];

            $totals[$key]['total'] += FinanceInvest::convert(floatval($row['total']), $row['base_currency'], $currency);
        }

        $totals = array_map(function (array $x) {
            $x['total'] = round($x['total'], 2);
            return $x;
        }, array_values($totals));

        usort($totals, fn(array $a, array $b) => $b['total'] <=> $a['total']);

        return $totals;
    }

    /**
     * @param string $from YYYY-MM
     * @param string $to YYYY-MM, not before $from
     * @return array<array{month: string, income: float, expenses: float, invested: float}> every month from $from to $to
     * in $currency
     * @throws FinanceRateException
     */
    public static function months(string $from, string $to, string $currency): array {
        $rows = self::fetchAll(
            "SELECT DATE_FORMAT(m.`date`, '%Y-%m') AS `month`, m.`type`, m.`base_currency`, SUM(m.`base_amount`) AS `total`"
            .' FROM ('. self::union() .') AS m'
            .' WHERE m.`date` >= ? AND m.`date` <= ?'
            .' GROUP BY `month`, m.`type`, m.`base_currency`',
            ["$from-01", date('Y-m-t', strtotime("$to-01"))]
        );

        $fields = [
            FinanceCategory::TYPE_INCOME => 'income',
            FinanceCategory::TYPE_EXPENSE => 'expenses',
            self::TYPE_INVESTMENT => 'invested',
        ];

        $months = [];
        for ($month = $from; $month <= $to; $month = FinanceInvest::shiftMonth($month, 1)) {
            $months[$month] = ['month' => $month, 'income' => 0, 'expenses' => 0, 'invested' => 0];
        }

        foreach ($rows as $row) {
            $field = $fields[$row['type']] ?? null;
            if (is_null($field) || !isset($months[$row['month']])) {
                continue;
            }

            $months[$row['month']][$field] += FinanceInvest::convert(
                floatval($row['total']),
                $row['base_currency'],
                $currency
            );
        }

        return array_values(array_map(function (array $x) {
            foreach (['income', 'expenses', 'invested'] as $field) {
                $x[$field] = round($x[$field], 2);
            }

            return $x;
        }, $months));
    }

    /**
     * @return int number of months from $from to $to including both, 0 when $to is before $from
     */
    public static function countMonths(string $from, string $to): int {
        [$fromYear, $fromMonth] = array_map('intval', explode('-', $from));
        [$toYear, $toMonth] = array_map('intval', explode('-', $to));

        return max(0, ($toYear * 12 + $toMonth) - ($fromYear * 12 + $fromMonth) + 1);
    }



    /**
     * Categories and funds that are not deleted, plus the deleted ones the movements or totals reference
     *
     * @param array $movements FinanceMovement[]
     * @param array<array{type: string, id: int}> $totals
     * @return array{categories: array<FinanceCategory>, funds: array<FinanceFund>}
     */
    public static function catalog(array $movements, array $totals = []): array {
        $categoryIds = [];
        $fundIds = [];

        foreach ($movements as $movement) {
            if ($movement['type'] === self::TYPE_INVESTMENT) {
                $fundIds[] = $movement['fundId'];
            } else {
                $categoryIds[] = $movement['categoryId'];
            }
        }

        foreach ($totals as $total) {
            if ($total['type'] === self::TYPE_INVESTMENT) {
                $fundIds[] = $total['id'];
            } else {
                $categoryIds[] = $total['id'];
            }
        }

        return [
            'categories' => self::withReferenced(
                Finance::activeCategories(),
                $categoryIds,
                FinanceCategory::class,
                'id_finance_category'
            ),
            'funds' => self::withReferenced(
                FinanceInvest::activeFunds(),
                $fundIds,
                FinanceFund::class,
                'id_finance_fund'
            ),
        ];
    }

    /**
     * @template T of Model
     * @param array<T> $models
     * @param array<int> $ids
     * @param class-string<T> $class
     * @param string $column primary key column of $class
     * @return array<T> $models followed by the models of $ids that are missing in them (deleted ones)
     */
    public static function withReferenced(array $models, array $ids, string $class, string $column): array {
        $missing = array_values(array_diff(
            array_unique($ids),
            array_map(fn(Model $x) => $x->id, $models)
        ));

        if (empty($missing)) {
            return $models;
        }

        return [
            ...$models,
            ...$class::all(where: Query::infer(
                "`$column` IN (". self::placeholders(count($missing)) .')',
                ...$missing
            ))
        ];
    }

    /**
     * @param array<array{kind: string, id: mixed, type: string}> $rows
     * @return array FinanceMovement[] in the order of the rows
     */
    protected static function load(array $rows): array {
        $ids = [self::KIND_TRANSACTION => [], self::KIND_INVESTMENT => []];
        foreach ($rows as $row) {
            $ids[$row['kind']][] = intval($row['id']);
        }

        $models = [
            self::KIND_TRANSACTION => self::byId(
                FinanceTransaction::class,
                'id_finance_transaction',
                $ids[self::KIND_TRANSACTION]
            ),
            self::KIND_INVESTMENT => self::byId(
                FinanceInvestment::class,
                'id_finance_investment',
                $ids[self::KIND_INVESTMENT]
            ),
        ];

        $movements = [];
        foreach ($rows as $row) {
            $model = $models[$row['kind']][intval($row['id'])] ?? null;
            if (is_null($model)) {
                continue;
            }

            $movements[] = [
                ...(array) $model->jsonSerialize(),
                'type' => $row['type'],
            ];
        }

        return $movements;
    }

    /**
     * @template T of Model
     * @param class-string<T> $class
     * @param array<int> $ids
     * @return array<int, T>
     */
    protected static function byId(string $class, string $column, array $ids): array {
        if (empty($ids)) {
            return [];
        }

        $models = [];
        foreach ($class::all(where: Query::infer("`$column` IN (". self::placeholders(count($ids)) .')', ...$ids)) as $model) {
            $models[$model->id] = $model;
        }

        return $models;
    }
}
