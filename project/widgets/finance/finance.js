const FINANCE_BUILDER = 'finance';

const FINANCE_RECENT_COUNT = 5;
const FINANCE_DEFAULT_CURRENCY = 'CZK';
const FINANCE_DEFAULT_COLOR = '#4e79a7';
/** In the 100x100 view box of the ring, stroke width is set in CSS */
const FINANCE_RING_RADIUS = 44;
/** Percent of the circumference between two segments */
const FINANCE_RING_GAP = 1.5;
const FINANCE_CURRENCIES =["CZK", "EUR", "USD", "GBP", "PLN", "CHF", "HUF", "JPY"];

const FINANCE_DIALOG_SETTINGS = {
    width: "340px",
    isDialog: true,
    isDraggable: true,
    isMinimizable: false
};



/**
 * @return {FinanceApi | null}
 */
function finance_api() {
    return api_loadTabby()?.finance ?? null;
}

/**
 * Errors are sent with `$response->sendMessage()`, which renders the Message component as HTML
 *
 * @param {Response} response
 * @return {Promise<string>}
 */
async function finance_errorMessage(response) {
    const text = await response.text();
    if (!(response.headers.get("Content-Type") ?? "").startsWith("text/html")) {
        return text;
    }

    const message = new DOMParser()
        .parseFromString(text, "text/html")
        .querySelector(".message");

    if (!is(message)) {
        return text;
    }

    message.querySelector(".message-title")?.remove();
    return message.textContent.trim();
}

/**
 * Same error handling as `tabby_chooseRandomBackground()`.
 *
 * @param {string | URL} url
 * @param {RequestInit} options
 * @return {Promise<any | undefined>} undefined when the request failed, true for responses without body
 */
async function finance_request(url, options = {}) {
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        await window_alert("Server is not reachable", WINDOW_ALERT_SETTINGS);
        return undefined;
    }

    if (await std_fetch_handleServerError(response)) {
        return undefined;
    }

    if (!response.ok) {
        await window_alert(await finance_errorMessage(response), WINDOW_ALERT_SETTINGS);
        return undefined;
    }

    if (response.status === 204) {
        return true;
    }

    return await response.json();
}

/**
 * @param {string | URL} url
 * @param {string} method
 * @param {any} body
 * @return {Promise<any | undefined>}
 */
function finance_send(url, method, body) {
    return finance_request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

/**
 * @param {string} base
 * @param {Record<string, string | number>} query
 * @return {URL}
 */
function finance_url(base, query = {}) {
    const url = new URL(base);

    for (const key in query) {
        url.searchParams.set(key, String(query[key]));
    }

    return url;
}

/**
 * @param {number} amount
 * @param {string} currency
 * @return {string}
 */
function finance_formatMoney(amount, currency) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        // unknown currency code
        return amount.toFixed(2) + " " + currency;
    }
}

/**
 * @param {Date} date
 * @return {string} YYYY-MM-DD in local time
 */
function finance_isoDate(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * @return {string} YYYY-MM in local time
 */
function finance_currentMonth() {
    return finance_isoDate().slice(0, 7);
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @return {string}
 */
function finance_formatDate(isoDate) {
    const date = new Date(isoDate + "T00:00:00");
    if (isNaN(date.getTime())) {
        return isoDate;
    }

    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    });
}

/**
 * jsml creates HTML elements only, SVG elements need their namespace
 *
 * @param {string} tag
 * @param {Record<string, string | number>} attributes
 * @return {SVGElement}
 */
function finance_svg(tag, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

    for (const name in attributes) {
        element.setAttribute(name, String(attributes[name]));
    }

    return element;
}

/**
 * Category icon in a circle with the category color.
 *
 * @param {FinanceCategory | undefined} category
 * @return {HTMLElement}
 */
function finance_CategoryBadge(category) {
    return jsml.div({
        class: "finance-badge",
        title: category?.name ?? "Unknown category",
        style: {
            backgroundColor: category?.color ?? "gray"
        }
    }, Icon(category?.icon || "nf-fa-question", "?"));
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
    /** @type {SVGSVGElement} */
    #ring;
    /** @type {HTMLElement} */
    #recent;

    /** @type {FinanceCategory[]} */
    #categories = [];
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

        this.#center = jsml.div("center");
        this.#ring = finance_svg("svg", {
            class: "ring",
            viewBox: "0 0 100 100"
        });
        this.#chart = jsml.div({
            class: "chart",
            onClick: () => this.toggleExpanded()
        }, [this.#ring, this.#center]);

        this.#recent = jsml.div("recent");

        this.#display = jsml.div("w-finance", [
            this.#chart,
            jsml.div("details", [
                this.#recent,
                jsml.button({
                    class: "add",
                    onClick: () => this.addExpense()
                }, [Icon("nf-fa-plus", "+"), jsml.span(_, "Add")])
            ])
        ]);

        // other tabs may have added expenses, or a new month may have started
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && this.#element?.isConnected) {
                this.refresh();
            }
        });

        this.render();
        this.refresh();
    }



    get currency() {
        return this.#config.currency ?? FINANCE_DEFAULT_CURRENCY;
    }

    get target() {
        return this.#config.target ?? 0;
    }

    /**
     * @return {FinanceCategory[]} categories that can be selected and edited
     */
    get activeCategories() {
        return this.#categories.filter(category => !category.isDeleted);
    }

    /**
     * @param {number} id
     * @return {FinanceCategory | undefined}
     */
    category(id) {
        return this.#categories.find(category => category.id === id);
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

        const summary = await finance_request(finance_url(api.summary, {
            month: finance_currentMonth(),
            currency: this.currency,
            recent: FINANCE_RECENT_COUNT
        }));

        if (!is(summary)) {
            return;
        }

        this.#summary = summary;
        this.#categories = summary.categories;
        this.render();
    }

    toggleExpanded() {
        if (tabby_editMode.value()) {
            return;
        }

        this.#isExpanded = !this.#isExpanded;
        this.#display.classList.toggle("expanded", this.#isExpanded);
    }

    render() {
        this.renderChart();
        this.renderRecent();
    }

    renderChart() {
        this.#center.textContent = "";

        if (this.#isAvailable === false) {
            this.renderRing([{ color: "var(--finance-remaining)", fraction: 1 }]);
            this.#chart.title = this.#unavailableReason;
            jsml_addContent(this.#center, jsml.span("label", "API unavailable"));
            return;
        }

        if (!is(this.#summary)) {
            this.renderRing([{ color: "var(--finance-remaining)", fraction: 1 }]);
            jsml_addContent(this.#center, jsml.span("label", "Loading…"));
            return;
        }

        const spent = this.#summary.total;
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
                if (total <= 0) {
                    continue;
                }

                const category = this.category(categoryId);
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

        this.renderRing(segments);
        this.#chart.title = titles.join("\n");

        jsml_addContent(this.#center, [
            jsml.span(
                "balance " + (isOver ? "negative" : "positive"),
                finance_formatMoney(balance, this.currency)
            ),
            jsml.span("label", isOver ? "over budget" : "left this month")
        ]);
    }

    /**
     * Each segment is an arc of the same circle, drawn with a dash of the segment's length. The circle's length is
     * normalized to 100 by `pathLength`, so the dashes are in percent.
     *
     * @param {{ color: string, fraction: number }[]} segments fractions of the whole ring, in drawing order
     */
    renderRing(segments) {
        this.#ring.textContent = "";
        segments = segments.filter(segment => segment.fraction > 0);

        // gaps only separate segments, a single segment is a full ring
        const gap = segments.length > 1 ? FINANCE_RING_GAP : 0;
        let start = 0;

        for (const { color, fraction } of segments) {
            const length = fraction * 100;
            // segments too short for a gap are drawn whole
            const visible = length > 2 * gap ? length - gap : length;

            const arc = finance_svg("circle", {
                class: "segment",
                cx: 50,
                cy: 50,
                r: FINANCE_RING_RADIUS,
                pathLength: 100,
                "stroke-dasharray": `${visible} ${100 - visible}`,
                "stroke-dashoffset": -(start + (length - visible) / 2),
            });

            // presentation attributes do not support CSS variables
            arc.style.stroke = color;

            this.#ring.append(arc);
            start += length;
        }
    }

    renderRecent() {
        this.#recent.textContent = "";

        const recent = this.#summary?.recent ?? [];
        if (recent.length === 0) {
            this.#recent.append(jsml.div("empty", "No expenses yet"));
            return;
        }

        for (const expense of recent) {
            const isForeign = expense.currency !== expense.baseCurrency;

            this.#recent.append(
                jsml.div("expense", [
                    finance_CategoryBadge(this.category(expense.categoryId)),
                    jsml.div("info", [
                        jsml.span("note", expense.note || this.category(expense.categoryId)?.name || ""),
                        jsml.span("date", finance_formatDate(expense.date))
                    ]),
                    jsml.div("amount", [
                        jsml.span(_, finance_formatMoney(expense.amount, expense.currency)),
                        Optional(isForeign,
                            jsml.span({
                                class: "converted",
                                title: `1 ${expense.currency} = ${expense.rate} ${expense.baseCurrency}`
                            }, "≈ " + finance_formatMoney(expense.amount * expense.rate, expense.baseCurrency))
                        )
                    ])
                ])
            );
        }
    }

    instantiate() {
        this.#element = tabby_WidgetElement(this, this.#display, this.#config);
        return this.#element;
    }

    async addExpense() {
        console.log('add expense');
        
        const api = finance_api();
        if (this.#isAvailable !== true) {
            await window_alert("Finance API is not available: " + this.#unavailableReason, WINDOW_ALERT_SETTINGS);
            return;
        }

        if (this.activeCategories.length === 0) {
            await window_alert("Create a category in the widget inspector first", WINDOW_ALERT_SETTINGS);
            return;
        }

        const saved = await finance_openExpenseDialog(
            this.activeCategories,
            this.currency,
            draft => finance_send(api.transactions, "POST", draft)
        );

        if (saved) {
            await this.refresh();
        }
    }

    /**
     * @param {Opt<FinanceCategory>} category
     * @returns {Promise<Opt<FinanceCategory>>}
     */
    inspectCategory(category = undefined) {
        return new Promise(resolve => {
            const result = is(category)
                ? { ...category }
                : {
                    name: "",
                    icon: "",
                    color: FINANCE_DEFAULT_COLOR
                };

            let ret = undefined;

            const preview = jsml.div("finance-category-preview");
            const updatePreview = () => {
                preview.textContent = "";
                preview.append(finance_CategoryBadge(result));
            };

            const colorPicker = new ColorPicker(true);
            colorPicker.rootElement.addEventListener("pick", evt => {
                result.color = ColorPicker.toHex(evt.detail);
                updatePreview();
            });
            colorPicker.setNewFromFormat(result.color);

            const w = window_create(
                "Category",
                jsml.div("text-window", [
                    preview,

                    TextFieldInspector(result.name, value => {
                        result.name = value.trim();
                        updatePreview();
                        return true;
                    }, "Name"),

                    TextFieldInspector(result.icon, value => {
                        result.icon = value.trim();
                        updatePreview();
                        return true;
                    }, "Icon", "nf-fa-house"),

                    colorPicker.rootElement,

                    jsml.div("controls", [
                        jsml.button({
                            onClick: async () => {
                                if (result.name === "" || result.icon === "") {
                                    await window_alert("Name and icon must be set", WINDOW_ALERT_SETTINGS);
                                    return;
                                }

                                ret = result;
                                window_close(w);
                            }
                        }, 'Ok'),

                        jsml.button({
                            onClick: () => {
                                window_close(w);
                            }
                        }, 'Cancel'),
                    ])
                ]),
                {
                    isDialog: true,
                    isDraggable: true,
                    isMinimizable: false
                }
            );

            updatePreview();
            w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve(ret));
            window_open(w);
        });
    }

    /**
     * @param {FinanceCategory} category
     */
    async saveCategory(category) {
        const api = finance_api();
        if (this.#isAvailable !== true) {
            await window_alert("Finance API is not available: " + this.#unavailableReason, WINDOW_ALERT_SETTINGS);
            return;
        }

        if (!is(await finance_send(api.categories, is(category.id) ? "PUT" : "POST", category))) {
            return;
        }

        await this.refresh();
        tabby_inspect(this.inspect());
    }

    inspect() {
        const api = finance_api();
        const items = jsml.div("finance-categories-listing");
        let selected = undefined;
        let selectedCategory = undefined;

        const deselect = () => {
            selected?.classList.remove("selected");
            selected = undefined;
            selectedCategory = undefined;
        };

        for (const category of this.activeCategories) {
            const item = jsml.div({
                class: "category",
                onClick: () => {
                    const isSelected = item.classList.contains("selected");
                    deselect();

                    if (isSelected) {
                        return;
                    }

                    item.classList.add("selected");
                    selected = item;
                    selectedCategory = category;
                }
            }, [
                finance_CategoryBadge(category),
                jsml.span(_, category.name)
            ]);

            items.append(item);
        }

        return [
            TitleInspector("Finance"),

            HRInspector(),

            NumberInspector(this.target, () => true, "Monthly budget", "10000", this.currency, {
                min: "0",
                step: "100",
                onChange: event => {
                    const value = Number(event.target.value);
                    if (event.target.value === "" || isNaN(value) || value < 0) {
                        event.target.value = String(this.target);
                        return;
                    }

                    this.#config.target = value;
                    tabby_save();
                    this.renderChart();
                }
            }),

            SelectInspector(
                async value => {
                    this.#config.currency = value;
                    tabby_save();
                    await this.refresh();
                    tabby_inspect(this.inspect());
                    return true;
                },
                FINANCE_CURRENCIES.map(currency => ({
                    text: currency,
                    value: currency,
                    selected: currency === this.currency
                })),
                "Preferred currency"
            ),

            HRInspector(),

            Optional(this.#isAvailable === false, NoteInspector("Finance API is not available: " + this.#unavailableReason)),

            jsml.div("i-finance", [
                jsml.span(_, "Categories"),
                items,
                jsml.div('row', [
                    jsml.button({
                        onClick: async () => {
                            const category = await this.inspectCategory();
                            if (!is(category)) {
                                return;
                            }

                            await this.saveCategory(category);
                        }
                    }, "Add"),
                    jsml.button({
                        onClick: async () => {
                            if (!is(selectedCategory)) {
                                return;
                            }

                            const category = await this.inspectCategory(selectedCategory);
                            if (!is(category)) {
                                return;
                            }

                            await this.saveCategory(category);
                        }
                    }, "Edit"),
                    jsml.button({
                        onClick: async () => {
                            if (!is(selectedCategory) || this.#isAvailable !== true) {
                                return;
                            }

                            if (!(await window_confirm(`Do you want to delete category '${selectedCategory.name}'?`, WINDOW_CONFIRM_SETTINGS))) {
                                return;
                            }

                            const result = await finance_request(
                                finance_url(api.categories, { id: selectedCategory.id }),
                                { method: "DELETE" }
                            );

                            if (!is(result)) {
                                return;
                            }

                            await this.refresh();
                            tabby_inspect(this.inspect());
                        }
                    }, "Delete"),
                ])
            ]),
        ];
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
 * Keeps only digits and a single decimal separator with at most two decimals.
 *
 * @param {string} value
 * @return {string}
 */
function finance_sanitizeAmount(value) {
    value = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");

    const dot = value.indexOf(".");
    if (dot === -1) {
        return value;
    }

    return value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "").slice(0, 2);
}

/**
 * @param {FinanceCategory[]} categories
 * @param {string} currency preferred currency
 * @param {(draft: FinanceTransactionDraft) => Promise<any>} submit resolves to undefined when saving failed
 * @return {Promise<boolean>} whether the expense was saved
 */
function finance_openExpenseDialog(categories, currency, submit) {
    return new Promise(resolve => {
        let saved = false;
        let isSubmitting = false;
        /** @type {FinanceCategory | undefined} */
        let selectedCategory = undefined;

        const categoryButtons = categories.map(category => {
            const button = jsml.button({
                class: "category",
                type: "button",
                onClick: () => {
                    for (const b of categoryButtons) {
                        b.classList.toggle("selected", b === button);
                    }

                    selectedCategory = category;
                }
            }, [
                finance_CategoryBadge(category),
                jsml.span(_, category.name)
            ]);

            return button;
        });

        const dateInput = jsml.input({ type: "date", value: finance_isoDate() });
        const noteInput = jsml.input({ type: "text", placeholder: "Note" });

        const currencySelect = jsml.select(_, FINANCE_CURRENCIES.map(c =>
            new Option(c, c, _, c === currency)
        ));

        const amountInput = jsml.input({
            class: "amount-input",
            type: "text",
            inputmode: "decimal",
            autocomplete: "off",
            placeholder: "0",
            onInput: () => setAmount(amountInput.value),
            onKeydown: event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    trySubmit();
                }
            }
        });

        const setAmount = value => {
            const sanitized = finance_sanitizeAmount(value);
            if (amountInput.value !== sanitized) {
                amountInput.value = sanitized;
            }
        };

        const press = key => {
            switch (key) {
                case "⌫":
                    setAmount(amountInput.value.slice(0, -1));
                    break;

                case "C":
                    setAmount("");
                    break;

                default:
                    setAmount(amountInput.value + key);
                    break;
            }
        };

        const keypad = jsml.div("keypad", [
            ..."789⌫456C123".split("").map(key => jsml.button({
                class: "key" + (/[0-9]/.test(key) ? "" : " function"),
                type: "button",
                tabindex: "-1",
                onClick: () => press(key)
            }, key)),
            jsml.button({ class: "key zero", type: "button", tabindex: "-1", onClick: () => press("0") }, "0"),
            jsml.button({ class: "key", type: "button", tabindex: "-1", onClick: () => press(".") }, "."),
            jsml.button({
                class: "key submit",
                type: "button",
                tabindex: "-1",
                title: "Add expense",
                onClick: () => trySubmit()
            }, Icon("nf-fa-check", "✓"))
        ]);

        // keep the focus (and the caret) in the amount input while clicking the keypad
        keypad.addEventListener("mousedown", event => event.preventDefault());

        const trySubmit = async () => {
            if (isSubmitting) {
                return;
            }

            const amount = Number(amountInput.value);

            if (!is(selectedCategory)) {
                await window_alert("Select a category", WINDOW_ALERT_SETTINGS);
                return;
            }

            if (dateInput.value === "") {
                await window_alert("Select a date", WINDOW_ALERT_SETTINGS);
                return;
            }

            if (amountInput.value === "" || isNaN(amount) || amount <= 0) {
                await window_alert("Amount must be greater than zero", WINDOW_ALERT_SETTINGS);
                return;
            }

            isSubmitting = true;
            const result = await submit({
                categoryId: selectedCategory.id,
                date: dateInput.value,
                amount,
                currency: currencySelect.value,
                baseCurrency: currency,
                note: noteInput.value.trim()
            });
            isSubmitting = false;

            if (!is(result)) {
                return;
            }

            saved = true;
            window_close(w);
        };

        const w = window_create(
            "Add expense",
            jsml.div("finance-dialog", [
                jsml.div("categories", categoryButtons),
                LabelAndComponentInspector("field", "Date", dateInput),
                LabelAndComponentInspector("field", "Note", noteInput),
                jsml.div("amount", [amountInput, currencySelect]),
                keypad
            ]),
            FINANCE_DIALOG_SETTINGS
        );

        w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve(saved));
        window_open(w);
        amountInput.focus();
    });
}



const finance_builder = new FunctionalTabbyBuilder(
    FINANCE_BUILDER,
    config => new FinanceWidget(config)
);



tabby_addBuilder(finance_builder);
tabby_addPrefab(
    tabby_PrefabElement(finance_builder, Icon('nf-fa-money_check_dollar'), "Finance")
);
