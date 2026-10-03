<?php

namespace project\models\Finance;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Serialized as FinanceCategory { id, name, icon, color, type, isDeleted } (widgets/finance/finance.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('finance_category')]
class FinanceCategory extends Model {
    public const TYPE_EXPENSE = 'expense';
    public const TYPE_INCOME = 'income';
    public const TYPES = [self::TYPE_EXPENSE, self::TYPE_INCOME];



    #[Column('id_finance_category', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column(type: Column::TYPE_STRING)]
    public string $name;

    #[Column(type: Column::TYPE_STRING)]
    public string $icon;

    #[Column(type: Column::TYPE_STRING)]
    public string $color;

    /** One of TYPES */
    #[Column(type: Column::TYPE_STRING)]
    public string $type;

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
            'icon' => $this->icon,
            'color' => $this->color,
            'type' => $this->type,
            'isDeleted' => $this->isDeleted(),
        ];
    }
}
