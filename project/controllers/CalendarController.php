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
use DateTime;
use PDOException;
use project\Finance;
use project\models\Calendar\CalendarEvent;

class CalendarController extends Router {
    use LexiconUnit;
    
    public const LEXICON_GROUP = 'calendar';
    
    
    
    public function __construct() {
        parent::__construct();
        $this->setLexiconGroup(self::LEXICON_GROUP);
    }
    
    
    
    protected function messageInvalidHttpMethod(): string {
        return $this->tr('Invalid HTTP method');
    }
    
    protected function messageEventNotFound(): string {
        return $this->tr('Event not found');
    }
    
    protected function onBind(RouteNode $bindingPoint): void {
        parent::onBind($bindingPoint);
        
        $router = $bindingPoint->getRouter();
        
        // Calendar widget (client: project/widgets/calendar/calendar.js, types: calendar.d.ts, tables: project/sql/003-calendar.sql)
        // Datetimes are in local time of the client, so the client sends where its day starts
        
        // GET: Lets the widget check whether the API can be used
        $router->use('/health', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }
            
            $messageCalendarDatabaseNotInit = $this->tr('Calendar database is not initialized');
            try {
                CalendarEvent::count();
            } catch (PDOException) {
                $response->sendMessage($messageCalendarDatabaseNotInit, HttpCode::SE_SERVICE_UNAVAILABLE);
            }
            
            $response->json([
                'available' => true
            ]);
        });
        
        $router->use('/events', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            $labelMaxLength = 250;
            
            switch ($request->getHttpMethod()) {
                // GET ?from=YYYY-MM-DD (start of the client's today)
                case HttpMethod::GET: {
                    // 1. Validate from, 400 with message.
                    $from = $request->getUrl()->getQuery()->get('from');
                    $messageDateExc = $this->tr('From must be a valid date in YYYY-MM-DD format');
                    if (!Finance::isDate($from)) {
                        $response->sendMessage($messageDateExc, HttpCode::CE_BAD_REQUEST);
                    }
                    
                    // 2. Load events of today and later (done or not) and unfinished events before today, in chronological order.
                    $factory = CalendarEvent::getDescription()->getFactory();
                    $events = $factory->allExecute(
                        $factory->allQuery(where: Query::infer('`datetime` >= ? OR `is_done` = 0', "$from 00:00:00"))
                            ->order('`datetime`')
                            ->order('`id_calendar_event`')
                    );
                    
                    $response->json($events);
                    break;
                }
                
                // POST (create) / PUT (update), JSON body CalendarEventDraft { id?, label, datetime, isDone }
                case HttpMethod::POST:
                case HttpMethod::PUT: {
                    // 1. Decode JSON body, 400 when it is not a JSON object.
                    $fields = Finance::body($request, $response);
                    $label = $fields->get('label');
                    $datetime = $fields->get('datetime');
                    $isDone = $fields->get('isDone', false);
                    
                    // 2. Validate label, datetime and isDone, 400 with message.
                    $messageLabelExc = $this->crt('Label must be a non-empty text of at most {} characters');
                    if (!Finance::isText($label, $labelMaxLength)) {
                        $response->sendMessage(
                            $messageLabelExc->format((string) $labelMaxLength),
                            HttpCode::CE_BAD_REQUEST
                        );
                    }
                    
                    $parsed = is_string($datetime)
                        ? DateTime::createFromFormat('!Y-m-d H:i:s', $datetime)
                        : false;
                    
                    $messageDatetimeExc = $this->tr('Datetime must be a valid date and time in YYYY-MM-DD HH:MM:SS format');
                    if ($parsed === false || $parsed->format('Y-m-d H:i:s') !== $datetime || intval($parsed->format('Y')) < 1000) {
                        $response->sendMessage($messageDatetimeExc, HttpCode::CE_BAD_REQUEST);
                    }
                    
                    $messageDoneExc = $this->tr('IsDone must be a boolean');
                    if (!is_bool($isDone)) {
                        $response->sendMessage($messageDoneExc, HttpCode::CE_BAD_REQUEST);
                    }
                    
                    // 3. POST: new event. PUT: event by body.id, 404 when missing.
                    $now = Sql::datetimeNow();
                    
                    $messageEventNotFound = $this->messageEventNotFound();
                    if ($request->getHttpMethod() === HttpMethod::POST) {
                        $event = new CalendarEvent();
                        $event->createdAt = $now;
                    } else {
                        $id = $fields->get('id');
                        $event = is_int($id)
                            ? CalendarEvent::fromId($id)
                            : null;
                        
                        if (is_null($event)) {
                            $response->sendMessage($messageEventNotFound, HttpCode::CE_NOT_FOUND);
                        }
                    }
                    
                    // 4. Set label, datetime, isDone, save and respond with the event.
                    $event->label = trim($label);
                    $event->datetime = $datetime;
                    $event->isDone = $isDone;
                    $event->updatedAt = $now;
                    $event->save();
                    
                    $response->json($event);
                    break;
                }
                
                // DELETE ?id=
                case HttpMethod::DELETE: {
                    // 1. Load event by id, 404 when missing.
                    $id = $request->getUrl()->getQuery()->get('id');
                    $event = is_string($id) && ctype_digit($id)
                        ? CalendarEvent::fromId(intval($id))
                        : null;
                    
                    $messageEventNotFound = $this->messageEventNotFound();
                    if (is_null($event)) {
                        $response->sendMessage($messageEventNotFound, HttpCode::CE_NOT_FOUND);
                    }
                    
                    // 2. Delete and respond 204 without body.
                    $event->delete();
                    $response->sendStatus(HttpCode::S_NO_CONTENT);
                    break;
                }
                
                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                }
            }
        });
    }
}