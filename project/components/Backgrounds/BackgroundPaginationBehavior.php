<?php

namespace project\components\Backgrounds;

use components\layout\Pagination\DefaultPaginationFactoryBehavior;
use components\layout\Pagination\Pagination;
use components\layout\Pagination\PaginationControl;
use components\layout\Pagination\PaginationFactoryBehavior;
use core\App;
use core\database\sql\query\SelectQuery;
use core\RouteChasmEnvironment;
use project\Backgrounds;
use project\models\Background\BackgroundSet;

/**
 * Filtered background images ordered by id
 */
class BackgroundPaginationBehavior implements PaginationFactoryBehavior {
    use DefaultPaginationFactoryBehavior;

    protected Pagination $pagination;



    public function __construct(
        protected BackgroundSet|string|null $filter
    ) {
        $this->pagination = new PaginationControl();
    }



    public function getSelectQuery(): SelectQuery {
        return Backgrounds::imagesQuery($this->filter)
            ->order('`id_fs_file`');
    }

    /**
     * Invalid portions in the url fall back to the first page
     */
    public function getPortion(): int {
        $portion = App::getInstance()
            ->getRequest()
            ->getUrl()
            ->getQuery()
            ->get(RouteChasmEnvironment::QUERY_PORTION);

        return Backgrounds::isId($portion)
            ? intval($portion)
            : 1;
    }
}
