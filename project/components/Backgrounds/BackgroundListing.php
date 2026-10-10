<?php

namespace project\components\Backgrounds;

use components\layout\Pagination\PaginationFactory;
use core\fs\variants\ImageVariant;
use core\locale\LexiconUnit;
use core\url\Url;
use core\view\Component;
use core\view\View;
use models\fs\File;
use project\Backgrounds;
use project\controllers\BackgroundController;
use project\models\Background\BackgroundSet;
use project\Tabby;

class BackgroundListing extends Component {
    use LexiconUnit;

    public const LEXICON_GROUP = BackgroundController::LEXICON_GROUP;



    protected PaginationFactory $paginationFactory;

    /** @var array<File> */
    protected array $images;

    /** @var array<array{ id: int, name: string, count: int }> */
    protected array $sets;

    protected int $countAll;
    protected int $countNone;



    /**
     * @param bool $isSynchronized false when the OS directories of the backgrounds are not well defined
     */
    public function __construct(
        protected BackgroundController $controller,
        protected BackgroundSet|string|null $filter,
        protected bool $isSynchronized
    ) {
        parent::__construct();

        $this->setLexiconGroup(self::LEXICON_GROUP);
        $this->setTitle($this->tr('Background images'));
        $this->addPropertyHtmlElements([
            Tabby::createApi()
        ]);

        $this->paginationFactory = new PaginationFactory(
            new BackgroundPaginationBehavior($this->filter),
            File::getDescription(),
            Backgrounds::PORTION_SIZE
        );

        $this->images = $this->paginationFactory->getModels();
        $this->sets = Backgrounds::setsWithCounts();
        $this->countAll = Backgrounds::countImages(Backgrounds::imagesQuery());
        $this->countNone = Backgrounds::countImages(Backgrounds::imagesQuery(Backgrounds::FILTER_NONE));
    }



    public function getFilterValue(): string {
        return Backgrounds::filterToQuery($this->filter) ?? '';
    }

    public function getPagination(): View {
        return $this->paginationFactory->createPagination();
    }

    public function getDashboardUrl(): Url {
        return Backgrounds::createDashboardUrl();
    }

    public function getImageUrl(File $image): Url {
        return $this->controller->createImageUrl($image, $this->filter);
    }

    public function getThumbnailUrl(File $image): Url {
        return $image->getUrl(ImageVariant::resolve(
            Backgrounds::TRANSFORMER_THUMBNAIL,
            Backgrounds::THUMBNAIL_WIDTH,
            Backgrounds::THUMBNAIL_HEIGHT
        ));
    }
}
