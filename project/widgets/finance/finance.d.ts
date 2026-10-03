import { TabbyWidgetConfig } from "../../tabby";



export type FinanceApi = {
    /** GET, 200 when the API can be used */
    health: string,
    /** GET list, POST create, PUT update, DELETE ?id= */
    categories: string,
    /** POST create */
    transactions: string,
    /** GET ?month=YYYY-MM&currency=XXX&recent=N */
    summary: string,
};

declare type FinanceCategoryType = "expense" | "income";

declare type FinanceTransactionDialogProps = {
    type: FinanceCategoryType,
    categories: FinanceCategory[],
    currency: string,
    submit: (draft: FinanceTransaction) => Promise<any>,
    remove?: (transaction: FinanceTransaction) => Promise<any>,
    transaction?: FinanceTransaction
}

declare type FinanceCategory = {
    id?: number,
    name: string,
    /** nerd font icon class, e.g. nf-fa-house */
    icon: string,
    color: string,
    type: FinanceCategoryType,
    /** deleted categories are sent only in a summary that still references them */
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
    /** newest first */
    recent: FinanceTransaction[],
};

declare type FinanceWidgetConfig = {
    /** monthly maximum budget in `currency` */
    target?: number,
    currency?: string,
} & TabbyWidgetConfig;
