const FINANCE_BUILDER = 'finance';

// Requests, formatting, rows, the ring and the movement dialogs are shared with the page of all movements, they live
// in finance-core.js

/** Number of the movements changed last listed in the widget, configurable in the inspector */
const FINANCE_RECENT_DEFAULT = 5;
/** Must match Finance::RECENT_MAX */
const FINANCE_RECENT_MAX = 50;

const FINANCE_INVEST_DIALOG_SETTINGS = {
    ...FINANCE_DIALOG_SETTINGS,
    width: "460px",
};
/** Must match FinanceInvest::DAY_MAX */
const FINANCE_INVEST_DAY_MAX = 28;
/** Must match FinanceInvest::PAUSE_MAX */
const FINANCE_INVEST_PAUSE_MAX = 120;
/** Size of the share curve in the inspector, in the units of its view box */
const FINANCE_CURVE_WIDTH = 240;
const FINANCE_CURVE_HEIGHT = 120;



/**
 * Same formula as FinanceInvest::share()
 *
 * @param {number} balance
 * @param {number} maxShare percent
 * @param {number} halfPoint
 * @return {number} fraction (0 - 1) of the surplus that is recommended to be invested
 */
function finance_investShare(balance, maxShare, halfPoint) {
    if (balance <= 0 || halfPoint <= 0) {
        return 0;
    }

    return maxShare / 100 * balance / (balance + halfPoint);
}

/**
 * @param {number} fraction
 * @return {string} e.g. 21.4 %
 */
function finance_formatShare(fraction) {
    return (fraction * 100).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " %";
}

/**
 * Graph of the investing share by balance: the curve, its limit (max share), the half point and the current balance.
 *
 * @param {FinanceInvestState} state
 * @return {SVGElement}
 */
function finance_ShareCurve(state) {
    const { maxShare } = state.settings;
    const { halfPoint, balance, currency } = state;
    const width = FINANCE_CURVE_WIDTH;
    const height = FINANCE_CURVE_HEIGHT;
    // the share never reaches the max, the top of the graph is the max
    const top = 14;
    const bottom = height - 16;
    const xMax = Math.max(4 * halfPoint, 1.2 * (balance ?? 0));

    const x = value => value / xMax * width;
    const y = share => bottom - share / (maxShare / 100) * (bottom - top);

    const svg = finance_svg("svg", {
        class: "finance-curve",
        viewBox: `0 0 ${width} ${height}`,
    });

    const points = [];
    for (let i = 0; i <= 60; i++) {
        const value = xMax * i / 60;
        points.push(`${x(value).toFixed(1)},${y(finance_investShare(value, maxShare, halfPoint)).toFixed(1)}`);
    }

    const text = (content, attributes) => {
        const element = finance_svg("text", attributes);
        element.textContent = content;
        return element;
    };

    const halfShare = maxShare / 200;

    svg.append(
        // limit of the curve
        finance_svg("line", { class: "limit", x1: 0, y1: top, x2: width, y2: top }),
        text(`${maxShare} % (never reached)`, { class: "label", x: width, y: top - 2, "text-anchor": "end" }),
        // axis
        finance_svg("line", { class: "axis", x1: 0, y1: bottom, x2: width, y2: bottom }),
        // half point
        finance_svg("line", { class: "guide", x1: x(halfPoint), y1: bottom, x2: x(halfPoint), y2: y(halfShare) }),
        finance_svg("line", { class: "guide", x1: 0, y1: y(halfShare), x2: x(halfPoint), y2: y(halfShare) }),
        text(finance_formatShare(halfShare), { class: "label", x: 2, y: y(halfShare) - 2 }),
        text(finance_formatMoney(halfPoint, currency), { class: "label", x: x(halfPoint), y: height - 2, "text-anchor": "middle" }),
        finance_svg("polyline", { class: "curve", points: points.join(" ") }),
    );

    if (is(balance)) {
        const share = finance_investShare(balance, maxShare, halfPoint);
        const cx = x(Math.max(0, balance));

        svg.append(
            finance_svg("circle", { class: "current", cx, cy: y(share), r: 3.5 }),
            text("you: " + finance_formatShare(share), {
                class: "label current-label",
                x: cx,
                y: y(share) + 15,
                "text-anchor": cx > width * 0.7 ? "end" : "start",
            })
        );
    }

    return svg;
}



class FinanceWidget extends TabbyWidget {
    /** @type {FinanceWidgetConfig} */
    #config;
    /** @type {HTMLElement} */
    #display;
    /** @type {HTMLElement | undefined} */
    #element;
    /** @type {HTMLElement} */
    #chart;
    /** @type {HTMLElement} */
    #center;
    /** @type {SVGElement} */
    #ring;
    /** @type {HTMLElement} */
    #recent;
    /** @type {HTMLElement} */
    #flow;
    /** @type {HTMLAnchorElement} link to the page of all movements */
    #allMovements;
    /** @type {HTMLElement} red dot on the ring, the only sign of a due reminder while the widget is collapsed */
    #investDot;
    /** @type {HTMLElement} balance and the button that opens the investing plan */
    #investBar;

    /** @type {FinanceInvestState | undefined} */
    #invest;
    /** @type {boolean | undefined} undefined until the invest endpoint answers */
    #isInvestAvailable;
    #investUnavailableReason = "";

    /** categories of the summary and funds of the recent investments */
    #catalog = new FinanceCatalog();
    /** @type {FinanceSummary | undefined} */
    #summary;
    #isExpanded = false;
    /** @type {boolean | undefined} undefined until the health endpoint answers */
    #isAvailable;
    #unavailableReason = "";



    constructor(config) {
        super();

        this.#config = config;
        this.setConfig(config);
        
        this.#center = html.element(html`<div class="center"></div>`);
        this.#ring = finance_svg("svg", {
            class: "ring finance-ring",
            viewBox: "0 0 100 100"
        });
        // no title, hovering the collapsed widget must not tell anything
        this.#investDot = html.element(html`<span class="invest-dot" hidden></span>`);
        this.#chart = html.element(html`
            <div class="chart" onClick="${() => this.toggleExpanded()}">
                ${this.#ring}
                ${this.#center}
                ${this.#investDot}
            </div>
        `);

        this.#recent = html.element(html`<div class="recent"></div>`);
        // href is set when rendered, it depends on the preferred currency
        this.#allMovements = html.element(html`
            <a class="button all-movements" hidden>
                ${nf("nf-fa-list", "≡")}
                <span>All movements</span>
            </a>
        `);
        this.#flow = html.element(html`<div class="flow"></div>`);
        this.#investBar = html.element(html`<div class="invest-bar" hidden></div>`);

        const FinanceButton = ({ type }) => {
            return html`
                <button class="${['add', type]}" onClick="${() => this.addTransaction(type)}">
                    ${nf(FINANCE_TYPES[type].icon, "+")}
                    <span>
                        ${FINANCE_TYPES[type].add}
                    </span>
                </button>
            `;
        }
        
        this.#display = html.element(html`
            <div class="w-finance">
                ${this.#chart}
                ${this.#flow}
                ${this.#investBar}
                
                <div class="details">
                    ${this.#recent}
                    
                    <div class="add-buttons">
                        <${FinanceButton} type="${FINANCE_TYPE_EXPENSE}" />
                        <${FinanceButton} type="${FINANCE_TYPE_INCOME}" />
                    </div>
                    
                    ${this.#allMovements}
                </div>
            </div>
        `);

        // other tabs may have added expenses, or a new month may have started
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && this.#element?.isConnected) {
                this.refresh().then();
            }
        });

        this.render();
        this.refresh().then();
    }



    get currency() {
        return this.#config.currency ?? FINANCE_DEFAULT_CURRENCY;
    }

    get target() {
        return this.#config.target ?? 0;
    }

    /**
     * @return {number} number of the movements changed last listed in the widget
     */
    get recentCount() {
        return this.#config.recent ?? FINANCE_RECENT_DEFAULT;
    }

    /**
     * @return {string | undefined} page of all movements in the preferred currency
     */
    movementsUrl() {
        const page = finance_api()?.page;
        return is(page)
            ? finance_url(page, { currency: this.currency }).toString()
            : undefined;
    }

    /**
     * Failures are shown in the widget instead of alerts, the check is repeated on the next refresh
     *
     * @return {Promise<boolean>}
     */
    async checkHealth() {
        const api = finance_api();
        if (!is(api)) {
            this.#unavailableReason = "Finance API is not defined";
            return false;
        }

        try {
            const response = await fetch(api.health);
            if (response.ok) {
                return true;
            }

            this.#unavailableReason = await finance_errorMessage(response);
        } catch {
            this.#unavailableReason = "Server is not reachable";
        }

        return false;
    }

    async refresh() {
        const api = finance_api();

        if (this.#isAvailable !== true) {
            this.#isAvailable = await this.checkHealth();

            if (!this.#isAvailable) {
                this.render();
                return;
            }
        }

        const [summary] = await Promise.all([
            finance_request(finance_url(api.summary, {
                month: finance_currentMonth(),
                currency: this.currency,
                recent: this.recentCount
            })),
            this.refreshInvest()
        ]);

        if (!is(summary)) {
            return;
        }

        this.#summary = summary;
        this.#catalog.set(summary.categories, summary.funds ?? []);
        this.render();
    }

    /**
     * @return {string} URL of the invest endpoint for the preferred currency and the local today
     */
    investUrl() {
        return finance_url(finance_api().invest, {
            currency: this.currency,
            today: finance_isoDate()
        });
    }

    /**
     * Failures are shown in the widget and the inspector instead of alerts, so a missing migration or an unreachable
     * exchange rate API does not interrupt every new tab
     */
    async refreshInvest() {
        const api = finance_api();
        if (!is(api?.invest)) {
            this.#isInvestAvailable = false;
            this.#investUnavailableReason = "Investing API is not defined";
            this.renderInvest();
            return;
        }

        try {
            const response = await fetch(this.investUrl());
            if (response.ok) {
                this.#invest = await response.json();
                this.#isInvestAvailable = true;
            } else {
                this.#isInvestAvailable = false;
                this.#investUnavailableReason = await finance_errorMessage(response);
            }
        } catch {
            this.#isInvestAvailable = false;
            this.#investUnavailableReason = "Server is not reachable";
        }

        this.renderInvest();
    }

    /**
     * @param {Partial<FinanceInvestSettingsDraft>} changes
     * @return {Promise<boolean>} whether the settings were saved
     */
    async saveInvest(changes) {
        const state = await finance_send(this.investUrl(), "PUT", changes);
        if (!is(state)) {
            return false;
        }

        this.#invest = state;
        this.renderInvest();
        return true;
    }

    /**
     * Opened only from the invest button of the expanded widget, a due reminder never opens it by itself
     */
    async openInvest() {
        if (this.#isInvestAvailable !== true) {
            await window_alert("Investing is not available: " + this.#investUnavailableReason, WINDOW_ALERT_SETTINGS);
            return;
        }

        await this.refreshInvest();
        if (!is(this.#invest)) {
            return;
        }

        await finance_openInvestDialog(this, this.#invest);
        await this.refreshInvest();
    }

    toggleExpanded() {
        this.#isExpanded = !this.#isExpanded;
        this.#display.classList.toggle("expanded", this.#isExpanded);
    }

    render() {
        this.renderChart();
        this.renderFlow();
        this.renderRecent();
        this.renderInvest();
    }

    renderInvest() {
        const state = this.#invest;
        const isDue = this.#isInvestAvailable === true && state?.isDue === true;

        this.#investDot.hidden = !isDue;

        this.#investBar.textContent = "";
        this.#investBar.hidden = this.#isInvestAvailable !== true || !is(state);

        if (this.#investBar.hidden) {
            return;
        }

        const isSet = is(state.balance);
        
        jsml_addContent(this.#investBar, html`
            ${nf("nf-md-bank", "B")}
            
            <span class="label">Balance</span>
            
            <span class="${cls("value", { negative: isSet && state.balance < 0, unset: !isSet })}">
                ${isSet
                    ? finance_formatMoney(state.balance, state.currency)
                    : "Set it in the settings"}
            </span>
            
            <button
                class="${cls("invest-button", { due: isDue })}"
                title="Investing plan"
                onClick="${() => this.openInvest()}"
            >${nf("nf-md-chart_line", "I")}</button>
        `);
    }

    renderChart() {
        this.#center.textContent = "";

        if (this.#isAvailable === false) {
            finance_renderRing(this.#ring, [{ color: "var(--finance-remaining)", fraction: 1 }]);
            this.#chart.title = this.#unavailableReason;
            this.#center.append(html.node(html`<span class="label">API unavailable</span>`));
            return;
        }

        if (!is(this.#summary)) {
            finance_renderRing(this.#ring, [{ color: "var(--finance-remaining)", fraction: 1 }]);
            this.#center.append(html.node(html`<span class="label">Loading…</span>`));
            return;
        }

        // the ring shows how the budget is used, so only expenses count against it
        const spent = this.#summary.expenses;
        const balance = this.target - spent;
        const isOver = balance < 0;
        // when over budget the categories fill the whole ring relative to each other
        const whole = isOver ? spent : this.target;

        /** @type {{ color: string, fraction: number }[]} */
        const segments = [];
        const titles = [];
        let used = 0;

        if (whole > 0) {
            for (const { categoryId, total } of this.#summary.totals) {
                const category = this.#catalog.category(categoryId);
                if (total <= 0 || finance_isIncome(category)) {
                    continue;
                }

                const fraction = total / whole;
                segments.push({ color: category?.color ?? "gray", fraction });
                titles.push(`${category?.name ?? "Unknown"}: ${finance_formatMoney(total, this.currency)}`);
                used += fraction;
            }
        }

        if (!isOver) {
            segments.push({ color: "var(--finance-remaining)", fraction: Math.max(0, 1 - used) });
            titles.push(`Remaining: ${finance_formatMoney(balance, this.currency)}`);
        }

        finance_renderRing(this.#ring, segments);
        this.#chart.title = titles.join("\n");

        jsml_addContent(this.#center, html`
            <span class="${['balance', isOver ? 'negative' : 'positive']}">
                ${finance_formatMoney(balance, this.currency)}
            </span>

            <span class="label">
                ${isOver ? "over budget" : "left this month"}
            </span>
        `);
    }

    /**
     * Income vs expenses of the month as two bars scaled to the larger of the two, kept apart from the ring so the
     * ring only shows the budget usage
     */
    renderFlow() {
        this.#flow.textContent = "";
        this.#flow.hidden = !is(this.#summary) || this.#isAvailable === false;

        if (this.#flow.hidden) {
            return;
        }

        const { income, expenses } = this.#summary;
        const largest = Math.max(income, expenses);
        const net = income - expenses;

        this.#flow.title = `${net < 0 ? "Net loss" : "Net"} this month: ${finance_formatMoney(net, this.currency)}`;

        for (const [type, value] of [[FINANCE_TYPE_INCOME, income], [FINANCE_TYPE_EXPENSE, expenses]]) {
            this.#flow.append(
                html.node(html`
                    <div class="${['flow-row', type]}">
                        ${nf(FINANCE_TYPES[type].icon, type === FINANCE_TYPE_INCOME ? "+" : "-")}
                        
                        <div class="bar">
                            <div class="fill" style="${{ width: std_percentage(largest > 0 ? value / largest : 0) }}"></div>
                        </div>
                        
                        <span class="value">
                            ${finance_formatMoney(value, this.currency)}
                        </span>
                    </div>
                `),
            );
        }
    }

    renderRecent() {
        this.#recent.textContent = "";

        const movementsUrl = this.movementsUrl();
        this.#allMovements.hidden = !is(movementsUrl);
        if (is(movementsUrl)) {
            this.#allMovements.href = movementsUrl;
        }

        const recent = this.#summary?.recent ?? [];
        if (recent.length === 0) {
            this.#recent.append(html.node(html`<div class="empty">No movements yet</div>`));
            return;
        }

        for (const movement of recent) {
            this.#recent.append(finance_MovementRow(movement, this.#catalog, () => this.editMovement(movement)));
        }
    }

    instantiate() {
        this.#element = tabby_WidgetElement(this, this.#display, this.#config);
        return this.#element;
    }

    /**
     * @return {Promise<boolean>} false with an alert when the finance API is not available
     */
    async requireAvailable() {
        if (this.#isAvailable === true) {
            return true;
        }

        await window_alert("Finance API is not available: " + this.#unavailableReason, WINDOW_ALERT_SETTINGS);
        return false;
    }

    /**
     * @param {FinanceCategoryType} type
     */
    async addTransaction(type) {
        if (!(await this.requireAvailable())) {
            return;
        }

        await finance_openMovementEditor(this.#catalog, {
            type,
            currency: this.currency,
            saveCategory: category => this.saveCategory(category)
        });

        await this.refresh();
    }

    /**
     * @param {FinanceMovement} movement
     */
    async editMovement(movement) {
        if (!(await this.requireAvailable())) {
            return;
        }

        await finance_openMovementEditor(this.#catalog, {
            type: movement.type,
            movement,
            currency: this.currency,
            saveCategory: category => this.saveCategory(category)
        });

        // also refreshes the investing plan, investments change the bank balance
        await this.refresh();
    }

    /**
     * @param {FinanceCategory} category
     * @return {FinanceCategory}
     */
    async saveCategory(category) {
        const api = finance_api();
        if (this.#isAvailable !== true) {
            await window_alert("Finance API is not available: " + this.#unavailableReason, WINDOW_ALERT_SETTINGS);
            return;
        }

        const response = await finance_send(api.categories, is(category.id) ? "PUT" : "POST", category);
        if (!is(response)) {
            return;
        }

        await this.refresh();
        tabby_inspect(() => this.inspect());
        
        return response;
    }

    inspect() {
        const api = finance_api();
        const categories = [
            ...this.#catalog.of(FINANCE_TYPE_EXPENSE),
            ...this.#catalog.of(FINANCE_TYPE_INCOME),
        ];

        const target = [
            () => this.target,
            x => {
                const value = Number(x);
                if (x === "" || isNaN(value) || value < 0) {
                    return String(this.target);
                }

                this.#config.target = value;
                tabby_save();
                this.renderChart();
                return value;
            }
        ];
        const currencies = FINANCE_CURRENCIES.map(currency => ({
            text: currency,
            value: currency,
            selected: currency === this.currency
        }));
        const listedMovements = [
            () => this.recentCount,
            x => {
                const value = Number(x);
                if (x === "" || !Number.isInteger(value) || value < 0 || value > FINANCE_RECENT_MAX) {
                    return String(this.recentCount);
                }

                this.#config.recent = value;
                tabby_save();
                this.refresh();
                return value;
            }
        ];

        const onAdd = async () => {
            const category = await finance_openCategoryDialog();
            if (!is(category)) {
                return;
            }

            await this.saveCategory(category);
        }
        /**
         * @param {Event} event
         * @param {FinanceCategory} selected
         */
        const onEdit = async (event, selected) => {
            const category = await finance_openCategoryDialog(selected);
            if (!is(category)) {
                return;
            }

            await this.saveCategory(category);
        }
        /**
         * @param {Event} event
         * @param {FinanceCategory} selected
         */
        const onDelete = async (event, selected) => {
            if (this.#isAvailable !== true) {
                return;
            }

            if (!(await window_confirm(`Do you want to delete category '${selected.name}'?`, WINDOW_CONFIRM_SETTINGS))) {
                return;
            }

            const result = await finance_request(
                finance_url(api.categories, { id: selected.id }),
                { method: "DELETE" }
            );

            if (!is(result)) {
                return;
            }

            await this.refresh();
            tabby_inspect(() => this.inspect());
        }

        return html`
            <${TabbyTitle} title="Finance" />
            <${TabbyHR} />

            <${TabbyNumber}
                value="${target}"
                label="Monthly budget"
                placeholder="10000"
                measurement="${this.currency}"
                min="0"
                step="100"
            />

            <${TabbySelect} label="Preferred currency" options="${currencies}" setValue="${async x => {
                this.#config.currency = x;
                tabby_save();
                await this.refresh();
                tabby_inspect(() => this.inspect());
            }}" />

            <${TabbyNumber}
                value="${listedMovements}"
                label="Listed movements"
                placeholder="${FINANCE_RECENT_DEFAULT}"
                min="0"
                max="${FINANCE_RECENT_MAX}"
                step="1"
            />

            <${TabbyNote} note="The widget lists the movements (income, expenses and investments) that were added or changed last." />

            <${TabbyHR} />

            <${Show} when="${this.#isAvailable === false}">
                <${TabbyNote} note="Finance API is not available: ${this.#unavailableReason}" />
            </>

            <${EditableList}
                class="i-finance"
                collection="${categories}"
                onAdd="${onAdd}"
                onEdit="${onEdit}"
                onDelete="${onDelete}"
                fallback="No categories"
            >
                ${x => html`
                    <div class="category">
                        ${finance_CategoryBadge(x)}

                        <span class="name">
                            ${x.name}
                        </span>

                        <span class="${['type', 'finance-badge', x.type]}">
                            ${nf(
                                x.type === 'income'
                                    ? 'nf-md-trending_up'
                                    : 'nf-md-trending_down'
                            )}
                        </span>
                    </div>
                `}
            </>

            <${TabbyHR} />

            ${this.inspectInvest()}
        `;
    }

    /**
     * Investing section of the inspector: reminder state, balance, the share curve and the funds
     *
     * @return {JsmlContent}
     */
    inspectInvest() {
        const state = this.#invest;

        if (this.#isInvestAvailable !== true || !is(state)) {
            return html`
                <${TabbyTitle} title="Investing" />
                <${TabbyNote} note="Investing is not available: ${this.#investUnavailableReason || "Loading…"}" />
            `;
        }

        const { settings, currency } = state;
        const reinspect = () => tabby_inspect(() => this.inspect());

        /**
         * TabbyNumber that saves one setting, invalid values and failed saves are reverted
         *
         * @param {JsmlTagProps<"input"> & {
         *      value: number | undefined,
         *      isValid: (value: number) => boolean,
         *      changes: (value: number) => Partial<FinanceInvestSettingsDraft>,
         *      label: string,
         *      measurement?: string,
         * }} props
         */
        const Setting = ({ value: initial, isValid, changes, ...p }) => {
            const [value, setValue] = signal(initial);

            const save = number => {
                if (!isValid(number)) {
                    return value();
                }

                const previous = value();
                setValue(number);
                this.saveInvest(changes(number)).then(isSaved => isSaved ? reinspect() : setValue(previous));
                return number;
            };

            return html`<${TabbyNumber} value="${[value, save]}" ...${p} />`;
        };

        // reminder state
        let status;
        if (!settings.enabled) {
            status = "Stopped";
        } else if (state.isPaused) {
            status = `Paused, next reminder in ${finance_formatMonth(settings.pausedUntil)}`;
        } else {
            status = `On, every month on day ${settings.day}`;
        }

        const canResume = !settings.enabled || is(settings.pausedUntil);
        const balanceNote = is(settings.balance)
            ? `Set on ${finance_formatDate(settings.balance.date)} to ${finance_formatMoney(settings.balance.amount, settings.balance.currency)}. `
                + "Income, expenses and investments recorded since then adjust it. Enter your real balance whenever it drifts."
            : "Enter your current bank balance. From then on income, expenses and investments you record adjust it.";
        const explanation = `On the reminder day you get a recommendation to invest a part of last month's surplus (income − expenses). `
            + `The part grows with your bank balance: at ${finance_formatMoney(state.halfPoint, currency)} it is `
            + `${finance_formatShare(settings.maxShare / 200)}, half of the max. It keeps approaching `
            + `${settings.maxShare} % but never reaches it, so more money always stays in the bank.`;

        // funds
        const funds = state.funds.filter(fund => !fund.isDeleted);
        const weights = funds.reduce((sum, fund) => sum + fund.weight, 0);

        const saveFund = async fund => {
            const result = await finance_send(finance_api().funds, is(fund.id) ? "PUT" : "POST", fund);
            if (!is(result)) {
                return;
            }

            await this.refreshInvest();
            reinspect();
        };
        const onAddFund = async () => {
            const fund = await finance_openFundDialog();
            if (is(fund)) {
                await saveFund(fund);
            }
        };
        /**
         * @param {Event} event
         * @param {FinanceFund} selected
         */
        const onEditFund = async (event, selected) => {
            const fund = await finance_openFundDialog(selected);
            if (is(fund)) {
                await saveFund(fund);
            }
        };
        /**
         * @param {Event} event
         * @param {FinanceFund} selected
         */
        const onDeleteFund = async (event, selected) => {
            if (!(await window_confirm(`Do you want to delete fund '${selected.name}'?`, WINDOW_CONFIRM_SETTINGS))) {
                return;
            }

            const result = await finance_request(
                finance_url(finance_api().funds, { id: selected.id }),
                { method: "DELETE" }
            );

            if (!is(result)) {
                return;
            }

            await this.refreshInvest();
            reinspect();
        };

        return html`
            <${TabbyTitle} title="Investing" />

            <div class="i-finance-invest">
                <div class="status">
                    <span>Reminders: ${status}</span>

                    <${Show} when="${canResume}">
                        <button onClick="${async () => {
                            if (await this.saveInvest({ enabled: true, pausedUntil: null })) {
                                reinspect();
                            }
                        }}">Resume</button>
                    </>
                </div>
            </div>

            <${Setting}
                label="Bank balance"
                value="${is(state.balance) ? Math.round(state.balance) : undefined}"
                isValid="${value => Math.abs(value) <= Number.MAX_SAFE_INTEGER}"
                changes="${value => ({ balance: value })}"
                measurement="${currency}"
                class="finance-wide"
                step="100"
                placeholder="180000"
            />
            <${TabbyNote} note="${balanceNote}" />

            <${Setting}
                label="Reminder day"
                value="${settings.day}"
                isValid="${value => Number.isInteger(value) && value >= 1 && value <= FINANCE_INVEST_DAY_MAX}"
                changes="${value => ({ day: value })}"
                measurement="of month"
                min="1"
                max="${FINANCE_INVEST_DAY_MAX}"
                step="1"
            />

            <${Setting}
                label="Max invested share"
                value="${settings.maxShare}"
                isValid="${value => value > 0 && value <= 100}"
                changes="${value => ({ maxShare: value })}"
                measurement="%"
                min="1"
                max="100"
                step="1"
            />

            <${Setting}
                label="Half point"
                value="${Math.round(state.halfPoint)}"
                isValid="${value => value > 0}"
                changes="${value => ({ halfPoint: value })}"
                measurement="${currency}"
                class="finance-wide"
                min="1"
                step="10000"
            />

            <div class="i-finance-invest">
                ${finance_ShareCurve(state)}

                <p class="explanation">${explanation}</p>

                <p class="explanation formula">share = max × balance ÷ (balance + half point)</p>
            </div>

            <span>Funds (target share of all invested money)</span>

            <${EditableList}
                class="i-finance finance-funds"
                collection="${funds}"
                onAdd="${onAddFund}"
                onEdit="${onEditFund}"
                onDelete="${onDeleteFund}"
                fallback="No funds"
            >
                ${fund => html`
                    <div class="category">
                        <span class="name">
                            ${fund.name}
                            <span class="symbol">${fund.symbol}</span>
                        </span>

                        <span class="weight">
                            ${finance_formatShare(weights > 0 ? fund.weight / weights : 0)}
                        </span>
                    </div>
                `}
            </>

            <${TabbyNote} note="Symbols are Yahoo Finance symbols, e.g. VWCE.DE (Xetra), VWRL.AS (Amsterdam), O (NYSE)." />
        `;
    }

    save() {
        const ret = {
            ...this.#config,
            ...super.save()
        };

        ret.builder = FINANCE_BUILDER;

        return ret;
    }
}


/**
 * @param {Opt<FinanceFund>} fund
 * @return {Promise<Opt<FinanceFund>>}
 */
function finance_openFundDialog(fund = null) {
    return new Promise(resolve => {
        const result = is(fund)
            ? { ...fund }
            : { name: "", symbol: "", weight: 10 };

        let ret = undefined;

        const name = [() => result.name, value => result.name = value.trim()];
        const symbol = [() => result.symbol, value => result.symbol = value.trim().toUpperCase()];
        const weight = [() => result.weight, value => result.weight = value];

        const confirm = async () => {
            if (result.name === "" || result.symbol === "") {
                await window_alert("Name and symbol must be set", WINDOW_ALERT_SETTINGS);
                return;
            }

            if (isNaN(result.weight) || result.weight <= 0) {
                await window_alert("Weight must be greater than zero", WINDOW_ALERT_SETTINGS);
                return;
            }

            ret = result;
            window_close(w);
        };

        const w = window_create(
            "Fund",
            html.element(html`
                <div class="text-window">
                    <${TabbyTextField} value="${name}" label="Name" placeholder="Vanguard FTSE All-World" />
                    <${TabbyTextField} value="${symbol}" label="Yahoo symbol" placeholder="VWCE.DE" />
                    <${TabbyNumber} value="${weight}" label="Weight" placeholder="10" min="0" step="1" />

                    <${TabbyNote} note="Weights are relative, 50 / 35 / 15 and 10 / 7 / 3 split the money the same way." />

                    <div class="controls">
                        <button onClick="${confirm}">Ok</button>
                        <button onClick="${() => window_close(w)}">Cancel</button>
                    </div>
                </div>
            `),
            {
                isDialog: true,
                isDraggable: true,
                isMinimizable: false
            }
        );

        w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve(ret));
        window_open(w);
    });
}

/**
 * Investing plan with editable amounts per fund. When a reminder is due it can be handled by recording the investments,
 * postponed by closing the dialog (the red dot stays), paused for a number of reminders or stopped.
 *
 * @param {FinanceWidget} financeWidget
 * @param {FinanceInvestState} state
 * @return {Promise<void>}
 */
function finance_openInvestDialog(financeWidget, state) {
    return new Promise(resolve => {
        const api = finance_api();
        const { currency, settings } = state;
        const funds = state.funds.filter(fund => !fund.isDeleted);
        const fundNames = new Map(state.funds.map(fund => [fund.id, fund.name]));
        const allocation = new Map(state.allocation.map(part => [part.fundId, part.amount]));

        let isSubmitting = false;

        /** @type {Map<number, HTMLInputElement>} */
        const amountInputs = new Map();
        /** @type {Map<number, HTMLElement>} */
        const quoteElements = new Map();
        /** @type {Map<number, FinanceFundQuote>} */
        const quotes = new Map();

        const totalElement = html.element(html`<span class="value"></span>`);
        const bankElement = html.element(html`<span class="value"></span>`);

        const amountOf = fundId => {
            const value = Number(amountInputs.get(fundId)?.value || 0);
            return isNaN(value) ? 0 : value;
        };

        const dipHint = "The price is well below its 52-week high, consider investing more into this fund. "
            + "It is only a hint, nobody can tell whether it will drop further.";

        // called on every keystroke, plain conditions instead of <Show> so no reactive nodes pile up
        const renderQuote = fundId => {
            const element = quoteElements.get(fundId);
            const quote = quotes.get(fundId);

            if (!is(quote)) {
                element.replaceChildren(html.node(html`<span class="muted">Loading price…</span>`));
                return;
            }

            if (!quote.isAvailable) {
                element.replaceChildren(html.node(html`
                    <span class="muted">Price of ${quote.symbol} is not available</span>
                `));
                return;
            }

            const amount = amountOf(fundId);
            const units = is(quote.rate) && amount > 0
                ? amount * quote.rate / quote.price
                : undefined;

            element.replaceChildren(html.node(html`
                <span>${finance_formatMoney(quote.price, quote.currency)}</span>

                <span class="muted" title="52-week high: ${finance_formatMoney(quote.high, quote.currency)}">
                    ${quote.drop >= 0.005
                        ? `−${finance_formatShare(quote.drop)} from 52w high`
                        : "at 52w high"}
                </span>

                ${quote.multiplier > 1
                    ? html`<span class="dip" title="${dipHint}">dip: consider ×${quote.multiplier}</span>`
                    : undefined}

                ${is(units)
                    ? html`<span class="muted">≈ ${units.toLocaleString(undefined, { maximumFractionDigits: 3 })} units</span>`
                    : undefined}
            `));
        };

        const update = () => {
            const total = funds.reduce((sum, fund) => sum + amountOf(fund.id), 0);
            totalElement.textContent = finance_formatMoney(total, currency);
            bankElement.textContent = finance_formatMoney(Math.max(0, state.surplus - total), currency);

            for (const fund of funds) {
                renderQuote(fund.id);
            }
        };

        const fundRows = funds.map(fund => {
            const amountInput = /** @type {HTMLInputElement} */ (html.element(html`
                <input
                    class="amount-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    value="${String(allocation.get(fund.id) ?? 0)}"
                    onInput="${() => {
                        const sanitized = finance_sanitizeAmount(amountInput.value);
                        if (amountInput.value !== sanitized) {
                            amountInput.value = sanitized;
                        }

                        update();
                    }}"
                >
            `));

            const quoteElement = html.element(html`<div class="quote"></div>`);
            amountInputs.set(fund.id, amountInput);
            quoteElements.set(fund.id, quoteElement);

            return html`
                <div class="fund">
                    <div class="info">
                        <span class="name">${fund.name}</span>
                        <span class="symbol">${fund.symbol}</span>
                        ${quoteElement}
                    </div>

                    <div class="amount">
                        ${amountInput}
                        <span class="currency">${currency}</span>
                    </div>
                </div>
            `;
        });

        const dateInput = /** @type {HTMLInputElement} */ (html.element(html`
            <input type="date" value="${finance_isoDate()}">
        `));

        // pausing counts the current reminder as the first one
        const pauseInput = /** @type {HTMLInputElement} */ (html.element(html`
            <input
                type="number"
                min="1"
                max="${FINANCE_INVEST_PAUSE_MAX}"
                step="1"
                value="1"
                onInput="${() => updatePause()}"
            >
        `));
        const pauseNote = html.element(html`<span class="muted"></span>`);
        const pauseCount = () => {
            const count = Number(pauseInput.value);
            return Number.isInteger(count) && count >= 1 && count <= FINANCE_INVEST_PAUSE_MAX
                ? count
                : undefined;
        };
        const updatePause = () => {
            const count = pauseCount();
            if (!is(count)) {
                pauseNote.textContent = `Enter 1 to ${FINANCE_INVEST_PAUSE_MAX}`;
                return;
            }

            const month = finance_shiftMonth(state.reminderMonth, count);
            const day = String(settings.day).padStart(2, "0");
            pauseNote.textContent = `This one counts as the first. Next reminder: ${finance_formatDate(`${month}-${day}`)}`;
        };
        updatePause();

        const record = async () => {
            if (isSubmitting) {
                return;
            }

            if (dateInput.value === "") {
                await window_alert("Select a date", WINDOW_ALERT_SETTINGS);
                return;
            }

            const parts = funds
                .map(fund => ({ fundId: fund.id, amount: amountOf(fund.id) }))
                .filter(part => part.amount > 0);

            if (parts.length === 0) {
                await window_alert("At least one amount must be greater than zero", WINDOW_ALERT_SETTINGS);
                return;
            }

            isSubmitting = true;
            const result = await finance_send(api.investments, "POST", {
                date: dateInput.value,
                currency,
                // recording the investments of a due reminder handles it
                month: state.isDue ? state.reminderMonth : null,
                parts
            });
            isSubmitting = false;

            if (is(result)) {
                window_close(w);
            }
        };

        const pause = async () => {
            const count = pauseCount();
            if (!is(count)) {
                return;
            }

            if (await financeWidget.saveInvest({ pausedUntil: finance_shiftMonth(state.reminderMonth, count) })) {
                window_close(w);
            }
        };

        const stop = async () => {
            if (!(await window_confirm("Stop investing reminders until you resume them in the widget settings?", WINDOW_CONFIRM_SETTINGS))) {
                return;
            }

            if (await financeWidget.saveInvest({ enabled: false })) {
                window_close(w);
            }
        };

        /**
         * @param {FinanceInvestment} investment
         */
        const removeInvestment = async investment => {
            if (!(await window_confirm("Do you want to delete this investment?", WINDOW_CONFIRM_SETTINGS))) {
                return;
            }

            const result = await finance_request(
                finance_url(api.investments, { id: investment.id }),
                { method: "DELETE" }
            );

            if (is(result)) {
                // the plan depends on the investments, it is opened again with fresh numbers
                window_close(w);
                await financeWidget.openInvest();
            }
        };

        const recent = state.recent.map(investment => html`
            <div class="investment">
                <span class="date">${finance_formatDate(investment.date)}</span>
                <span class="name">${fundNames.get(investment.fundId) ?? "Unknown fund"}</span>
                <span class="value">${finance_formatMoney(investment.amount, investment.currency)}</span>

                <button class="remove" title="Delete" onClick="${() => removeInvestment(investment)}">
                    ${nf("nf-oct-trash", "x")}
                </button>
            </div>
        `);

        const sourceName = finance_formatMonth(state.sourceMonth);

        const w = window_create(
            state.isDue ? `Investing reminder · ${finance_formatMonth(state.reminderMonth)}` : "Investing plan",
            html.element(html`
                <div class="finance-invest-dialog">
                    <div class="plan">
                        <div class="row">
                            <span>${sourceName} surplus</span>
                            <span class="value">${finance_formatMoney(state.surplus, currency)}</span>
                        </div>

                        <div class="row">
                            <span>Bank balance</span>
                            <span class="value">
                                ${is(state.balance) ? finance_formatMoney(state.balance, currency) : "not set"}
                            </span>
                        </div>

                        <div class="row">
                            <span title="max × balance ÷ (balance + half point)">Invested share</span>
                            <span class="value">${finance_formatShare(state.share)} of max ${settings.maxShare} %</span>
                        </div>

                        <div class="row strong">
                            <span>Recommended</span>
                            <span class="value">${finance_formatMoney(state.amount, currency)}</span>
                        </div>

                        <${Show} when="${!is(state.balance)}">
                            <div class="hint">Set your bank balance in the widget settings to get a recommendation.</div>
                        </>

                        <${Show} when="${is(state.balance) && state.surplus <= 0}">
                            <div class="hint">There was no surplus in ${sourceName}, nothing is recommended.</div>
                        </>
                    </div>

                    <${Show} when="${funds.length === 0}">
                        <div class="hint">Add funds in the widget settings.</div>
                    </>

                    <div class="funds">${fundRows}</div>

                    <div class="totals">
                        <div class="row strong">
                            <span>Investing</span>
                            ${totalElement}
                        </div>

                        <div class="row">
                            <span>Stays in bank of ${sourceName} surplus</span>
                            ${bankElement}
                        </div>
                    </div>

                    <div class="field">
                        <${Label} label="Date" target="${dateInput}" />
                        ${dateInput}
                    </div>

                    <div class="controls">
                        <button class="primary" onClick="${() => record()}">${nf("nf-fa-check", "✓")} Record investments</button>
                        <button onClick="${() => window_close(w)}">Later</button>
                    </div>

                    <${Show} when="${state.isDue}">
                        <div class="pause">
                            <div class="pause-row">
                                <button onClick="${pause}">Pause next</button>
                                ${pauseInput}
                                <span>reminders</span>
                            </div>

                            ${pauseNote}

                            <button class="stop" onClick="${stop}">Stop reminders indefinitely</button>
                        </div>
                    </>

                    <${Show} when="${recent.length > 0}">
                        <div class="recent-investments">
                            <h4>Recent investments</h4>
                            ${recent}
                        </div>
                    </>
                </div>
            `),
            FINANCE_INVEST_DIALOG_SETTINGS
        );

        w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve());
        window_open(w);
        update();

        // prices are fetched once a day by the server, the plan is usable before they arrive
        if (funds.length > 0) {
            finance_request(finance_url(api.quotes, { currency })).then(result => {
                for (const quote of result ?? []) {
                    quotes.set(quote.fundId, quote);
                }

                for (const fund of funds) {
                    if (!quotes.has(fund.id)) {
                        quotes.set(fund.id, { fundId: fund.id, symbol: fund.symbol, isAvailable: false });
                    }
                }

                update();
            });
        }
    });
}



const finance_builder = new FunctionalTabbyBuilder(
    FINANCE_BUILDER,
    config => new FinanceWidget(config)
);



tabby_addBuilder(finance_builder);
tabby_addPrefab(
    tabby_PrefabElement({
        builder: finance_builder,
        icon: nf('nf-fa-money_check_dollar'),
        time: "Finance"
    })
);
