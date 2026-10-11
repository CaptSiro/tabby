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
use core\view\PageView;
use PDOException;
use project\components\Finance\FinanceMovementsPage;
use project\Finance;
use project\FinanceInvest;
use project\FinanceMovements;
use project\FinanceRateException;
use project\models\Finance\FinanceCategory;
use project\models\Finance\FinanceFund;
use project\models\Finance\FinanceInvestment;
use project\models\Finance\FinanceQuote;
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

        // GET ?currency=&type=&category=&order=&month=&p= Page of all money movements (components/Finance), the page
        // reads the query itself and loads the movements from /movements and /months
        $router->use('/', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            $response->render(PageView::fromComponent(new FinanceMovementsPage()));
        });

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

            // listed movements include investments, selecting all their columns fails before 006-finance-movements.sql
            $messageDatabaseOutdated = $this->tr('Finance database is not up to date, execute project/sql/005-finance-invest.sql and 006-finance-movements.sql');
            try {
                FinanceInvestment::first();
            } catch (PDOException) {
                $response->sendMessage($messageDatabaseOutdated, HttpCode::SE_SERVICE_UNAVAILABLE);
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
        
        // GET ?month=YYYY-MM&currency=XXX&recent=N, recent are the N movements changed last
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
            
            $messageRecentExc = $this->crt('Recent must be a whole number between 0 and {}');            if (!is_string($recent) || !ctype_digit($recent) || intval($recent) > Finance::RECENT_MAX) {
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
            
            // 5. Load the movements (transactions and investments) changed last, not only of the month.
            $recentMovements = FinanceMovements::recent($recent);

            // 6. Load categories and funds that are not deleted, plus deleted ones referenced by the totals or recent
            //    movements.
            $catalog = FinanceMovements::catalog($recentMovements);
            $categories = FinanceMovements::withReferenced(
                $catalog['categories'],
                array_keys($sums),
                FinanceCategory::class,
                'id_finance_category'
            );

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
                'funds' => $catalog['funds'],
                'recent' => $recentMovements,
            ]);
        });

        // GET ?currency=XXX&type=&category=&order=&month=YYYY-MM&p=N -> FinanceMovementPage, shared logic lives in
        // project\FinanceMovements
        $router->use('/movements', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            // 1. Validate the query, 400 with message. Empty values are the same as missing ones.
            $query = $request->getUrl()->getQuery();
            $currency = $query->get('currency');
            $type = $query->get('type') ?: null;
            $category = $query->get('category') ?: null;
            $order = $query->get('order') ?: FinanceMovements::ORDER_DATE_DESC;
            $month = $query->get('month') ?: null;
            $page = $query->get('p') ?: '1';

            $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
            if (!Finance::isCurrency($currency)) {
                $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
            }

            $messageTypeException = $this->crt('Type must be one of: {}');
            if (!is_null($type) && !in_array($type, FinanceMovements::TYPES, true)) {
                $response->sendMessage(
                    $messageTypeException->format(implode(', ', FinanceMovements::TYPES)),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            // a category id means a fund id for investments
            $messageCategoryExc = $this->tr('Category must be an id and requires a type');
            if (!is_null($category) && (is_null($type) || !is_string($category) || !ctype_digit($category) || strlen($category) > 9)) {
                $response->sendMessage($messageCategoryExc, HttpCode::CE_BAD_REQUEST);
            }

            $messageOrderExc = $this->crt('Order must be one of: {}');
            if (!in_array($order, FinanceMovements::ORDERS, true)) {
                $response->sendMessage(
                    $messageOrderExc->format(implode(', ', FinanceMovements::ORDERS)),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            $messageMonthException = $this->tr('Month must be in YYYY-MM format');
            if (!is_null($month) && !Finance::isMonth($month)) {
                $response->sendMessage($messageMonthException, HttpCode::CE_BAD_REQUEST);
            }

            $messagePageExc = $this->tr('Page must be a whole number greater than 0');
            if (!is_string($page) || !ctype_digit($page) || strlen($page) > 9 || intval($page) < 1) {
                $response->sendMessage($messagePageExc, HttpCode::CE_BAD_REQUEST);
            }

            // 2. Load the page of the movements, with a month also its totals per category and fund. 502 when an
            //    exchange rate cannot be fetched.
            $messageRateExc = $this->crt('Exchange rate {} could not be fetched');
            try {
                $result = FinanceMovements::page(
                    $type,
                    is_null($category) ? null : intval($category),
                    $month,
                    $order,
                    $currency,
                    intval($page)
                );

                $breakdown = is_null($month)
                    ? null
                    : FinanceMovements::breakdown($month, $currency);
            } catch (FinanceRateException $exception) {
                $response->sendMessage(
                    $messageRateExc->format("$exception->from -> $exception->to"),
                    HttpCode::SE_BAD_GATEWAY
                );
            }

            // 3. Respond with FinanceMovementPage, categories and funds include the deleted ones that are referenced.
            $response->json([
                ...$result,
                ...FinanceMovements::catalog($result['movements'], $breakdown ?? []),
                'currency' => $currency,
                'breakdown' => $breakdown,
            ]);
        });

        // GET ?currency=XXX&from=YYYY-MM&to=YYYY-MM -> FinanceMonthTotals[] of every month in the range
        $router->use('/months', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            // 1. Validate currency and the range (at most MONTHS_MAX months), 400 with message.
            $query = $request->getUrl()->getQuery();
            $currency = $query->get('currency');
            $from = $query->get('from');
            $to = $query->get('to');

            $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
            if (!Finance::isCurrency($currency)) {
                $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
            }

            $messageRangeExc = $this->crt('From and to must be months in YYYY-MM format, at most {} months apart');
            if (
                !Finance::isMonth($from)
                || !Finance::isMonth($to)
                || FinanceMovements::countMonths($from, $to) < 1
                || FinanceMovements::countMonths($from, $to) > FinanceMovements::MONTHS_MAX
            ) {
                $response->sendMessage(
                    $messageRangeExc->format((string) FinanceMovements::MONTHS_MAX),
                    HttpCode::CE_BAD_REQUEST
                );
            }

            // 2. Respond with the totals, 502 when an exchange rate cannot be fetched.
            $messageRateExc = $this->crt('Exchange rate {} could not be fetched');
            try {
                $response->json(FinanceMovements::months($from, $to, $currency));
            } catch (FinanceRateException $exception) {
                $response->sendMessage(
                    $messageRateExc->format("$exception->from -> $exception->to"),
                    HttpCode::SE_BAD_GATEWAY
                );
            }
        });

        // Investing plan, shared logic lives in project\FinanceInvest

        // GET ?currency=XXX&today=YYYY-MM-DD -> FinanceInvestState
        // PUT, JSON body FinanceInvestSettingsDraft -> FinanceInvestState
        $router->use('/invest', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            $method = $request->getHttpMethod();

            if ($method !== HttpMethod::GET && $method !== HttpMethod::PUT) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            // 1. Validate currency and today (default: today of the server), 400 with message.
            $query = $request->getUrl()->getQuery();
            $currency = $query->get('currency');
            $today = $query->get('today', Sql::dateNow());

            $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
            if (!Finance::isCurrency($currency)) {
                $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
            }

            $messageDateExc = $this->tr('Date must be a valid date in YYYY-MM-DD format');
            if (!Finance::isDate($today)) {
                $response->sendMessage($messageDateExc, HttpCode::CE_BAD_REQUEST);
            }

            // 2. Check that the investing tables exist, 503 when 005-finance-invest.sql was not executed.
            $messageDatabaseNotInit = $this->tr('Investing tables are not initialized, execute project/sql/005-finance-invest.sql');
            try {
                FinanceFund::count();
                FinanceInvestment::count();
                FinanceQuote::count();
            } catch (PDOException) {
                $response->sendMessage($messageDatabaseNotInit, HttpCode::SE_SERVICE_UNAVAILABLE);
            }

            // 3. PUT: validate and save the changed settings, the fields that are not sent are kept.
            if ($method === HttpMethod::PUT) {
                $fields = Finance::body($request, $response);
                $settings = FinanceInvest::settings($currency);
                // exists() is false for null values, pausedUntil: null resumes the reminders
                $sent = $fields->toArray();

                if (array_key_exists('enabled', $sent)) {
                    $enabled = $fields->get('enabled');
                    $messageEnabledExc = $this->tr('Enabled must be true or false');
                    if (!is_bool($enabled)) {
                        $response->sendMessage($messageEnabledExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $settings['enabled'] = $enabled;
                }

                if (array_key_exists('day', $sent)) {
                    $day = $fields->get('day');
                    $messageDayExc = $this->crt('Reminder day must be a whole number between 1 and {}');
                    if (!is_int($day) || $day < 1 || $day > FinanceInvest::DAY_MAX) {
                        $response->sendMessage(
                            $messageDayExc->format((string) FinanceInvest::DAY_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    $settings['day'] = $day;
                }

                if (array_key_exists('maxShare', $sent)) {
                    $maxShare = $fields->get('maxShare');
                    $messageMaxShareExc = $this->tr('Maximal investing share must be a number greater than 0 and at most 100');
                    if ((!is_int($maxShare) && !is_float($maxShare)) || $maxShare <= 0 || $maxShare > 100) {
                        $response->sendMessage($messageMaxShareExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $settings['maxShare'] = round($maxShare, 2);
                }

                // amounts are in the requested currency, settings remember it
                if (array_key_exists('halfPoint', $sent)) {
                    $halfPoint = $fields->get('halfPoint');
                    $messageHalfPointExc = $this->crt('Half point must be a number greater than 0 and at most {}');
                    if ((!is_int($halfPoint) && !is_float($halfPoint)) || $halfPoint <= 0 || $halfPoint > Finance::AMOUNT_MAX) {
                        $response->sendMessage(
                            $messageHalfPointExc->format((string) Finance::AMOUNT_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    $settings['halfPoint'] = round($halfPoint, 2);
                    $settings['currency'] = $currency;
                }

                // the balance is set as of now, records made from now on adjust it
                if (array_key_exists('balance', $sent)) {
                    $balance = $fields->get('balance');
                    $messageBalanceExc = $this->crt('Balance must be a number between -{} and {}');
                    if ((!is_int($balance) && !is_float($balance)) || abs($balance) > Finance::AMOUNT_MAX) {
                        $response->sendMessage(
                            $messageBalanceExc->format((string) Finance::AMOUNT_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    $settings['balance'] = [
                        'amount' => round($balance, 2),
                        'currency' => $currency,
                        'date' => $today,
                        'setAt' => Sql::datetimeNow(),
                    ];
                }

                // first month whose reminder is shown again, null resumes the reminders
                if (array_key_exists('pausedUntil', $sent)) {
                    $pausedUntil = $fields->get('pausedUntil');
                    $messagePausedUntilExc = $this->tr('Paused until must be null or a month in YYYY-MM format');
                    if (!is_null($pausedUntil) && !Finance::isMonth($pausedUntil)) {
                        $response->sendMessage($messagePausedUntilExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $settings['pausedUntil'] = $pausedUntil;
                }

                FinanceInvest::saveSettings($settings);
            }

            // 4. Respond with FinanceInvestState, 502 when an exchange rate cannot be fetched.
            $messageRateExc = $this->crt('Exchange rate {} could not be fetched');
            try {
                $response->json(FinanceInvest::state($currency, $today));
            } catch (FinanceRateException $exception) {
                $response->sendMessage(
                    $messageRateExc->format("$exception->from -> $exception->to"),
                    HttpCode::SE_BAD_GATEWAY
                );
            }
        });

        // GET list, POST create / PUT update (JSON body FinanceFund), DELETE ?id=
        $router->use('/funds', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            $messageFundNotFound = $this->tr('Fund not found');

            switch ($request->getHttpMethod()) {
                case HttpMethod::GET: {
                    $response->json(FinanceInvest::activeFunds());
                    break;
                }

                case HttpMethod::POST:
                case HttpMethod::PUT: {
                    // 1. Decode JSON body, 400 when it is not a JSON object.
                    $fields = Finance::body($request, $response);
                    $name = $fields->get('name');
                    $symbol = $fields->get('symbol');
                    $weight = $fields->get('weight');

                    // 2. Validate name, symbol and weight, 400 with message.
                    $messageNameException = $this->crt('Name must be a non-empty text of at most {} characters');
                    if (!Finance::isText($name, Finance::NAME_MAX_LENGTH)) {
                        $response->sendMessage(
                            $messageNameException->format((string) Finance::NAME_MAX_LENGTH),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    $messageSymbolExc = $this->tr('Symbol must be a Yahoo Finance symbol, e.g. VWCE.DE');
                    if (!is_string($symbol) || preg_match(FinanceInvest::PATTERN_SYMBOL, trim($symbol)) !== 1) {
                        $response->sendMessage($messageSymbolExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageWeightExc = $this->crt('Weight must be a number greater than 0 and at most {}');
                    if ((!is_int($weight) && !is_float($weight)) || $weight <= 0 || $weight > FinanceInvest::WEIGHT_MAX) {
                        $response->sendMessage(
                            $messageWeightExc->format((string) FinanceInvest::WEIGHT_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    // 3. POST: new fund. PUT: fund by body.id, 404 when missing or deleted.
                    $now = Sql::datetimeNow();

                    if ($request->getHttpMethod() === HttpMethod::POST) {
                        $fund = new FinanceFund();
                        $fund->createdAt = $now;
                    } else {
                        $id = $fields->get('id');
                        $fund = is_int($id)
                            ? FinanceFund::fromId($id)
                            : null;

                        if (is_null($fund) || $fund->isDeleted()) {
                            $response->sendMessage($messageFundNotFound, HttpCode::CE_NOT_FOUND);
                        }
                    }

                    // 4. Save and respond with the fund.
                    $fund->name = trim($name);
                    $fund->symbol = strtoupper(trim($symbol));
                    $fund->weight = round($weight, 2);
                    $fund->updatedAt = $now;
                    $fund->save();

                    $response->json($fund);
                    break;
                }

                case HttpMethod::DELETE: {
                    // 1. Load fund by id, 404 when missing or already deleted.
                    $id = $request->getUrl()->getQuery()->get('id');
                    $fund = is_string($id) && ctype_digit($id)
                        ? FinanceFund::fromId(intval($id))
                        : null;

                    if (is_null($fund) || $fund->isDeleted()) {
                        $response->sendMessage($messageFundNotFound, HttpCode::CE_NOT_FOUND);
                    }

                    // 2. Soft delete, so old investments keep their fund.
                    $fund->deletedAt = $fund->updatedAt = Sql::datetimeNow();
                    $fund->save();

                    $response->sendStatus(HttpCode::S_NO_CONTENT);
                    break;
                }

                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                }
            }
        });

        // POST, JSON body FinanceInvestmentDraft { date, currency, month, parts: [{ fundId, amount }] }
        // PUT, JSON body FinanceInvestment
        // DELETE ?id=
        $router->use('/investments', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();

            switch ($request->getHttpMethod()) {
                case HttpMethod::POST: {
                    // 1. Decode JSON body, 400 when it is not a JSON object.
                    $fields = Finance::body($request, $response);
                    $date = $fields->get('date');
                    $currency = $fields->get('currency');
                    $month = $fields->get('month');
                    $parts = $fields->get('parts');

                    // 2. Validate, 400 with message. Parts with amount 0 are skipped.
                    $messageDateExc = $this->tr('Date must be a valid date in YYYY-MM-DD format');
                    if (!Finance::isDate($date)) {
                        $response->sendMessage($messageDateExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
                    if (!Finance::isCurrency($currency)) {
                        $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageMonthException = $this->tr('Month must be in YYYY-MM format');
                    if (!is_null($month) && !Finance::isMonth($month)) {
                        $response->sendMessage($messageMonthException, HttpCode::CE_BAD_REQUEST);
                    }

                    $messagePartsExc = $this->tr('Parts must be a list of { fundId, amount }');
                    if (!is_array($parts) || !array_is_list($parts)) {
                        $response->sendMessage($messagePartsExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageFundNotFound = $this->tr('Fund not found');
                    $messageAmountNumberExc = $this->crt('Amount must be at least 0 and at most {}');
                    $investments = [];
                    $now = Sql::datetimeNow();

                    foreach ($parts as $part) {
                        // nested JSON objects are decoded as stdClass
                        $fundId = is_object($part) ? ($part->fundId ?? null) : null;
                        $amount = is_object($part) ? ($part->amount ?? null) : null;

                        if (!is_int($amount) && !is_float($amount)) {
                            $response->sendMessage($messagePartsExc, HttpCode::CE_BAD_REQUEST);
                        }

                        $amount = round($amount, 2);
                        if ($amount < 0 || $amount > Finance::AMOUNT_MAX) {
                            $response->sendMessage(
                                $messageAmountNumberExc->format((string) Finance::AMOUNT_MAX),
                                HttpCode::CE_BAD_REQUEST
                            );
                        }

                        if ($amount == 0) {
                            continue;
                        }

                        $fund = is_int($fundId)
                            ? FinanceFund::fromId($fundId)
                            : null;

                        if (is_null($fund) || $fund->isDeleted()) {
                            $response->sendMessage($messageFundNotFound, HttpCode::CE_BAD_REQUEST);
                        }

                        $investment = new FinanceInvestment();
                        $investment->fundId = $fund->id;
                        $investment->date = $date;
                        $investment->amount = $amount;
                        $investment->currency = $currency;
                        $investment->createdAt = $now;
                        $investment->updatedAt = $now;
                        $investments[] = $investment;
                    }

                    $messageNothingExc = $this->tr('At least one amount must be greater than 0');
                    if (empty($investments)) {
                        $response->sendMessage($messageNothingExc, HttpCode::CE_BAD_REQUEST);
                    }

                    // 3. Save the investments.
                    foreach ($investments as $investment) {
                        $investment->save();
                    }

                    // 4. Recording the investments of a reminder handles it.
                    if (!is_null($month)) {
                        $settings = FinanceInvest::settings($currency);
                        if (is_null($settings['handledMonth']) || $settings['handledMonth'] < $month) {
                            $settings['handledMonth'] = $month;
                            FinanceInvest::saveSettings($settings);
                        }
                    }

                    $response->json($investments);
                    break;
                }

                // PUT, JSON body FinanceInvestment { id, fundId, date, amount, currency }
                case HttpMethod::PUT: {
                    // 1. Decode JSON body, 400 when it is not a JSON object.
                    $fields = Finance::body($request, $response);
                    $id = $fields->get('id');
                    $fundId = $fields->get('fundId');
                    $date = $fields->get('date');
                    $amount = $fields->get('amount');
                    $currency = $fields->get('currency');

                    // 2. Load the investment, 404 when missing.
                    $investment = is_int($id)
                        ? FinanceInvestment::fromId($id)
                        : null;

                    $messageInvestmentNotFound = $this->tr('Investment not found');
                    if (is_null($investment)) {
                        $response->sendMessage($messageInvestmentNotFound, HttpCode::CE_NOT_FOUND);
                    }

                    // 3. Validate, 400 with message.
                    $fund = is_int($fundId)
                        ? FinanceFund::fromId($fundId)
                        : null;

                    $messageFundNotFound = $this->tr('Fund not found');
                    if (is_null($fund) || $fund->isDeleted()) {
                        $response->sendMessage($messageFundNotFound, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageDateExc = $this->tr('Date must be a valid date in YYYY-MM-DD format');
                    if (!Finance::isDate($date)) {
                        $response->sendMessage($messageDateExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $messageAmountExc = $this->tr('Amount must be a number');
                    if (!is_int($amount) && !is_float($amount)) {
                        $response->sendMessage($messageAmountExc, HttpCode::CE_BAD_REQUEST);
                    }

                    $amount = round($amount, 2);
                    $messageAmountNumberExc = $this->crt('Amount must be greater than 0 and at most {}');
                    if ($amount <= 0 || $amount > Finance::AMOUNT_MAX) {
                        $response->sendMessage(
                            $messageAmountNumberExc->format((string) Finance::AMOUNT_MAX),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }

                    $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
                    if (!Finance::isCurrency($currency)) {
                        $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
                    }

                    // 4. Save and respond with the investment. created_at is kept, the bank balance counts the
                    //    investment by it (FinanceInvest::balance).
                    $investment->fundId = $fund->id;
                    $investment->date = $date;
                    $investment->amount = $amount;
                    $investment->currency = $currency;
                    $investment->updatedAt = Sql::datetimeNow();
                    $investment->save();

                    $response->json($investment);
                    break;
                }

                case HttpMethod::DELETE: {
                    $id = $request->getUrl()->getQuery()->get('id');
                    $investment = is_string($id) && ctype_digit($id)
                        ? FinanceInvestment::fromId(intval($id))
                        : null;

                    $messageInvestmentNotFound = $this->tr('Investment not found');
                    if (is_null($investment)) {
                        $response->sendMessage($messageInvestmentNotFound, HttpCode::CE_NOT_FOUND);
                    }

                    $investment->delete();
                    $response->sendStatus(HttpCode::S_NO_CONTENT);
                    break;
                }

                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                }
            }
        });

        // GET ?currency=XXX -> FinanceFundQuote[] of the funds that are not deleted
        $router->use('/quotes', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            $currency = $request->getUrl()->getQuery()->get('currency');
            $messageCurrencyExc = $this->tr('Currency must be a 3 letter code, e.g. CZK');
            if (!Finance::isCurrency($currency)) {
                $response->sendMessage($messageCurrencyExc, HttpCode::CE_BAD_REQUEST);
            }

            // quotes that cannot be fetched are sent with isAvailable: false, the plan works without them
            FinanceInvest::clearQuotes();

            $response->json(array_map(
                fn(FinanceFund $fund) => FinanceInvest::quoteOf($fund, $currency),
                FinanceInvest::activeFunds()
            ));
        });
    }
}