<?php

namespace project\controllers;

use core\communication\Request;
use core\communication\Response;
use core\database\sql\query\Query;
use core\database\sql\Sql;
use core\http\HttpCode;
use core\http\HttpMethod;
use core\locale\LexiconUnit;
use core\route\RouteNode;
use core\route\Router;
use PDOException;
use project\Finance;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceRate;
use project\models\Finance\FinanceTransaction;

class FinanceController extends Router {
    use LexiconUnit;
    
    public const LEXICON_GROUP = 'finance';
    
    
    public function __construct() {
        parent::__construct();
        $this->setLexiconGroup(self::LEXICON_GROUP);
    }
    
    
    
    protected function messageInvalidHttpMethod(): string {
        return $this->tr('Invalid HTTP method');
    }
    
    protected function messageCategoryNotFound(): string {
        return $this->tr('Category not found');
    }
    
    protected function messageTransactionNotFound(): string {
        return $this->tr('Transaction not found');
    }
    
    protected function onBind(RouteNode $bindingPoint): void {
        parent::onBind($bindingPoint);
        
        $router = $bindingPoint->getRouter();
        
        // Finance widget (client: project/widgets/finance/finance.js, types: finance.d.ts, tables: project/sql/001-finance.sql)
        // Shared validation and exchange rates live in project\Finance
        
        // GET: Lets the widget check whether the API can be used
        //  1. Check that the finance tables exist, 503 when the database is not initialized.
        //  2. Respond { available: true }.
        $router->use('/health', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            $messageDatabaseNotInit = $this->tr('Finance database is not initialized');
            
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }
            
            try {
                FinanceCategory::count();
                FinanceTransaction::count();
                FinanceRate::count();
            } catch (PDOException) {
                $response->sendMessage($messageDatabaseNotInit, HttpCode::SE_SERVICE_UNAVAILABLE);
            }
            
            $response->json([
                'available' => true
            ]);
        });
        
        $router->use('/categories', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->tr('Invalid HTTP method');
            
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
                    $messageNameException = $this->crt('Name must be a non-empty text of at most {} characters');
                    if (!Finance::isText($name, Finance::NAME_MAX_LENGTH)) {
                        $response->sendMessage(
                            $messageNameException->format((string) Finance::NAME_MAX_LENGTH),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }
                
                    $messageIconException = $this->tr('Icon must be a nerd font class, e.g. nf-fa-house, or a single letter');
                    if (!Finance::isText($icon, Finance::ICON_MAX_LENGTH) || preg_match(Finance::PATTERN_ICON, trim($icon)) !== 1) {
                        $response->sendMessage($messageIconException, HttpCode::CE_BAD_REQUEST);
                    }
                
                    $messageColorException = $this->tr('Color must be in #rrggbb or #rrggbbaa format');
                    if (!is_string($color) || preg_match(Finance::PATTERN_COLOR, $color) !== 1) {
                        $response->sendMessage($messageColorException, HttpCode::CE_BAD_REQUEST);
                    }
                
                    $messageTypeException = $this->crt('Type must be one of: {}');
                    if (!in_array($type, FinanceCategory::TYPES, true)) {
                        $response->sendMessage(
                            $messageTypeException->format(implode(', ', FinanceCategory::TYPES)),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }
                    
                    // 3. POST: new category. PUT: category by body.id, 404 when missing or deleted.
                    $now = Sql::datetimeNow();
                
                    $messageCategoryNotFound = $this->messageCategoryNotFound();
                    if ($request->getHttpMethod() === HttpMethod::POST) {
                        $category = new FinanceCategory();
                        $category->createdAt = $now;
                    } else {
                        $id = $fields->get('id');
                        $category = is_int($id)
                            ? FinanceCategory::fromId($id)
                            : null;
                        
                        if (is_null($category) || $category->isDeleted()) {
                            $response->sendMessage($messageCategoryNotFound, HttpCode::CE_NOT_FOUND);
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
                    
                    $messageCategoryNotFound = $this->messageCategoryNotFound();
                    if (is_null($category) || $category->isDeleted()) {
                        $response->sendMessage($messageCategoryNotFound, HttpCode::CE_NOT_FOUND);
                    }
                    
                    // 2. Soft delete, so old transactions keep their icon and color.
                    $category->deletedAt = $category->updatedAt = Sql::datetimeNow();
                    $category->save();
                    
                    // 3. Respond 204 without body.
                    $response->sendStatus(HttpCode::S_NO_CONTENT);
                    break;
                }
                
                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                }
            }
        });
        
        // POST, JSON body FinanceTransactionDraft { categoryId, date, amount, currency, baseCurrency, note }
        $router->use('/transactions', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            
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
                
                    $messageCategoryNotFound = $this->messageCategoryNotFound();
                    if (is_null($category) || $category->isDeleted()) {
                        $response->sendMessage($messageCategoryNotFound, HttpCode::CE_BAD_REQUEST);
                    }
                
                    $messageDateExc = $this->tr('Date must be a valid date in YYYY-MM-DD format');
                    if (!Finance::isDate($date)) {
                        $response->sendMessage($messageDateExc, HttpCode::CE_BAD_REQUEST);
                    }
                
                    $messageAmountExc = $this->tr('Amount must be a number');
                    if (!is_int($amount) && !is_float($amount)) {
                        $response->sendMessage($messageAmountExc, HttpCode::CE_BAD_REQUEST);
                    }
                    
                    // stored as DECIMAL(14, 2)
                    $amount = round($amount, 2);
                    $messageAmountNumberExc = $this->crt('Amount must be greater than 0 and at most {}');
                    if ($amount <= 0 || $amount > Finance::AMOUNT_MAX) {
                        $response->sendMessage(
                            $messageAmountNumberExc->format((string) Finance::AMOUNT_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }
                
                    $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
                    if (!Finance::isCurrency($currency) || !Finance::isCurrency($baseCurrency)) {
                        $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
                    }
                    
                    $messageNoteExc = $this->crt('Note must be a text of at most {} characters');
                    if (!Finance::isText($note, Finance::NOTE_MAX_LENGTH, allowEmpty: true)) {
                        $response->sendMessage(
                            $messageNoteExc->format((string) Finance::NOTE_MAX_LENGTH),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }
                    
                    // 3. Remember the conversion rate at the time of setting, 502 when it cannot be fetched.
                    $messageRateExc = $this->crt('Exchange rate {} could not be fetched');
                    $rate = Finance::rate($currency, $baseCurrency);
                    if (is_null($rate)) {
                        $response->sendMessage(
                            $messageRateExc->format("$currency -> $baseCurrency"),
                            HttpCode::SE_BAD_GATEWAY
                        );
                    }
                
                    // 4. Create the transaction, save and respond with it.
                    $now = Sql::datetimeNow();
                
                    $messageTransactionNotFound = $this->messageTransactionNotFound();
                    if ($request->getHttpMethod() === HttpMethod::POST) {
                        $transaction = new FinanceTransaction();
                        $transaction->createdAt = $now;
                    } else {
                        $id = $fields->get('id');
                        $transaction = is_int($id)
                            ? FinanceTransaction::fromId($id)
                            : null;
                        
                        if (is_null($transaction)) {
                            $response->sendMessage($messageTransactionNotFound, HttpCode::CE_NOT_FOUND);
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
                    
                    $response->setStatus(200);
                    $response->json(['message' => 'ok']);
                    break;
                }
                
                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                    break;
                }
            }
        });
        
        // GET ?month=YYYY-MM&currency=XXX&recent=N
        $router->use('/summary', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }
            
            // 1. Validate month (default: current month), currency and recent (default: 5), 400 with message.
            $query = $request->getUrl()->getQuery();
            $month = $query->get('month', date('Y-m'));
            $currency = $query->get('currency');
            $recent = $query->get('recent', (string) Finance::RECENT_DEFAULT);
            
            $messageMonthException = $this->tr('Month must be in YYYY-MM format');
            if (!Finance::isMonth($month)) {
                $response->sendMessage($messageMonthException, HttpCode::CE_BAD_REQUEST);
            }
            
            $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
            if (!Finance::isCurrency($currency)) {
                $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
            }
            
            $messageRecentExc = $this->crt('Recent must be a whole number between 0 and {}');
            if (!is_string($recent) || !ctype_digit($recent) || intval($recent) > Finance::RECENT_MAX) {
                $response->sendMessage(
                    $messageRecentExc->format((string) Finance::RECENT_MAX),
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
            
            $messageRateNotFound = $this->crt('Exchange rate {} could not be fetched');
            foreach ($transactions as $transaction) {
                if (!isset($rates[$transaction->baseCurrency])) {
                    $rate = Finance::rate($transaction->baseCurrency, $currency);
                    if (is_null($rate)) {
                        $response->sendMessage(
                            $messageRateNotFound->format("$transaction->baseCurrency -> $currency"),
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
    }
}