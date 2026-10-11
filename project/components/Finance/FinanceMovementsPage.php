<?php

namespace project\components\Finance;

use core\locale\LexiconUnit;
use core\url\Url;
use core\view\Component;
use project\Backgrounds;
use project\controllers\FinanceController;
use project\Tabby;

/**
 * All money movements of the finance widget. The page is rendered by FinanceMovementsPage.js from the query of the url
 * (FinanceMovementsQuery in widgets/finance/finance.d.ts), the movements are loaded from /finance/movements and
 * /finance/months. Rows, charts and the edit dialog are shared with the widget (widgets/finance/finance-core.js).
 */
class FinanceMovementsPage extends Component {
    use LexiconUnit;

    public const LEXICON_GROUP = FinanceController::LEXICON_GROUP;



    public function __construct() {
        parent::__construct();

        $this->setLexiconGroup(self::LEXICON_GROUP);
        $this->setTitle($this->tr('Money movements'));
        $this->addPropertyHtmlElements([
            Tabby::createApi()
        ]);
    }



    public function getDashboardUrl(): Url {
        return Backgrounds::createDashboardUrl();
    }
}
