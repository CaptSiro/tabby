<?php

namespace project\controllers;

use core\communication\Request;
use core\communication\Response;
use core\http\HttpCode;
use core\http\HttpMethod;
use core\locale\LexiconUnit;
use core\route\RouteNode;
use core\route\Router;
use core\RouteChasmEnvironment;
use core\url\Url;
use core\view\PageView;
use models\fs\File;
use project\Backgrounds;
use project\components\Backgrounds\BackgroundImage;
use project\components\Backgrounds\BackgroundListing;
use project\Finance;
use project\models\Background\BackgroundSet;

class BackgroundController extends Router {
    use LexiconUnit;

    public const LEXICON_GROUP = 'backgrounds';



    public function __construct() {
        parent::__construct();
        $this->setLexiconGroup(self::LEXICON_GROUP);
    }



    public function createListingUrl(BackgroundSet|string|null $filter = null, int $portion = 1): Url {
        $url = $this->createUrl();

        if (!is_null($value = Backgrounds::filterToQuery($filter))) {
            $url->setQueryArgument(Backgrounds::QUERY_SET, $value);
        }

        if ($portion > 1) {
            $url->setQueryArgument(RouteChasmEnvironment::QUERY_PORTION, (string) $portion);
        }

        return $url;
    }

    public function createImageUrl(File $image, BackgroundSet|string|null $filter = null): Url {
        $url = $this->createUrl('/image/'. $image->id);

        if (!is_null($value = Backgrounds::filterToQuery($filter))) {
            $url->setQueryArgument(Backgrounds::QUERY_SET, $value);
        }

        return $url;
    }



    protected function messageInvalidHttpMethod(): string {
        return $this->tr('Invalid HTTP method');
    }

    protected function messageImageNotFound(): string {
        return $this->tr('Background image not found');
    }

    protected function messageSetNotFound(): string {
        return $this->tr('Background set not found');
    }

    /**
     * Responds with 404 when the value is not an id of an image in the backgrounds directory
     */
    protected function imageFromId(mixed $id, Response $response): File {
        $image = Backgrounds::isId($id)
            ? File::fromId(intval($id))
            : null;

        $messageImageNotFound = $this->messageImageNotFound();
        if (is_null($image) || !Backgrounds::isBackground($image)) {
            $response->sendMessage($messageImageNotFound, HttpCode::CE_NOT_FOUND);
        }

        return $image;
    }

    protected function onBind(RouteNode $bindingPoint): void {
        parent::onBind($bindingPoint);

        $router = $bindingPoint->getRouter();

        // Pages: components/Backgrounds, tables: project/sql/004-background-set.sql
        // Filter of the images is in the query Backgrounds::QUERY_SET (id of a set or Backgrounds::FILTER_NONE)

        // GET ?set=&p= Paginated listing of the images
        $router->use('/', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            Backgrounds::requireDatabase($response);
            $isSynchronized = Backgrounds::synchronize();
            $filter = Backgrounds::filterFromRequest($request, $response);

            $response->render(PageView::fromComponent(
                new BackgroundListing($this, $filter, $isSynchronized)
            ));
        });

        // GET ?set= Image with its sets, previous and next image are taken from the filtered images
        $router->use('/image/[id]', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            Backgrounds::requireDatabase($response);
            $image = $this->imageFromId($request->getParam()->get('id'), $response);
            $filter = Backgrounds::filterFromRequest($request, $response);

            $response->render(PageView::fromComponent(
                new BackgroundImage($this, $image, $filter)
            ));
        });

        // GET BackgroundSetSummary[] ordered by name
        $router->use('/sets', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            if ($request->getHttpMethod() !== HttpMethod::GET) {
                $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
            }

            Backgrounds::requireDatabase($response);
            $response->json(Backgrounds::setsWithCounts());
        });

        // Responds with BackgroundMembership { set, sets } where sets are all sets of the image
        $router->use('/membership', function (Request $request, Response $response) {
            $messageInvalidHttpMethod = $this->messageInvalidHttpMethod();
            Backgrounds::requireDatabase($response);

            switch ($request->getHttpMethod()) {
                // POST JSON body { image, set } adds to an existing set, { image, name } adds to the set with the name,
                // the set is created when it does not exist
                case HttpMethod::POST: {
                    // 1. Decode JSON body, 400 when it is not a JSON object.
                    $fields = Finance::body($request, $response);
                    $imageId = $fields->get('image');
                    $setId = $fields->get('set');
                    $name = $fields->get('name');

                    // 2. Load image, 404 when missing.
                    $image = $this->imageFromId(is_int($imageId) ? (string) $imageId : null, $response);

                    // 3. Load set by id (404 when missing) or by name (400 when invalid, created when missing).
                    if (!is_null($setId)) {
                        $set = is_int($setId)
                            ? BackgroundSet::fromId($setId)
                            : null;

                        $messageSetNotFound = $this->messageSetNotFound();
                        if (is_null($set)) {
                            $response->sendMessage($messageSetNotFound, HttpCode::CE_NOT_FOUND);
                        }
                    } else {
                        $messageNameExc = $this->crt('Name of the set must be a non-empty text of at most {} characters');
                        if (!Finance::isText($name, Backgrounds::SET_NAME_MAX_LENGTH)) {
                            $response->sendMessage(
                                $messageNameExc->format((string) Backgrounds::SET_NAME_MAX_LENGTH),
                                HttpCode::CE_BAD_REQUEST
                            );
                        }

                        $set = Backgrounds::findOrCreateSet(trim($name));
                    }

                    // 4. Add the image to the set and respond with the sets of the image.
                    Backgrounds::addToSet($image, $set);

                    $response->json([
                        'set' => $set,
                        'sets' => Backgrounds::setsOf($image),
                    ]);
                    break;
                }

                // DELETE ?image=&set= removes the image from the set
                case HttpMethod::DELETE: {
                    // 1. Load image and set, 404 when missing.
                    $query = $request->getUrl()->getQuery();
                    $image = $this->imageFromId($query->get('image'), $response);

                    $setId = $query->get('set');
                    $set = Backgrounds::isId($setId)
                        ? BackgroundSet::fromId(intval($setId))
                        : null;

                    $messageSetNotFound = $this->messageSetNotFound();
                    if (is_null($set)) {
                        $response->sendMessage($messageSetNotFound, HttpCode::CE_NOT_FOUND);
                    }

                    // 2. Remove the image from the set (the set is kept) and respond with the sets of the image.
                    Backgrounds::removeFromSet($image, $set);

                    $response->json([
                        'set' => $set,
                        'sets' => Backgrounds::setsOf($image),
                    ]);
                    break;
                }

                default: {
                    $response->sendMessage($messageInvalidHttpMethod, HttpCode::CE_METHOD_NOT_ALLOWED);
                }
            }
        });
    }
}
