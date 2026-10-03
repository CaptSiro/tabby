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
use project\Finance;
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



// Finance widget (client: project/widgets/finance/finance.js, types: finance.d.ts, tables: project/sql/001-finance.sql)
// Shared validation and exchange rates live in project\Finance

// GET: Lets the widget check whether the API can be used
//  1. Check that the finance tables exist, 503 when the database is not initialized.
//  2. Respond { available: true }.
$router->use('/finance/health', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);

    if ($request->getHttpMethod() !== HttpMethod::GET) {
        $response->sendMessage($lexicon->tr('Invalid HTTP method'), HttpCode::CE_METHOD_NOT_ALLOWED);
    }

    try {
        FinanceCategory::count();
        FinanceTransaction::count();
        FinanceRate::count();
    } catch (PDOException) {
        $response->sendMessage(
            $lexicon->tr('Finance database is not initialized'),
            HttpCode::SE_SERVICE_UNAVAILABLE
        );
    }

    $response->json([
        'available' => true
    ]);
});

$router->use('/finance/categories', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);

    switch ($request->getHttpMethod()) {
        // 1. Load all categories that are not deleted, ordered by name.
        // 2. Respond with the list.
        case HttpMethod::GET: {
            $response->json(Finance::activeCategories());
            break;
        }

        // POST (create) / PUT (update), JSON body FinanceCategory
        case HttpMethod::POST:
        case HttpMethod::PUT: {
            // 1. Decode JSON body, 400 when it is not a JSON object.
            $fields = Finance::body($request, $response);
            $name = $fields->get('name');
            $icon = $fields->get('icon');
            $color = $fields->get('color');
            $type = $fields->get('type');

            // 2. Validate name, icon, color and type, 400 with message.
            if (!Finance::isText($name, Finance::NAME_MAX_LENGTH)) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Name must be a non-empty text of at most {} characters'), (string) Finance::NAME_MAX_LENGTH),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            if (!Finance::isText($icon, Finance::ICON_MAX_LENGTH) || preg_match(Finance::PATTERN_ICON, trim($icon)) !== 1) {
                $response->sendMessage(
                    $lexicon->tr('Icon must be a nerd font class, e.g. nf-fa-house, or a single letter'),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            if (!is_string($color) || preg_match(Finance::PATTERN_COLOR, $color) !== 1) {
                $response->sendMessage(
                    $lexicon->tr('Color must be in #rrggbb or #rrggbbaa format'),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            if (!in_array($type, FinanceCategory::TYPES, true)) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Type must be one of: {}'), implode(', ', FinanceCategory::TYPES)),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            // 3. POST: new category. PUT: category by body.id, 404 when missing or deleted.
            $now = Sql::datetimeNow();

            if ($request->getHttpMethod() === HttpMethod::POST) {
                $category = new FinanceCategory();
                $category->createdAt = $now;
            } else {
                $id = $fields->get('id');
                $category = is_int($id)
                    ? FinanceCategory::fromId($id)
                    : null;

                if (is_null($category) || $category->isDeleted()) {
                    $response->sendMessage($lexicon->tr('Category not found'), HttpCode::CE_NOT_FOUND);
                }
            }

            // 4. Set name, icon, color, type, save and respond with the category.
            $category->name = trim($name);
            $category->icon = trim($icon);
            $category->color = $color;
            $category->type = $type;
            $category->updatedAt = $now;
            $category->save();

            $response->json($category);
            break;
        }

        // DELETE ?id=
        case HttpMethod::DELETE: {
            // 1. Load category by id, 404 when missing or already deleted.
            $id = $request->getUrl()->getQuery()->get('id');
            $category = is_string($id) && ctype_digit($id)
                ? FinanceCategory::fromId(intval($id))
                : null;

            if (is_null($category) || $category->isDeleted()) {
                $response->sendMessage($lexicon->tr('Category not found'), HttpCode::CE_NOT_FOUND);
            }

            // 2. Soft delete, so old transactions keep their icon and color.
            $category->deletedAt = $category->updatedAt = Sql::datetimeNow();
            $category->save();

            // 3. Respond 204 without body.
            $response->sendStatus(HttpCode::S_NO_CONTENT);
            break;
        }

        default: {
            $response->sendMessage($lexicon->tr('Invalid HTTP method'), HttpCode::CE_METHOD_NOT_ALLOWED);
        }
    }
});

// POST, JSON body FinanceTransactionDraft { categoryId, date, amount, currency, baseCurrency, note }
$router->use('/finance/transactions', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);
    
    switch ($request->getHttpMethod()) {
        case HttpMethod::POST:
        case HttpMethod::PUT: {
            // 1. Decode JSON body, 400 when it is not a JSON object.
            $fields = Finance::body($request, $response);
            $categoryId = $fields->get('categoryId');
            $date = $fields->get('date');
            $amount = $fields->get('amount');
            $currency = $fields->get('currency');
            $baseCurrency = $fields->get('baseCurrency');
            $note = $fields->get('note', '');
            
            // 2. Validate, 400 with message.
            $category = is_int($categoryId)
                ? FinanceCategory::fromId($categoryId)
                : null;
            
            if (is_null($category) || $category->isDeleted()) {
                $response->sendMessage($lexicon->tr('Category not found'), HttpCode::CE_BAD_REQUEST);
            }
            
            if (!Finance::isDate($date)) {
                $response->sendMessage($lexicon->tr('Date must be a valid date in YYYY-MM-DD format'), HttpCode::CE_BAD_REQUEST);
            }
            
            if (!is_int($amount) && !is_float($amount)) {
                $response->sendMessage($lexicon->tr('Amount must be a number'), HttpCode::CE_BAD_REQUEST);
            }
            
            // stored as DECIMAL(14, 2)
            $amount = round($amount, 2);
            if ($amount <= 0 || $amount > Finance::AMOUNT_MAX) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Amount must be greater than 0 and at most {}'), (string) Finance::AMOUNT_MAX),
                    HttpCode::CE_BAD_REQUEST
                );
            }
            
            if (!Finance::isCurrency($currency) || !Finance::isCurrency($baseCurrency)) {
                $response->sendMessage($lexicon->tr('Currency must be a 3 letter code, e.g. CZK'), HttpCode::CE_BAD_REQUEST);
            }
            
            if (!Finance::isText($note, Finance::NOTE_MAX_LENGTH, allowEmpty: true)) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Note must be a text of at most {} characters'), (string) Finance::NOTE_MAX_LENGTH),
                    HttpCode::CE_BAD_REQUEST
                );
            }
            
            // 3. Remember the conversion rate at the time of setting, 502 when it cannot be fetched.
            $rate = Finance::rate($currency, $baseCurrency);
            if (is_null($rate)) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Exchange rate {} could not be fetched'), "$currency -> $baseCurrency"),
                    HttpCode::SE_BAD_GATEWAY
                );
            }
            
            // 4. Create the transaction, save and respond with it.
            $now = Sql::datetimeNow();
        
            if ($request->getHttpMethod() === HttpMethod::POST) {
                $transaction = new FinanceTransaction();
                $transaction->createdAt = $now;
            } else {
                $id = $fields->get('id');
                $transaction = is_int($id)
                    ? FinanceTransaction::fromId($id)
                    : null;
                
                if (is_null($transaction)) {
                    $response->sendMessage($lexicon->tr('Transaction not found'), HttpCode::CE_NOT_FOUND);
                }
            }
            
            $transaction->categoryId = $category->id;
            $transaction->date = $date;
            $transaction->amount = $amount;
            $transaction->currency = $currency;
            $transaction->baseCurrency = $baseCurrency;
            $transaction->rate = $rate;
            $transaction->note = trim($note);
            $transaction->updatedAt = $now;
            $transaction->save();
            
            $response->json($transaction);
            break;
        }
        
        case HttpMethod::DELETE: {
            $fields = Finance::body($request, $response);
            $transaction = FinanceTransaction::fromId($fields->getStrict('id'));
            $transaction->delete();
            $response->sendStatus(200);
            break;
        }
        
        default: {
            $response->sendMessage($lexicon->tr('Invalid HTTP method'), HttpCode::CE_METHOD_NOT_ALLOWED);
            break;
        }
    }
});

// GET ?month=YYYY-MM&currency=XXX&recent=N
$router->use('/finance/summary', function (Request $request, Response $response) {
    $lexicon = Lexicon::group(Tabby::LEXICON_GROUP);

    if ($request->getHttpMethod() !== HttpMethod::GET) {
        $response->sendMessage($lexicon->tr('Invalid HTTP method'), HttpCode::CE_METHOD_NOT_ALLOWED);
    }

    // 1. Validate month (default: current month), currency and recent (default: 5), 400 with message.
    $query = $request->getUrl()->getQuery();
    $month = $query->get('month', date('Y-m'));
    $currency = $query->get('currency');
    $recent = $query->get('recent', (string) Finance::RECENT_DEFAULT);

    if (!Finance::isMonth($month)) {
        $response->sendMessage($lexicon->tr('Month must be in YYYY-MM format'), HttpCode::CE_BAD_REQUEST);
    }

    if (!Finance::isCurrency($currency)) {
        $response->sendMessage($lexicon->tr('Currency must be a 3 letter code, e.g. CZK'), HttpCode::CE_BAD_REQUEST);
    }

    if (!is_string($recent) || !ctype_digit($recent) || intval($recent) > Finance::RECENT_MAX) {
        $response->sendMessage(
            Lexicon::format($lexicon->tr('Recent must be a whole number between 0 and {}'), (string) Finance::RECENT_MAX),
            HttpCode::CE_BAD_REQUEST
        );
    }

    $recent = intval($recent);

    // 2. Once per month delete cached rates older than 28 days.
    Finance::clearRateCache();

    // 3. Load transactions of the month.
    $first = "$month-01";
    $last = date('Y-m-t', strtotime($first));

    $transactions = FinanceTransaction::all(where: Query::infer(
        '`date` >= ? AND `date` <= ?',
        $first, $last
    ));

    // 4. Sum the transactions per category in the requested currency.
    //    a. amount * rate converts the amount to its base currency using the remembered rate
    //    b. when the preferred currency was changed since, the current rate converts base currency to the requested one
    $rates = [];
    $sums = [];

    foreach ($transactions as $transaction) {
        if (!isset($rates[$transaction->baseCurrency])) {
            $rate = Finance::rate($transaction->baseCurrency, $currency);
            if (is_null($rate)) {
                $response->sendMessage(
                    Lexicon::format($lexicon->tr('Exchange rate {} could not be fetched'), "$transaction->baseCurrency -> $currency"),
                    HttpCode::SE_BAD_GATEWAY
                );
            }

            $rates[$transaction->baseCurrency] = $rate;
        }

        $sums[$transaction->categoryId] = ($sums[$transaction->categoryId] ?? 0)
            + $transaction->getBaseAmount() * $rates[$transaction->baseCurrency];
    }

    // 5. Load the newest transactions overall, not only of the month.
    $recentTransactions = [];

    if ($recent > 0) {
        $factory = FinanceTransaction::getDescription()->getFactory();
        $recentTransactions = $factory->allExecute(
            $factory->allQuery()
                ->order('`date`', 'DESC')
                ->order('`id_finance_transaction`', 'DESC')
                ->limit($recent)
        );
    }

    // 6. Load categories that are not deleted, plus deleted ones referenced by the totals or recent transactions.
    $categories = Finance::activeCategories();

    $missing = array_values(array_diff(
        array_unique([
            ...array_keys($sums),
            ...array_map(fn(FinanceTransaction $x) => $x->categoryId, $recentTransactions),
        ]),
        array_map(fn(FinanceCategory $x) => $x->id, $categories)
    ));

    if (!empty($missing)) {
        $categories = [
            ...$categories,
            ...FinanceCategory::all(where: Query::infer(
                '`id_finance_category` IN ('. implode(', ', array_fill(0, count($missing), '?')) .')',
                ...$missing
            ))
        ];
    }

    // 7. Round the totals, order them by value and sum them up per category type.
    $types = [];
    foreach ($categories as $category) {
        $types[$category->id] = $category->type;
    }

    arsort($sums);

    $expenses = 0;
    $income = 0;
    $totals = [];

    foreach ($sums as $categoryId => $sum) {
        $sum = round($sum, 2);

        if ($types[$categoryId] === FinanceCategory::TYPE_INCOME) {
            $income += $sum;
        } else {
            $expenses += $sum;
        }

        $totals[] = [
            'categoryId' => $categoryId,
            'total' => $sum,
        ];
    }

    // 8. Respond with FinanceSummary.
    $response->json([
        'month' => $month,
        'currency' => $currency,
        'expenses' => round($expenses, 2),
        'income' => round($income, 2),
        'totals' => $totals,
        'categories' => $categories,
        'recent' => $recentTransactions,
    ]);
});



Navigator::register(PageFactory::getInstance());

$router->bind(
    Navigator::mount(new StaticMount(RouteChasmEnvironment::MOUNT_DEFAULT_CONTEXT), '/'),
    new Navigator()
);
