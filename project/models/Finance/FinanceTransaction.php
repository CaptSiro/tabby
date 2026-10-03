<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Serialized as FinanceTransaction { id, categoryId, date, amount, currency, baseCurrency, rate, note }
 * (widgets/finance/finance.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('finance_transaction')]
class FinanceTransaction extends Model {
    #[Column('id_finance_transaction', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column('id_finance_category', Column::TYPE_INTEGER)]
    public int $categoryId;

    /** YYYY-MM-DD, the day the money was spent */
    #[Column(type: Column::TYPE_DATE)]
    public string $date;

    /** In $currency */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $amount;

    #[Column(type: Column::TYPE_STRING)]
    public string $currency;

    /** Preferred currency at the time the record was created */
    #[Column('base_currency', Column::TYPE_STRING)]
    public string $baseCurrency;

    /** 1 $currency = $rate $baseCurrency, fixed when the record is created */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $rate;

    #[Column(type: Column::TYPE_STRING)]
    public string $note;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;

    #[Column('updated_at', Column::TYPE_DATETIME)]
    public string $updatedAt;



    /**
     * @return float Amount converted to $baseCurrency using the remembered rate
     */
    public function getBaseAmount(): float {
        return $this->amount * $this->rate;
    }



    // Model
    public function jsonSerialize(): object {
        return (object) [
            'id' => $this->id,
            'categoryId' => $this->categoryId,
            'date' => $this->date,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'baseCurrency' => $this->baseCurrency,
            'rate' => $this->rate,
            'note' => $this->note,
        ];
    }
}
