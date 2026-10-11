/*
 * Page of all money movements (FinanceMovementsPage.php). The state of the page is the query of the url
 * (FinanceMovementsQuery), rows, the ring, the catalog and the edit dialog come from widgets/finance/finance-core.js.
 */

const FINANCE_MOVEMENTS_ORDER_DEFAULT = "date-desc";
/** @type {{ value: FinanceMovementOrder, text: string }[]} */
const FINANCE_MOVEMENTS_ORDERS = [
    { value: "date-desc", text: "Newest first" },
    { value: "date-asc", text: "Oldest first" },
    { value: "amount-desc", text: "Amount: high to low" },
    { value: "amount-asc", text: "Amount: low to high" },
];
/** @type {FinanceMovementType[]} */
const FINANCE_MOVEMENTS_TYPES = [FINANCE_TYPE_EXPENSE, FINANCE_TYPE_INCOME, FINANCE_TYPE_INVESTMENT];
/** Months of the bar chart, the last one is the current month */
const FINANCE_MOVEMENTS_CHART_MONTHS = 12;
/** Page numbers shown on each side of the current page */
const FINANCE_MOVEMENTS_PAGINATION_SPREAD = 2;
const FINANCE_MOVEMENTS_PATTERN_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;



/**
 * x-init of the page
 *
 * @param {HTMLElement} root
 */
function finance_movementsPage(root) {
    new FinanceMovementsPage(root);
}

class FinanceMovementsPage {
    /** @type {HTMLElement} */
    #root;
    /** @type {HTMLElement} */
    #chart;
    /** @type {HTMLElement} */
    #filters;
    /** @type {HTMLElement} */
    #list;
    /** @type {HTMLElement} */
    #pagination;
    /** @type {HTMLInputElement} */
    #jump;

    /** @type {FinanceMovementsQuery} */
    #query;
    #catalog = new FinanceCatalog();
    /** @type {FinanceMovementPage | undefined} */
    #page;
    /** @type {FinanceMonthTotals[] | undefined} totals of the bar chart, loaded again after a change */
    #months;
    /** responses of older loads are ignored */
    #loadId = 0;



    /**
     * @param {HTMLElement} root
     */
    constructor(root) {
        this.#root = root;
        this.#chart = root.querySelector(".finance-movements-chart");
        this.#filters = root.querySelector(".finance-movements-filters");
        this.#list = root.querySelector(".finance-movements-list");
        this.#pagination = root.querySelector(".finance-movements-pagination");
        this.#jump = root.querySelector(".finance-movements-jump input");

        this.#query = FinanceMovementsPage.readQuery();

        // browsers without a month picker show a text input
        this.#jump.placeholder = "YYYY-MM";
        this.#jump.addEventListener("change", async () => {
            const month = this.#jump.value.trim();
            if (month === "") {
                return;
            }

            if (!FINANCE_MOVEMENTS_PATTERN_MONTH.test(month)) {
                await window_alert("Enter the month in YYYY-MM format", WINDOW_ALERT_SETTINGS);
                return;
            }

            this.navigate({ month });
        });

        window.addEventListener("popstate", () => {
            this.#query = FinanceMovementsPage.readQuery();
            this.load().then();
        });

        this.load().then();
    }



    /**
     * Invalid values of the url are ignored
     *
     * @return {FinanceMovementsQuery}
     */
    static readQuery() {
        const params = new URLSearchParams(location.search);
        const currency = params.get("currency") ?? "";
        const type = params.get("type");
        const category = params.get("category") ?? "";
        const order = params.get("order");
        const month = params.get("month") ?? "";
        const page = Number(params.get("p"));

        const isType = FINANCE_MOVEMENTS_TYPES.includes(type);

        return {
            currency: /^[A-Z]{3}$/.test(currency) ? currency : FINANCE_DEFAULT_CURRENCY,
            type: isType ? type : undefined,
            category: isType && /^\d{1,9}$/.test(category) ? Number(category) : undefined,
            order: FINANCE_MOVEMENTS_ORDERS.some(x => x.value === order) ? order : FINANCE_MOVEMENTS_ORDER_DEFAULT,
            month: FINANCE_MOVEMENTS_PATTERN_MONTH.test(month) ? month : undefined,
            p: Number.isInteger(page) && page > 1 ? page : undefined,
        };
    }

    /**
     * @param {FinanceMovementsQuery} query
     * @return {URLSearchParams} defaults are left out
     */
    static toSearch(query) {
        const params = new URLSearchParams();
        params.set("currency", query.currency);

        if (is(query.type)) {
            params.set("type", query.type);
        }

        if (is(query.category)) {
            params.set("category", String(query.category));
        }

        if (is(query.order) && query.order !== FINANCE_MOVEMENTS_ORDER_DEFAULT) {
            params.set("order", query.order);
        }

        if (is(query.month)) {
            params.set("month", query.month);
        }

        if (is(query.p) && query.p > 1) {
            params.set("p", String(query.p));
        }

        return params;
    }

    /**
     * @param {FinanceMovementsQuery} query
     * @return {string} url of the page with the query
     */
    static pageUrl(query) {
        return location.pathname + "?" + FinanceMovementsPage.toSearch(query).toString();
    }

    get currency() {
        return this.#query.currency;
    }

    /**
     * Changes the query, remembers it in the history and loads the movements. Filters return to the first page.
     *
     * @param {Partial<FinanceMovementsQuery>} changes undefined values remove the field
     */
    navigate(changes) {
        this.#query = {
            ...this.#query,
            p: undefined,
            ...changes,
        };

        history.pushState(null, "", FinanceMovementsPage.pageUrl(this.#query));
        this.load().then();
    }

    async load() {
        const api = finance_api();
        if (!is(api?.movements)) {
            this.#list.textContent = "Finance API is not defined";
            return;
        }

        const id = ++this.#loadId;
        this.#root.classList.add("loading");

        const url = new URL(api.movements);
        url.search = FinanceMovementsPage.toSearch(this.#query).toString();

        const [page, months] = await Promise.all([
            finance_request(url),
            is(this.#query.month) || is(this.#months)
                ? this.#months
                : finance_request(finance_url(api.months, {
                    currency: this.currency,
                    from: finance_shiftMonth(finance_currentMonth(), 1 - FINANCE_MOVEMENTS_CHART_MONTHS),
                    to: finance_currentMonth(),
                })),
        ]);

        if (id !== this.#loadId) {
            return;
        }

        this.#root.classList.remove("loading");

        if (!is(page)) {
            return;
        }

        // pages past the last one fall back to the last one
        if ((this.#query.p ?? 1) !== page.page) {
            this.#query.p = page.page > 1 ? page.page : undefined;
            history.replaceState(null, "", FinanceMovementsPage.pageUrl(this.#query));
        }

        this.#page = page;
        this.#months = months ?? undefined;
        this.#catalog.set(page.categories, page.funds);
        this.render();
    }

    /**
     * Charts and totals depend on every movement, they are loaded again
     */
    async reload() {
        this.#months = undefined;
        await this.load();
    }

    /**
     * @param {FinanceMovement} movement
     */
    async edit(movement) {
        const isChanged = await finance_openMovementEditor(this.#catalog, {
            type: movement.type,
            movement,
            currency: this.currency,
            saveCategory: category => this.saveCategory(category),
        });

        if (isChanged) {
            await this.reload();
        }
    }

    /**
     * Categories added from the dialog
     *
     * @param {FinanceCategory} category
     * @return {Promise<FinanceCategory | undefined>}
     */
    async saveCategory(category) {
        const saved = await finance_send(finance_api().categories, is(category.id) ? "PUT" : "POST", category);
        if (is(saved)) {
            this.#catalog.set([...this.#catalog.categories, saved]);
        }

        return saved;
    }



    render() {
        this.#jump.value = this.#query.month ?? "";

        if (is(this.#query.month)) {
            this.renderMonth();
        } else {
            this.renderYear();
        }

        this.renderFilters();
        this.renderList();
        this.renderPagination();
    }

    /**
     * Income vs expenses of the last months as pairs of bars, a month opens its detail
     */
    renderYear() {
        const { div, span, h2, button } = jsml;
        const months = this.#months ?? [];
        const largest = Math.max(0, ...months.flatMap(x => [x.income, x.expenses]));
        const height = value => std_percentage(largest > 0 ? value / largest : 0);

        this.#chart.textContent = "";

        const columns = months.map((totals, index) => {
            const net = totals.income - totals.expenses;
            const isYearShown = index === 0 || totals.month.endsWith("-01");

            return button({
                class: "finance-bars-month",
                type: "button",
                title: [
                    finance_formatMonth(totals.month),
                    `Income: ${finance_formatMoney(totals.income, this.currency)}`,
                    `Expenses: ${finance_formatMoney(totals.expenses, this.currency)}`,
                    `Invested: ${finance_formatMoney(totals.invested, this.currency)}`,
                    `${net < 0 ? "Net loss" : "Net"}: ${finance_formatMoney(net, this.currency)}`,
                ].join("\n"),
                onClick: () => this.navigate({ month: totals.month })
            }, [
                div("finance-bars-pair", [
                    div({ class: "finance-bar income", style: { height: height(totals.income) } }),
                    div({ class: "finance-bar expense", style: { height: height(totals.expenses) } }),
                ]),
                span("finance-bars-label", finance_formatMonth(totals.month, { month: "short" })),
                span("finance-bars-year", isYearShown ? totals.month.slice(0, 4) : " "),
            ]);
        });

        jsml_addContent(this.#chart, [
            div("finance-movements-chart-header row", [
                h2(_, `Last ${FINANCE_MOVEMENTS_CHART_MONTHS} months`),
                div("finance-legend row", [FINANCE_TYPE_INCOME, FINANCE_TYPE_EXPENSE].map(type =>
                    span("finance-legend-item " + type, [span("swatch"), FINANCE_TYPES[type].plural])
                )),
            ]),
            months.length === 0
                ? div("finance-movements-note", "Loading…")
                : div("finance-bars", [
                    span("finance-bars-scale", finance_formatMoney(largest, this.currency)),
                    div("finance-bars-months", columns),
                ]),
            span("finance-movements-note", "Click a month to see its details."),
        ]);
    }

    /**
     * Totals of the month and the ring of its categories (funds for investments) of the filtered type, expenses when
     * all types are listed
     */
    renderMonth() {
        const { div, span, h2, button } = jsml;
        const month = this.#query.month;
        const breakdown = this.#page?.breakdown ?? [];
        const type = this.#query.type ?? FINANCE_TYPE_EXPENSE;
        const sum = of => breakdown
            .filter(x => x.type === of)
            .reduce((total, x) => total + x.total, 0);

        const totals = {
            [FINANCE_TYPE_INCOME]: sum(FINANCE_TYPE_INCOME),
            [FINANCE_TYPE_EXPENSE]: sum(FINANCE_TYPE_EXPENSE),
            [FINANCE_TYPE_INVESTMENT]: sum(FINANCE_TYPE_INVESTMENT),
        };
        const net = totals[FINANCE_TYPE_INCOME] - totals[FINANCE_TYPE_EXPENSE];

        const items = breakdown.filter(x => x.type === type && x.total > 0);
        const whole = totals[type];

        const ring = finance_svg("svg", { class: "finance-ring", viewBox: "0 0 100 100" });
        finance_renderRing(ring, items.length === 0
            ? [{ color: "var(--finance-remaining)", fraction: 1 }]
            : items.map(item => {
                const category = this.#catalog.categoryOfType(item.type, item.id);
                return {
                    color: category?.color ?? "gray",
                    fraction: item.total / whole,
                    isDimmed: is(this.#query.category) && this.#query.category !== item.id,
                    title: `${category?.name ?? "Unknown"}: ${finance_formatMoney(item.total, this.currency)}`,
                };
            })
        );

        const legend = items.map(item => {
            const category = this.#catalog.categoryOfType(item.type, item.id);
            const isSelected = this.#query.category === item.id;

            return button({
                class: cls("finance-pie-legend-item", {
                    selected: isSelected,
                    dimmed: is(this.#query.category) && !isSelected
                }),
                type: "button",
                title: isSelected ? "Show all categories" : "Show only this category",
                onClick: () => this.navigate({ type, category: isSelected ? undefined : item.id })
            }, [
                finance_CategoryBadge(category),
                span("name", category?.name ?? "Unknown"),
                span("value", finance_formatMoney(item.total, this.currency)),
                span("share", (item.total / whole * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " %"),
            ]);
        });

        this.#chart.textContent = "";
        jsml_addContent(this.#chart, [
            div("finance-movements-chart-header row", [
                button({ type: "button", onClick: () => this.navigate({ month: undefined }) }, [
                    Icon("nf-fa-arrow_left", "<"),
                    " Back to year"
                ]),
                button({
                    type: "button",
                    title: "Previous month",
                    onClick: () => this.navigate({ month: finance_shiftMonth(month, -1) })
                }, Icon("nf-fa-chevron_left", "‹")),
                h2(_, finance_formatMonth(month)),
                button({
                    type: "button",
                    title: "Next month",
                    onClick: () => this.navigate({ month: finance_shiftMonth(month, 1) })
                }, Icon("nf-fa-chevron_right", "›")),
            ]),

            div("finance-month-totals row", [
                ...[FINANCE_TYPE_INCOME, FINANCE_TYPE_EXPENSE, FINANCE_TYPE_INVESTMENT].map(of =>
                    div("finance-month-total " + of, [
                        span("label", FINANCE_TYPES[of].plural),
                        span("value", finance_formatMoney(totals[of], this.currency)),
                    ])
                ),
                div("finance-month-total " + (net < 0 ? "negative" : "positive"), [
                    span("label", net < 0 ? "Net loss" : "Net"),
                    span("value", finance_formatMoney(net, this.currency)),
                ]),
            ]),

            div("finance-pie row", [
                div("finance-pie-chart", [
                    ring,
                    div("center", [
                        span("total", finance_formatMoney(whole, this.currency)),
                        span("label", FINANCE_TYPES[type].plural),
                    ]),
                ]),
                div("finance-pie-legend column", items.length === 0
                    ? span("finance-movements-note", `No ${FINANCE_TYPES[type].plural.toLowerCase()} in this month.`)
                    : legend
                ),
            ]),
        ]);
    }

    renderFilters() {
        const { div, span, button, select, option, optgroup, label } = jsml;
        const { type, category, order } = this.#query;

        const typeButtons = [undefined, ...FINANCE_MOVEMENTS_TYPES].map(of => button({
            class: cls("finance-type-filter " + (of ?? "all"), { selected: of === type }),
            type: "button",
            onClick: () => this.navigate({ type: of, category: undefined })
        }, [
            is(of) ? Icon(FINANCE_TYPES[of].icon, "") : undefined,
            is(of) ? FINANCE_TYPES[of].plural : "All",
        ]));

        // with a type only its categories are offered, choosing a category of another type sets its type
        const groups = (is(type) ? [type] : FINANCE_MOVEMENTS_TYPES).map(of => {
            const categories = this.#catalog.of(of, true);
            if (categories.length === 0) {
                return undefined;
            }

            return optgroup({ label: of === FINANCE_TYPE_INVESTMENT ? "Funds" : FINANCE_TYPES[of].plural },
                categories.map(x => option({
                    value: `${of}:${x.id}`,
                    selected: of === type && x.id === category,
                }, x.name + (x.isDeleted ? " (deleted)" : "")))
            );
        });

        const categorySelect = select({
            onChange: () => {
                if (categorySelect.value === "") {
                    this.navigate({ category: undefined });
                    return;
                }

                const [of, id] = categorySelect.value.split(":");
                this.navigate({ type: of, category: Number(id) });
            }
        }, [
            option({ value: "", selected: !is(category) }, "All categories"),
            ...groups,
        ]);

        const orderSelect = select({
            onChange: () => this.navigate({ order: orderSelect.value })
        }, FINANCE_MOVEMENTS_ORDERS.map(x => option({ value: x.value, selected: x.value === order }, x.text)));

        const count = this.#page?.count ?? 0;

        this.#filters.textContent = "";
        jsml_addContent(this.#filters, [
            div("finance-type-filters row", typeButtons),
            label("finance-filter row", [span(_, "Category"), categorySelect]),
            label("finance-filter row", [span(_, "Order"), orderSelect]),
            span("finance-movements-count", `${count} ${count === 1 ? "movement" : "movements"}`),
        ]);
    }

    renderList() {
        const movements = this.#page?.movements ?? [];
        this.#list.textContent = "";

        if (movements.length === 0) {
            this.#list.append(jsml.p("finance-movements-note", "No movements found."));
            return;
        }

        for (const movement of movements) {
            this.#list.append(finance_MovementRow(movement, this.#catalog, () => this.edit(movement)));
        }
    }

    renderPagination() {
        const { a, span } = jsml;
        const current = this.#page?.page ?? 1;
        const pages = this.#page?.pages ?? 1;

        this.#pagination.textContent = "";
        if (pages <= 1) {
            return;
        }

        const Link = (page, content, title = undefined) => a({
            href: FinanceMovementsPage.pageUrl({ ...this.#query, p: page }),
            title,
            onClick: event => {
                event.preventDefault();
                this.navigate({ p: page });
                this.#filters.scrollIntoView({ block: "start" });
            }
        }, content);

        const numbers = new Set([1, pages]);
        for (let page = current - FINANCE_MOVEMENTS_PAGINATION_SPREAD; page <= current + FINANCE_MOVEMENTS_PAGINATION_SPREAD; page++) {
            if (page >= 1 && page <= pages) {
                numbers.add(page);
            }
        }

        const items = [];
        let previous = 0;

        for (const page of [...numbers].sort((x, y) => x - y)) {
            if (page - previous > 1) {
                items.push(span("gap", "…"));
            }

            items.push(page === current
                ? span("current", String(page))
                : Link(page, String(page)));
            previous = page;
        }

        jsml_addContent(this.#pagination, [
            current > 1
                ? Link(current - 1, Icon("nf-fa-chevron_left", "‹"), "Previous page")
                : span("disabled", Icon("nf-fa-chevron_left", "‹")),
            ...items,
            current < pages
                ? Link(current + 1, Icon("nf-fa-chevron_right", "›"), "Next page")
                : span("disabled", Icon("nf-fa-chevron_right", "›")),
        ]);
    }
}
