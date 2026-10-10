<?php

namespace project\models\Background;

use core\App;
use core\database\sql\Column;
use core\database\sql\Database;
use core\database\sql\Model;
use core\database\sql\Table;

/**
 * Membership of an image (core_fs_file) in a background set
 */
#[Database(App::DATABASE)]
#[Table('background_set_file')]
class BackgroundSetFile extends Model {
    #[Column('id_background_set_file', Column::TYPE_INTEGER, isPrimaryKey: true)]
    public int $id;

    #[Column('id_background_set', Column::TYPE_INTEGER)]
    public int $setId;

    #[Column('id_fs_file', Column::TYPE_INTEGER)]
    public int $fileId;

    #[Column('created_at', Column::TYPE_DATETIME)]
    public string $createdAt;
}
