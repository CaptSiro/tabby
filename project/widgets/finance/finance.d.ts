import { TabbyWidgetConfig } from "../../tabby";



export type FinanceApi = {
    /** Page of all movements, query FinanceMovementsQuery */
    page: string,
    /** GET ?currency=XXX&type=&category=&order=&month=YYYY-MM&p=N -> FinanceMovementPage */
    movements: string,
    /** GET ?currency=XXX&from=YYYY-MM&to=YYYY-MM -> FinanceMonthTotals[] (at most 60 months) */
    months: string,
    /** GET, 200 when the API can be used */
    health: string,
    /** GET list, POST create, PUT update, DELETE ?id= */
    categories: string,
    /** POST create, PUT update, DELETE (JSON body { id }) */
    transactions: string,
    /** GET ?month=YYYY-MM&currency=XXX&recent=N, recent are the N movements changed last */
    summary: string,
    /** GET ?currency=XXX&today=YYYY-MM-DD -> FinanceInvestState, PUT FinanceInvestSettingsDraft (same query) */
    invest: string,
    /** GET list, POST create, PUT update, DELETE ?id= */
    funds: string,
    /** POST FinanceInvestmentDraft, PUT FinanceInvestment, DELETE ?id= */
    investments: string,
    /** GET ?currency=XXX -> FinanceFundQuote[] */
    quotes: string,
};

declare type FinanceCategoryType = "expense" | "income";

/** Funds are the categories of investments */
declare type FinanceMovementType = FinanceCategoryType | "investment";

declare type FinanceMovementDialogProps = {
    type: FinanceMovementType,
    /** funds as categories (finance_fundCategory) for investments */
    categories: FinanceCategory[],
    /** preferred currency */
    currency: string,
    /** categoryId is the id of the fund for investments, the result is undefined when saving failed */
    submit: (draft: FinanceTransaction) => Promise<any>,
    /** resolves to a falsy value when deleting failed */
    remove?: (movement: FinanceMovement) => Promise<any>,
    /** the dialog offers adding a category when set */
    saveCategory?: (category: FinanceCategory) => Promise<FinanceCategory | undefined>,
    /** edited movement, a new one is created without it */
    movement?: FinanceMovement,
}

declare type FinanceCategory = {
    id?: number,
    name: string,
    /** nerd font icon class, e.g. nf-fa-house */
    icon: string,
    color: string,
    /** "investment" only for funds shown as categories */
    type: FinanceMovementType,
    /** deleted categories are sent only when something still references them */
    isDeleted?: boolean,
};

declare type FinanceTransactionDraft = {
    categoryId: number,
    /** YYYY-MM-DD */
    date: string,
    /** in `currency` */
    amount: number,
    currency: string,
    /** preferred currency at the time of saving, the rate is resolved against it */
    baseCurrency: string,
    note: string,
};

declare type FinanceTransaction = FinanceTransactionDraft & {
    id: number,
    /** 1 `currency` = `rate` `baseCurrency`, fixed at the time of saving (1 when the currencies match) */
    rate?: number,
};

declare type FinanceCategoryTotal = {
    categoryId: number,
    /** in the requested currency */
    total: number,
};

declare type FinanceSummary = {
    /** YYYY-MM */
    month: string,
    currency: string,
    /** sum of the month's transactions in expense categories, in `currency` */
    expenses: number,
    /** sum of the month's transactions in income categories, in `currency` */
    income: number,
    /** per category of both types */
    totals: FinanceCategoryTotal[],
    categories: FinanceCategory[],
    /** funds that are not deleted, plus deleted ones referenced by `recent` */
    funds: FinanceFund[],
    /** changed last first */
    recent: FinanceMovement[],
};

/** Transaction or investment with the type of its category */
declare type FinanceMovement =
    (FinanceTransaction & { type: FinanceCategoryType, fundId?: undefined })
    | (FinanceInvestment & { type: "investment", categoryId?: undefined, note?: undefined, baseCurrency?: undefined, rate?: undefined });

declare type FinanceMovementOrder = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

/** Query of the page of all movements, also sent to the movements endpoint */
declare type FinanceMovementsQuery = {
    /** preferred currency, amounts are ordered and summed up in it */
    currency: string,
    type?: FinanceMovementType,
    /** id of a category of the type, id of a fund for investments */
    category?: number,
    order?: FinanceMovementOrder,
    /** YYYY-MM, only the movements of the month */
    month?: string,
    /** page starting at 1 */
    p?: number,
};

declare type FinanceMovementPage = {
    currency: string,
    movements: FinanceMovement[],
    /** current page, pages past the last one fall back to it */
    page: number,
    pages: number,
    /** number of all filtered movements */
    count: number,
    /** not deleted ones, plus deleted ones referenced by `movements` or `breakdown` */
    categories: FinanceCategory[],
    funds: FinanceFund[],
    /** totals of the month per category and fund in `currency`, largest first; null without a month */
    breakdown: { type: FinanceMovementType, id: number, total: number }[] | null,
};

/** Amounts are in the requested currency */
declare type FinanceMonthTotals = {
    /** YYYY-MM */
    month: string,
    income: number,
    expenses: number,
    invested: number,
};

declare type FinanceFund = {
    id?: number,
    name: string,
    /** Yahoo Finance symbol, e.g. VWCE.DE */
    symbol: string,
    /** target share of all invested money, relative to the other funds */
    weight: number,
    /** deleted funds are sent only when recent investments still reference them */
    isDeleted?: boolean,
};

declare type FinanceInvestment = {
    id: number,
    fundId: number,
    /** YYYY-MM-DD */
    date: string,
    /** in `currency` */
    amount: number,
    currency: string,
};

declare type FinanceInvestmentDraft = {
    /** YYYY-MM-DD */
    date: string,
    currency: string,
    /** YYYY-MM, reminder that is handled by recording the investments, null when none is due */
    month: string | null,
    /** parts with amount 0 are skipped, at least one must be greater than 0 */
    parts: { fundId: number, amount: number }[],
};

/** Stored in core_setting 'finance:invest' */
declare type FinanceInvestSettings = {
    /** false when the reminders were stopped */
    enabled: boolean,
    /** day of the month (1 - 28) the reminder appears on */
    day: number,
    /** percent, the investing share approaches it but never reaches it */
    maxShare: number,
    /** balance at which the investing share is half of maxShare, in `currency` */
    halfPoint: number,
    currency: string,
    /** balance entered by the user, records dated on or after `date` and created after `setAt` adjust it */
    balance: null | {
        amount: number,
        currency: string,
        /** YYYY-MM-DD */
        date: string,
        /** YYYY-MM-DD HH:MM:SS of the server */
        setAt: string,
    },
    /** YYYY-MM, first month whose reminder is shown again */
    pausedUntil: string | null,
    /** YYYY-MM, newest reminder handled by recording investments */
    handledMonth: string | null,
};

/** Fields that are not sent are kept, amounts are in the requested currency */
declare type FinanceInvestSettingsDraft = {
    enabled: boolean,
    day: number,
    maxShare: number,
    halfPoint: number,
    /** sets the balance as of now */
    balance: number,
    /** null resumes the reminders */
    pausedUntil: string | null,
};

/** Amounts are in `currency` */
declare type FinanceInvestState = {
    currency: string,
    settings: FinanceInvestSettings,
    /** null until the user sets it */
    balance: number | null,
    /** settings.halfPoint converted to `currency` */
    halfPoint: number,
    /** YYYY-MM, newest reminder that is due by today (this month from the reminder day on, the previous before) */
    reminderMonth: string,
    /** YYYY-MM, month before reminderMonth, its surplus is invested */
    sourceMonth: string,
    income: number,
    expenses: number,
    surplus: number,
    /** fraction (0 - 1) of the surplus that is recommended to be invested */
    share: number,
    /** recommended amount, whole units */
    amount: number,
    /** recommended amount split between the active funds, whole units */
    allocation: { fundId: number, amount: number }[],
    /** shows the red dot */
    isDue: boolean,
    isPaused: boolean,
    /** active funds ordered by weight, then deleted funds referenced by `recent` */
    funds: FinanceFund[],
    /** money invested into each fund so far */
    invested: { fundId: number, total: number }[],
    /** newest first */
    recent: FinanceInvestment[],
};

declare type FinanceFundQuote = {
    fundId: number,
    symbol: string,
    /** false when the price could not be fetched, the other fields are missing */
    isAvailable: boolean,
    /** in `currency` */
    price?: number,
    /** highest price of the last 52 weeks, in `currency` */
    high?: number,
    currency?: string,
    /** fraction (0 - 1) the price is below `high` */
    drop?: number,
    /** hint how much more to invest because of the drop, 1 when there is none */
    multiplier?: number,
    /** 1 requested currency = rate `currency`, null when it could not be fetched */
    rate?: number | null,
};

declare type FinanceWidgetConfig = {
    /** monthly maximum budget in `currency` */
    target?: number,
    /** number of the movements changed last listed in the widget */
    recent?: number,
    currency?: string,
} & TabbyWidgetConfig;
