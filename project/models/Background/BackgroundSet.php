<?php

namespace project\models\Background;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Serialized as BackgroundSet { id, name } (components/Backgrounds/backgrounds.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('background_set')]
class BackgroundSet extends Model {
    #[Column('id_background_set', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column(type: Column::TYPE_STRING)]
    public string $name;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;

    #[Column('updated_at', Column::TYPE_DATETIME)]
    public string $updatedAt;



    // Model
    public function getHumanIdentifier(): string {
        return $this->name;
    }

    public function jsonSerialize(): object {
        return (object) [
            'id' => $this->id,
            'name' => $this->name,
        ];
    }
}
