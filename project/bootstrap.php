<?php

// Location locked file

use components\Admin\Admin;
use components\docs\Docs;
use core\communication\Request;
use core\communication\Response;
use core\fs\FileSystem;
use core\http\HttpCode;
use core\http\HttpMethod;
use core\locale\Lexicon;
use core\route\Path;
use core\view\PageView;
use example\components\Home;
use components\pages\PageFactory;
use components\Search\Search;
use core\actions\Assets\Assets;
use core\actions\Assets\policy\ShowExplorerPolicy;
use core\fs\FileServer;
use core\mounts\StaticMount;
use core\navigation\Navigator;
use core\RouteChasmEnvironment;
use core\database\sql\query\Query;
use core\database\sql\Sql;
use core\sideloader\SideLoader;
use models\fs\File;
use models\Setting\Setting;
use project\components\Frame;
use project\controllers\CalendarController;
use project\controllers\FinanceController;
use project\Finance;
use project\models\Calendar\CalendarEvent;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceRate;
use project\models\Finance\FinanceTransaction;
use project\Tabby;

use const models\extensions\Editable\PROPERTY_EDITABLE;

$app = routechasm_get();
$router = $app->getMainRouter();



$router->bind('/docs', Docs::getInstance());
$router->bind('/search', Search::getInstance());
$router->bind('/fs', FileServer::getInstance());
$router->bind('/import', SideLoader::getInstance()->initRouter($app));

$admin = Admin::getInstance();
$router->bind($admin->mount('/admin'), $admin);



// Order dependent
$assetDirectories = [
    project_mounted("<assets>"),
    Path::join(DIRECTORY_FRAMEWORK, 'public')
];

$router->expose('public', (new Assets($assetDirectories))
    ->setDirectoryPolicy(new ShowExplorerPolicy()));



$router->use('/', PageView::fromComponent(new Frame(false, false)));

$router->use('/random-background', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);
    
    $start = microtime(true);
    $osDirs = Setting::fromName(
        Tabby::SETTING_BACKGROUND_DIRECTORY_OS,
        true,
        "",
        [PROPERTY_EDITABLE => true]
    )->toString();
    
    if (!Tabby::backgroundsExist($osDirs)) {
        $response->sendMessage(
            $lexicon->tr('Backgrounds directory is not well defined'),
            HttpCode::SE_INTERNAL_SERVER_ERROR
        );
    }
    
    $content = '';
    foreach (Tabby::listBackgroundFiles($osDirs) as $fileInfo) {
        $content .= $fileInfo->getFilename();
    }
    
    $backgrounds = FileSystem::makeDirectory(FileSystem::getRoot(), 'Backgrounds');
    $directoryHash = Setting::fromName(
        Tabby::SETTING_BACKGROUND_DIRECTORY_OS_HASH,
        true,
        "",
        [PROPERTY_EDITABLE => false]
    );
    
    $contentHash = hash(Tabby::HASH_ALGORITHM, $content);
    if ($directoryHash->toString() !== $contentHash || $request->getUrl()->getQuery()->exists('force')) {
        $directoryHash->value = $contentHash;
        $directoryHash->save();
        
        foreach (Tabby::listBackgroundFiles($osDirs) as $fileInfo) {
            FileSystem::storeFile($backgrounds, $fileInfo->getRealPath());
        }
    }
    
    $factory = File::getDescription()
        ->getFactory();
    $image = $factory->firstExecute(
        $factory->randomQuery()
            ->where(File::isChildOfQuery($backgrounds))
            ->where(File::isTypeOfQuery(File::TYPE_IMAGE))
    );
    
    if (is_null($image)) {
        $response->sendMessage(
            $lexicon->tr('Backgrounds directory is empty'),
            HttpCode::CE_NOT_FOUND
        );
    }
    
    $response->json([
        "file" => FileServer::getInstance()
            ->createFileUrl($image),
        "timeSpent" => microtime(true) - $start,
    ]);
});

$router->bind('/finance', new FinanceController());

$router->bind('/calendar', new CalendarController());



Navigator::register(PageFactory::getInstance());

$router->bind(
    Navigator::mount(new StaticMount(RouteChasmEnvironment::MOUNT_DEFAULT_CONTEXT), '/'),
    new Navigator()
);
