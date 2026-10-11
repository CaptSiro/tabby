<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Daily cache of fund prices, see project\Finance::quote()
 */
#[Database(App::DATABASE)]
#[Table('finance_quote')]
class FinanceQuote extends Model {
    #[Column('id_finance_quote', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column(type: Column::TYPE_STRING)]
    public string $symbol;

    /** YYYY-MM-DD, the day the price was fetched */
    #[Column(type: Column::TYPE_DATE)]
    public string $date;

    /** In $currency */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $price;

    /** Highest price of the last 52 weeks, in $currency */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $high;

    #[Column(type: Column::TYPE_STRING)]
    public string $currency;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;
}
