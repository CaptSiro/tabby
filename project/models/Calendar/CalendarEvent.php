<?php

namespace project\models\Calendar;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Serialized as CalendarEvent { id, label, datetime, isDone } (widgets/calendar/calendar.d.ts)
 */
#[Database(App::DATABASE)]
#[Table('calendar_event')]
class CalendarEvent extends Model {
    #[Column('id_calendar_event', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column(type: Column::TYPE_STRING)]
    public string $label;

    /** YYYY-MM-DD HH:MM:SS in local time of the client */
    #[Column(type: Column::TYPE_DATETIME)]
    public string $datetime;

    #[Column('is_done', Column::TYPE_BOOLEAN)]
    public bool $isDone;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;

    #[Column('updated_at', Column::TYPE_DATETIME)]
    public string $updatedAt;



    // Model
    public function getHumanIdentifier(): string {
        return $this->label;
    }

    public function jsonSerialize(): object {
        return (object) [
            'id' => $this->id,
            'label' => $this->label,
            'datetime' => $this->datetime,
            'isDone' => $this->isDone,
        ];
    }
}
