<?php

namespace project\components;

use components\forms\Form;
use components\Lumora\Editor\Editor;
use core\App;
use core\locale\LexiconUnit;
use core\route\Path;
use core\RouteChasmEnvironment;
use core\sideloader\importers\Css\Css;
use core\sideloader\importers\Javascript\Javascript;
use core\url\Url;
use core\view\Component;

class Frame extends Component {
    use LexiconUnit;

    public const LEXICON_GROUP = 'tabby.frame';

    public static function importAssets(): void {
        Css::import(Editor::getStaticResource("editor.css"));
        Javascript::import(Editor::getStaticResource("inspector.js"));
        Form::importAssets();
    }



    public function __construct() {
        parent::__construct();

        $this->setLexiconGroup(self::LEXICON_GROUP);
        $this->setTitle($this->tr("Frame"));
    }



    public function loadWidgets(string $widgetsDirectory): void {
        foreach (glob(Path::join($widgetsDirectory, '*.js')) as $widget) {
            Javascript::import($widget);
        }

        foreach (glob(Path::join($widgetsDirectory, '*.css')) as $widget) {
            Css::import($widget);
        }
    }

    public function getImage(string $image): string {
        return App::getInstance()
            ->getRequest()
            ->getDomain()
            ->createUrl(Path::from("/public/images/$image"))
            ->toString();
    }

    public function getProjectUrl(): ?Url {
        $request = App::getInstance()
            ->getRequest();

        return $request->getDomain()->createUrl()
            ->setQuery($request->getUrl()->getQuery());
    }

    public function getProjectName(): string {
        return App::getEnvStatic()
            ->get(RouteChasmEnvironment::ENV_PROJECT) ?? 'RouteChasm';
    }
}