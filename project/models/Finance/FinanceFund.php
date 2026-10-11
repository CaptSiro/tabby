<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Serialized as FinanceFund { id, name, symbol, weight, isDeleted } (widgets/finance/finance.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('finance_fund')]
class FinanceFund extends Model {
    #[Column('id_finance_fund', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column(type: Column::TYPE_STRING)]
    public string $name;

    /** Yahoo Finance symbol, e.g. VWCE.DE */
    #[Column(type: Column::TYPE_STRING)]
    public string $symbol;

    /** Target share of the invested money, relative to the other funds */
    #[Column(type: Column::TYPE_DOUBLE)]
    public float $weight;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;

    #[Column('updated_at', Column::TYPE_DATETIME)]
    public string $updatedAt;

    #[Column('deleted_at', Column::TYPE_DATETIME, nullable: true)]
    public ?string $deletedAt;



    public function isDeleted(): bool {
        return !is_null($this->deletedAt ?? null);
    }



    // Model
    public function getHumanIdentifier(): string {
        return $this->name;
    }

    public function jsonSerialize(): object {
        return (object) [
            'id' => $this->id,
            'name' => $this->name,
            'symbol' => $this->symbol,
            'weight' => $this->weight,
            'isDeleted' => $this->isDeleted(),
        ];
    }
}
