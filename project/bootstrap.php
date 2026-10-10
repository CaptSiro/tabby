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
use project\Backgrounds;
use project\components\Frame;
use project\controllers\BackgroundController;
use project\controllers\CalendarController;
use project\controllers\FinanceController;
use project\Finance;
use project\models\Background\BackgroundSet;
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

// GET ?set= (id of a background set, all images without it) &force (copy the images again)
$router->use('/random-background', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);

    $start = microtime(true);
    $query = $request->getUrl()->getQuery();

    if (!Backgrounds::synchronize($query->exists('force'))) {
        $response->sendMessage(
            $lexicon->tr('Backgrounds directory is not well defined'),
            HttpCode::SE_INTERNAL_SERVER_ERROR
        );
    }

    $set = null;
    $setId = $query->get(Backgrounds::QUERY_SET);
    if (!is_null($setId) && $setId !== '') {
        Backgrounds::requireDatabase($response);

        $set = Backgrounds::isId($setId)
            ? BackgroundSet::fromId(intval($setId))
            : null;

        if (is_null($set)) {
            $response->sendMessage(
                $lexicon->tr('Background set not found'),
                HttpCode::CE_NOT_FOUND
            );
        }
    }

    $image = Backgrounds::randomImage($set);

    if (is_null($image)) {
        $response->sendMessage(
            is_null($set)
                ? $lexicon->tr('Backgrounds directory is empty')
                : $lexicon->tr('Background set is empty'),
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

$router->bind('/backgrounds', new BackgroundController());



Navigator::register(PageFactory::getInstance());

$router->bind(
    Navigator::mount(new StaticMount(RouteChasmEnvironment::MOUNT_DEFAULT_CONTEXT), '/'),
    new Navigator()
);
