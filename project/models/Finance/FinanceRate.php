<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Daily cache of exchange rates, see project\Finance::rate()
 */
#[Database(App::DATABASE)]
#[Table('finance_rate')]
class FinanceRate extends Model {
    #[Column('id_finance_rate', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column('from_currency', Column::TYPE_STRING)]
    public string $from;

    #[Column('to_currency', Column::TYPE_STRING)]
    public string $to;

    /** YYYY-MM-DD, the day the rate was fetched */
    #[Column(type: Column::TYPE_DATE)]
    public string $date;

    /** 1 $from = $rate $to */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $rate;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;
}
