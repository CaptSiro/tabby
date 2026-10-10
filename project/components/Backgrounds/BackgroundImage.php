<?php

namespace project\components\Backgrounds;

use core\locale\LexiconUnit;
use core\url\Url;
use core\view\Component;
use models\fs\File;
use project\Backgrounds;
use project\controllers\BackgroundController;
use project\models\Background\BackgroundSet;
use project\Tabby;

class BackgroundImage extends Component {
    use LexiconUnit;

    public const LEXICON_GROUP = BackgroundController::LEXICON_GROUP;



    protected ?File $previous;
    protected ?File $next;



    public function __construct(
        protected BackgroundController $controller,
        protected File $image,
        protected BackgroundSet|string|null $filter
    ) {
        parent::__construct();

        $this->setLexiconGroup(self::LEXICON_GROUP);
        $this->setTitle($this->image->getFileName());
        $this->addPropertyHtmlElements([
            Tabby::createApi()
        ]);

        $this->previous = Backgrounds::adjacentImage($this->image, $this->filter, false);
        $this->next = Backgrounds::adjacentImage($this->image, $this->filter, true);
    }



    public function getImageUrl(): Url {
        return $this->image->getUrl();
    }

    public function getPreviousUrl(): ?Url {
        return is_null($this->previous)
            ? null
            : $this->controller->createImageUrl($this->previous, $this->filter);
    }

    public function getNextUrl(): ?Url {
        return is_null($this->next)
            ? null
            : $this->controller->createImageUrl($this->next, $this->filter);
    }

    /**
     * Listing with the same filter on the page the image is on
     */
    public function getListingUrl(): Url {
        return $this->controller->createListingUrl(
            $this->filter,
            Backgrounds::portionOf($this->image, $this->filter)
        );
    }

    public function getFilterLabel(): string {
        if ($this->filter instanceof BackgroundSet) {
            return $this->f($this->tr('Set: {}'), $this->filter->name);
        }

        return $this->filter === Backgrounds::FILTER_NONE
            ? $this->tr('Images without a set')
            : $this->tr('All images');
    }

    /**
     * BackgroundImageState in backgrounds.d.ts
     */
    public function getState(): array {
        return [
            'image' => $this->image->id,
            'previous' => $this->getPreviousUrl()?->toString(),
            'next' => $this->getNextUrl()?->toString(),
            'listing' => $this->getListingUrl()->toString(),
            'preload' => array_values(array_map(
                fn(File $x) => $x->getUrl()->toString(),
                array_filter([$this->previous, $this->next])
            )),
            'sets' => Backgrounds::setsOf($this->image),
            'allSets' => Backgrounds::sets(),
        ];
    }
}
