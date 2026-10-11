<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Money moved from the bank account to a fund. Serialized as FinanceInvestment { id, fundId, date, amount, currency }
 * (widgets/finance/finance.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('finance_investment')]
class FinanceInvestment extends Model {
    #[Column('id_finance_investment', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column('id_finance_fund', Column::TYPE_INTEGER)]
    public int $fundId;

    /** YYYY-MM-DD, the day the money was invested */
    #[Column(type: Column::TYPE_DATE)]
    public string $date;

    /** In $currency */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $amount;

    #[Column(type: Column::TYPE_STRING)]
    public string $currency;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;

    #[Column('updated_at', Column::TYPE_DATETIME)]
    public string $updatedAt;



    // Model
    public function jsonSerialize(): object {
        return (object) [
            'id' => $this->id,
            'fundId' => $this->fundId,
            'date' => $this->date,
            'amount' => $this->amount,
            'currency' => $this->currency,
        ];
    }
}
