<?php

namespace project;

use core\App;
use core\communication\Request;
use core\communication\Response;
use core\database\sql\query\Query;
use core\database\sql\query\SelectQuery;
use core\database\sql\Sql;
use core\fs\FileSystem;
use core\http\HttpCode;
use core\locale\Lexicon;
use core\url\Url;
use models\fs\Directory;
use models\fs\File;
use models\Setting\Setting;
use PDOException;
use project\models\Background\BackgroundSet;
use project\models\Background\BackgroundSetFile;

use const models\extensions\Editable\PROPERTY_EDITABLE;

/**
 * Shared logic of the background images (random background in bootstrap.php, sets in BackgroundController)
 *
 * Images are copied from the OS directories (setting SETTING_BACKGROUND_DIRECTORY_OS, separated by ';') into the file
 * system directory DIRECTORY. Sets reference the copied files (core_fs_file).
 *
 * Filter of the images is one of:
 * - null - all images
 * - FILTER_NONE - images that are not in any set
 * - BackgroundSet - images in the set
 */
class Backgrounds {
    public const DIRECTORY = 'Backgrounds';

    /** Query of the filter, the id of a set or FILTER_NONE */
    public const QUERY_SET = 'set';
    public const FILTER_NONE = 'none';

    public const SET_NAME_MAX_LENGTH = 64;
    public const PORTION_SIZE = 24;

    public const TRANSFORMER_THUMBNAIL = 'tabby-background-thumbnail';
    public const THUMBNAIL_WIDTH = 480;
    public const THUMBNAIL_HEIGHT = 270;



    public static function createDashboardUrl(): Url {
        return App::getInstance()
            ->getRequest()
            ->getDomain()
            ->createUrl();
    }

    public static function getDirectory(): Directory {
        return FileSystem::makeDirectory(FileSystem::getRoot(), self::DIRECTORY);
    }

    public static function getOsDirectories(): string {
        return Setting::fromName(
            Tabby::SETTING_BACKGROUND_DIRECTORY_OS,
            true,
            "",
            [PROPERTY_EDITABLE => true]
        )->toString();
    }

    /**
     * Copies images from the OS directories into DIRECTORY when the names of the files have changed since the last
     * synchronization (or always with $force)
     *
     * @return bool false when the OS directories are not well defined, nothing is synchronized
     */
    public static function synchronize(bool $force = false): bool {
        $osDirs = self::getOsDirectories();
        if (!Tabby::backgroundsExist($osDirs)) {
            return false;
        }

        $content = '';
        foreach (Tabby::listBackgroundFiles($osDirs) as $fileInfo) {
            $content .= $fileInfo->getFilename();
        }

        $backgrounds = self::getDirectory();
        $contentHash = hash(Tabby::HASH_ALGORITHM, $content);
        $directoryHash = Setting::fromName(Tabby::SETTING_BACKGROUND_DIRECTORY_OS_HASH);

        $isChanged = $force || is_null($directoryHash) || $directoryHash->toString() !== $contentHash;
        if ($isChanged) {
            if (is_null($directoryHash)) {
                // Created with the value directly, saving a freshly inserted model again would insert it twice
                Setting::fromName(
                    Tabby::SETTING_BACKGROUND_DIRECTORY_OS_HASH,
                    true,
                    $contentHash,
                    [PROPERTY_EDITABLE => false]
                );
            } else {
                $directoryHash->value = $contentHash;
                $directoryHash->save();
            }

            foreach (Tabby::listBackgroundFiles($osDirs) as $fileInfo) {
                FileSystem::storeFile($backgrounds, $fileInfo->getRealPath());
            }
        }

        return true;
    }

    /**
     * Lets the endpoints answer with 503 instead of failing on missing tables (project/sql/004-background-set.sql)
     */
    public static function isDatabaseInitialized(): bool {
        try {
            BackgroundSet::count();
            BackgroundSetFile::count();
        } catch (PDOException) {
            return false;
        }

        return true;
    }

    /**
     * Responds with 503 when the tables of the sets do not exist
     */
    public static function requireDatabase(Response $response): void {
        if (self::isDatabaseInitialized()) {
            return;
        }

        $response->sendMessage(
            Lexicon::group(Tabby::LEXICON_GROUP)->tr('Background sets database is not initialized'),
            HttpCode::SE_SERVICE_UNAVAILABLE
        );
    }



    /**
     * @param mixed $value Positive integer in a string
     */
    public static function isId(mixed $value): bool {
        return is_string($value)
            && ctype_digit($value)
            && strlen($value) <= 9
            && intval($value) > 0;
    }

    /**
     * Filter from the query QUERY_SET. Responds with 404 when the set does not exist.
     *
     * @return BackgroundSet|string|null
     */
    public static function filterFromRequest(Request $request, Response $response): BackgroundSet|string|null {
        $value = $request->getUrl()->getQuery()->get(self::QUERY_SET);
        if (is_null($value) || $value === '') {
            return null;
        }

        if ($value === self::FILTER_NONE) {
            return self::FILTER_NONE;
        }

        $set = self::isId($value)
            ? BackgroundSet::fromId(intval($value))
            : null;

        if (is_null($set)) {
            $response->sendMessage(
                Lexicon::group(Tabby::LEXICON_GROUP)->tr('Background set not found'),
                HttpCode::CE_NOT_FOUND
            );
        }

        return $set;
    }

    /**
     * @return string|null Value of the query QUERY_SET, null for all images
     */
    public static function filterToQuery(BackgroundSet|string|null $filter): ?string {
        if ($filter instanceof BackgroundSet) {
            return (string) $filter->id;
        }

        return $filter;
    }

    protected static function filterCondition(BackgroundSet|string|null $filter): ?Query {
        $memberships = '`'. BackgroundSetFile::getTable() .'`';
        $files = '`'. File::getTable() .'`';

        if ($filter instanceof BackgroundSet) {
            return Query::infer(
                "EXISTS (SELECT 1 FROM $memberships WHERE $memberships.`id_fs_file` = $files.`id_fs_file`"
                ." AND $memberships.`id_background_set` = ?)",
                $filter->id
            );
        }

        if ($filter === self::FILTER_NONE) {
            return Query::static(
                "NOT EXISTS (SELECT 1 FROM $memberships WHERE $memberships.`id_fs_file` = $files.`id_fs_file`)"
            );
        }

        return null;
    }

    /**
     * Images in DIRECTORY that match the filter, without order. A new query is created on every call.
     */
    public static function imagesQuery(BackgroundSet|string|null $filter = null): SelectQuery {
        $factory = File::getDescription()->getFactory();

        $query = $factory->allQuery()
            ->where(File::isChildOfQuery(self::getDirectory()))
            ->where(File::isTypeOfQuery(File::TYPE_IMAGE));

        if (!is_null($condition = self::filterCondition($filter))) {
            $query->where($condition);
        }

        return $query;
    }

    public static function countImages(SelectQuery $query): int {
        $factory = File::getDescription()->getFactory();

        return $factory->countExecute($query
            ->clearProjection()
            ->projection($factory->countProjection()));
    }

    public static function randomImage(BackgroundSet|string|null $filter = null): ?File {
        $factory = File::getDescription()->getFactory();

        return $factory->firstExecute(
            self::imagesQuery($filter)
                ->order('RAND()')
                ->limit(1)
        );
    }

    /**
     * Images are ordered by id, the same as in the listing
     */
    public static function adjacentImage(File $image, BackgroundSet|string|null $filter, bool $next): ?File {
        $factory = File::getDescription()->getFactory();

        return $factory->firstExecute(
            self::imagesQuery($filter)
                ->where(Query::infer($next ? '`id_fs_file` > ?' : '`id_fs_file` < ?', $image->id))
                ->order('`id_fs_file`', $next ? 'ASC' : 'DESC')
                ->limit(1)
        );
    }

    /**
     * @return int Page of the listing (starting at 1) the image is on
     */
    public static function portionOf(File $image, BackgroundSet|string|null $filter): int {
        $before = self::countImages(
            self::imagesQuery($filter)
                ->where(Query::infer('`id_fs_file` < ?', $image->id))
        );

        return intdiv(max(0, $before), self::PORTION_SIZE) + 1;
    }

    public static function isBackground(File $file): bool {
        return $file->isChildOf(self::getDirectory()) && $file->isImage();
    }



    /**
     * @return array<BackgroundSet> Ordered by name
     */
    public static function sets(): array {
        $factory = BackgroundSet::getDescription()->getFactory();

        return $factory->allExecute(
            $factory->allQuery()
                ->order('`name`')
        );
    }

    /**
     * @return array<int, int> Number of images per set id, sets without images are missing
     */
    public static function countImagesPerSet(): array {
        $memberships = '`'. BackgroundSetFile::getTable() .'`';
        $files = '`'. File::getTable() .'`';

        $records = Sql::select($memberships)
            ->projection("$memberships.`id_background_set`")
            ->projection('COUNT(*) AS `n`')
            ->join($files, "$files.`id_fs_file` = $memberships.`id_fs_file`")
            ->where(File::isChildOfQuery(self::getDirectory()))
            ->where(File::isTypeOfQuery(File::TYPE_IMAGE))
            ->group("$memberships.`id_background_set`")
            ->fetchAll(BackgroundSetFile::getDescription()->getConnection());

        $counts = [];
        foreach ($records as $record) {
            $counts[intval($record['id_background_set'])] = intval($record['n']);
        }

        return $counts;
    }

    /**
     * @return array<array{ id: int, name: string, count: int }> Ordered by name
     */
    public static function setsWithCounts(): array {
        $counts = self::countImagesPerSet();

        return array_map(fn(BackgroundSet $set) => [
            'id' => $set->id,
            'name' => $set->name,
            'count' => $counts[$set->id] ?? 0,
        ], self::sets());
    }

    /**
     * @return array<BackgroundSet> Sets the image is in, ordered by name
     */
    public static function setsOf(File $image): array {
        $factory = BackgroundSet::getDescription()->getFactory();
        $memberships = '`'. BackgroundSetFile::getTable() .'`';
        $sets = '`'. BackgroundSet::getTable() .'`';

        return $factory->allExecute(
            $factory->allQuery(where: Query::infer(
                "EXISTS (SELECT 1 FROM $memberships WHERE $memberships.`id_background_set` = $sets.`id_background_set`"
                ." AND $memberships.`id_fs_file` = ?)",
                $image->id
            ))
                ->order('`name`')
        );
    }

    /**
     * Name comparison follows the collation of the column, so it is case-insensitive
     */
    public static function setFromName(string $name): ?BackgroundSet {
        return BackgroundSet::first(where: Query::infer('`name` = ?', $name));
    }

    /**
     * @param string $name Trimmed name of at most SET_NAME_MAX_LENGTH characters
     */
    public static function findOrCreateSet(string $name): BackgroundSet {
        if (!is_null($found = self::setFromName($name))) {
            return $found;
        }

        $now = Sql::datetimeNow();

        $set = new BackgroundSet();
        $set->name = $name;
        $set->createdAt = $now;
        $set->updatedAt = $now;

        try {
            $set->save();
        } catch (PDOException $exception) {
            // A concurrent request has created the set in the meantime (unique name)
            if (!is_null($found = self::setFromName($name))) {
                return $found;
            }

            throw $exception;
        }

        return $set;
    }

    public static function isInSet(File $image, BackgroundSet $set): bool {
        return !is_null(BackgroundSetFile::first(where: Query::infer(
            '`id_background_set` = ? AND `id_fs_file` = ?',
            $set->id, $image->id
        )));
    }

    public static function addToSet(File $image, BackgroundSet $set): void {
        if (self::isInSet($image, $set)) {
            return;
        }

        $membership = new BackgroundSetFile();
        $membership->setId = $set->id;
        $membership->fileId = $image->id;
        $membership->createdAt = Sql::datetimeNow();

        try {
            $membership->save();
        } catch (PDOException $exception) {
            // A concurrent request has added the image in the meantime (unique key)
            if (self::isInSet($image, $set)) {
                return;
            }

            throw $exception;
        }
    }

    public static function removeFromSet(File $image, BackgroundSet $set): void {
        Sql::delete(BackgroundSetFile::getTable())
            ->where(Query::infer(
                '`id_background_set` = ? AND `id_fs_file` = ?',
                $set->id, $image->id
            ))
            ->limit(1)
            ->run(BackgroundSetFile::getDescription()->getConnection());
    }
}
