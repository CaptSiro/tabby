/*
 * Code of the finance widget shared with the page of all movements (components/Finance/FinanceMovementsPage): requests,
 * formatting, the catalog of categories and funds, rows of the movements, the ring chart and the dialogs.
 *
 * The dashboard loads the widget files sorted by name, so this file is loaded before finance.js.
 */

const FINANCE_DEFAULT_CURRENCY = 'CZK';
const FINANCE_DEFAULT_COLOR = '#4e79a7';
/** In the 100x100 view box of the ring, stroke width is set in CSS */
const FINANCE_RING_RADIUS = 44;
/** Percent of the circumference between two segments */
const FINANCE_RING_GAP = 0;
const FINANCE_CURRENCIES =["CZK", "EUR", "USD", "GBP", "PLN", "CHF", "HUF", "JPY"];

const FINANCE_TYPE_EXPENSE = "expense";
const FINANCE_TYPE_INCOME = "income";
const FINANCE_TYPE_INVESTMENT = "investment";
/** Wording per movement type */
const FINANCE_TYPES = {
    [FINANCE_TYPE_EXPENSE]: { name: "Expense", plural: "Expenses", add: "Add Expense", edit: "Edit Expense", icon: "nf-md-cash_minus" },
    [FINANCE_TYPE_INCOME]: { name: "Income", plural: "Income", add: "Add Income", edit: "Edit Income", icon: "nf-md-cash_plus" },
    [FINANCE_TYPE_INVESTMENT]: { name: "Investment", plural: "Investments", add: "Add Investment", edit: "Edit Investment", icon: "nf-md-chart_line" },
};
/** Funds are shown as categories of investments, they have no icon and color of their own */
const FINANCE_FUND_ICON = "nf-md-chart_line";
/** Picked by the id of the fund, so a fund keeps its color */
const FINANCE_FUND_COLORS = ["#4e79a7", "#59a14f", "#b07aa1", "#76b7b2", "#edc948", "#f28e2b", "#9c755f", "#ff9da7"];

const FINANCE_DIALOG_SETTINGS = {
    width: "400px",
    isDialog: true,
    isDraggable: true,
    isMinimizable: false
};



/**
 * project/tabby.js (api_loadTabby) is loaded only on the dashboard, the api object is read directly
 *
 * @return {FinanceApi | null}
 */
function finance_api() {
    return api_getObject("#api-startuh")?.finance ?? null;
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
 * @param {string} month YYYY-MM
 * @param {number} months
 * @return {string} YYYY-MM
 */
function finance_shiftMonth(month, months) {
    const [year, index] = month.split("-").map(Number);
    const date = new Date(year, index - 1 + months, 1);
    return finance_isoDate(date).slice(0, 7);
}

/**
 * @param {string} month YYYY-MM
 * @param {Intl.DateTimeFormatOptions} format
 * @return {string} e.g. October 2026
 */
function finance_formatMonth(month, format = { month: "long", year: "numeric" }) {
    const date = new Date(month + "-01T00:00:00");
    if (isNaN(date.getTime())) {
        return month;
    }

    return date.toLocaleDateString(undefined, format);
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
 * Unknown categories are treated as expenses
 *
 * @param {FinanceCategory | undefined} category
 * @return {boolean}
 */
function finance_isIncome(category) {
    return category?.type === FINANCE_TYPE_INCOME;
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
 * @param {FinanceFund | undefined} fund
 * @return {FinanceCategory | undefined} the fund shown as a category of investments
 */
function finance_fundCategory(fund) {
    if (!is(fund)) {
        return undefined;
    }

    return {
        id: fund.id,
        name: fund.name,
        icon: FINANCE_FUND_ICON,
        color: FINANCE_FUND_COLORS[fund.id % FINANCE_FUND_COLORS.length],
        type: FINANCE_TYPE_INVESTMENT,
        isDeleted: fund.isDeleted,
    };
}

/**
 * Categories and funds the movements reference. Funds are the categories of investments.
 */
class FinanceCatalog {
    /** @type {FinanceCategory[]} */
    categories = [];
    /** @type {FinanceFund[]} */
    funds = [];



    /**
     * @param {FinanceCategory[]} categories
     * @param {FinanceFund[]} funds
     */
    constructor(categories = [], funds = []) {
        this.set(categories, funds);
    }



    /**
     * @param {FinanceCategory[]} categories
     * @param {FinanceFund[]} funds
     */
    set(categories, funds = this.funds) {
        this.categories = categories;
        this.funds = funds;
    }

    /**
     * @param {number} id
     * @return {FinanceCategory | undefined}
     */
    category(id) {
        return this.categories.find(category => category.id === id);
    }

    /**
     * @param {number} id
     * @return {FinanceFund | undefined}
     */
    fund(id) {
        return this.funds.find(fund => fund.id === id);
    }

    /**
     * @param {FinanceMovementType} type
     * @param {number} id id of a category, of a fund for investments
     * @return {FinanceCategory | undefined}
     */
    categoryOfType(type, id) {
        return type === FINANCE_TYPE_INVESTMENT
            ? finance_fundCategory(this.fund(id))
            : this.category(id);
    }

    /**
     * @param {FinanceMovement} movement
     * @return {FinanceCategory | undefined} category of the movement, the fund for investments
     */
    categoryOf(movement) {
        return movement.type === FINANCE_TYPE_INVESTMENT
            ? this.categoryOfType(movement.type, movement.fundId)
            : this.categoryOfType(movement.type, movement.categoryId);
    }

    /**
     * @param {FinanceMovementType} type
     * @param {boolean} includeDeleted deleted ones are only known when something references them
     * @return {FinanceCategory[]} categories of the type, funds for investments
     */
    of(type, includeDeleted = false) {
        const categories = type === FINANCE_TYPE_INVESTMENT
            ? this.funds.map(finance_fundCategory)
            : this.categories.filter(category => (category.type ?? FINANCE_TYPE_EXPENSE) === type);

        return includeDeleted
            ? categories
            : categories.filter(category => !category.isDeleted);
    }
}



/**
 * Category icon in a circle with the category color.
 *
 * @param {FinanceCategory | undefined} category
 * @return {HTMLElement}
 */
function finance_CategoryBadge(category) {
    return html.element(html`
        <div
            class="finance-badge"
            title="${category?.name ?? "Unknown category"}"
            style="${{ backgroundColor: category?.color ?? "gray" }}"
        >
            ${category?.icon?.length === 1
                ? html`<span>${category.icon}</span>`
                : nf(category?.icon || "nf-fa-question", "?")}
        </div>
    `);
}

/**
 * Row of a movement in the widget and on the page of all movements. Investments show their fund as the category.
 *
 * @param {FinanceMovement} movement
 * @param {FinanceCatalog} catalog
 * @param {() => any} onClick
 * @return {HTMLElement}
 */
function finance_MovementRow(movement, catalog, onClick) {
    const isInvestment = movement.type === FINANCE_TYPE_INVESTMENT;
    const category = catalog.categoryOf(movement);
    const name = category?.name ?? (isInvestment ? "Unknown fund" : "Unknown category");
    const note = isInvestment ? "" : movement.note;
    const isForeign = !isInvestment && movement.currency !== movement.baseCurrency;

    return html.element(html`
        <div
            class="${['finance-movement', movement.type]}"
            title="${FINANCE_TYPES[movement.type]?.name ?? ""}"
            onClick="${onClick}"
        >
            ${finance_CategoryBadge(category)}

            <div class="info">
                <span class="note">${note || name}</span>
                <span class="date">${finance_formatDate(movement.date) + (note ? " · " + name : "")}</span>
            </div>

            <div class="amount">
                <span>${finance_formatMoney(movement.amount, movement.currency)}</span>

                ${isForeign
                    ? html`
                        <span class="converted" title="1 ${movement.currency} = ${movement.rate} ${movement.baseCurrency}">
                            ${"≈ " + finance_formatMoney(movement.amount * movement.rate, movement.baseCurrency)}
                        </span>
                    `
                    : undefined}
            </div>
        </div>
    `);
}

/**
 * Each segment is an arc of the same circle, drawn with a dash of the segment's length. The circle's length is
 * normalized to 100 by `pathLength`, so the dashes are in percent.
 *
 * @param {SVGElement} ring svg with the view box 0 0 100 100 and the class finance-ring
 * @param {{ color: string, fraction: number, isDimmed?: boolean, title?: string }[]} segments fractions of the whole
 * ring, in drawing order
 */
function finance_renderRing(ring, segments) {
    ring.textContent = "";
    segments = segments.filter(segment => segment.fraction > 0);

    // gaps only separate segments, a single segment is a full ring
    const gap = segments.length > 1 ? FINANCE_RING_GAP : 0;
    let start = 0;

    ring.append(finance_svg("circle", {
        class: "inner",
        cx: 50,
        cy: 50,
        r: FINANCE_RING_RADIUS - 8,
        pathLength: 100,
    }));

    for (const { color, fraction, isDimmed, title } of segments) {
        const length = fraction * 100;
        // segments too short for a gap are drawn whole
        const visible = length > 2 * gap ? length - gap : length;

        const arc = finance_svg("circle", {
            class: "segment" + (isDimmed ? " dimmed" : ""),
            cx: 50,
            cy: 50,
            r: FINANCE_RING_RADIUS,
            pathLength: 100,
            "stroke-dasharray": `${visible} ${100 - visible}`,
            "stroke-dashoffset": -(start + (length - visible) / 2),
        });

        // presentation attributes do not support CSS variables
        arc.style.stroke = color;

        if (is(title)) {
            const tooltip = finance_svg("title");
            tooltip.textContent = title;
            arc.append(tooltip);
        }

        ring.append(arc);
        start += length;
    }
}



/**
 * `TabbyRadioGroup` with the label on the left and the radios as a segmented slider on the right. The highlight
 * slides to the checked radio.
 *
 * @param {{ radios: KeyValuePair[], setValue: Writter<string>, label?: string }} props
 * @return {HTMLElement}
 */
function finance_RadioSlider(props) {
    const group = TabbyRadioGroup(props);
    group.classList.add("finance-radio-slider");

    const items = [...group.querySelectorAll(".radio-container")];
    const track = html.element(html`
        <div class="track" style="${{ '--count': String(items.length) }}">
            ${items}
        </div>
    `);

    const update = () => {
        const index = items.findIndex(item => item.querySelector("input").checked);
        track.style.setProperty("--index", String(Math.max(0, index)));
        track.classList.toggle("unset", index === -1);
    };

    // the group listens for changes, the radios keep notifying it from inside the track
    group.append(track);
    group.addEventListener("change", update);
    update();

    return group;
}

/**
 * @param {Opt<FinanceCategory>} category
 * @returns {Promise<Opt<FinanceCategory>>}
 */
function finance_openCategoryDialog(category = null) {
    return new Promise(resolve => {
        const result = is(category)
            ? { ...category }
            : {
                name: "",
                icon: "",
                color: FINANCE_DEFAULT_COLOR,
                type: FINANCE_TYPE_EXPENSE
            };

        result.type ??= FINANCE_TYPE_EXPENSE;

        let ret = undefined;

        // result is a plain object, the preview is redrawn whenever it changes
        const [revision, setRevision] = signal(0);
        const changed = () => setRevision(r => r + 1);

        /**
         * @param {"name" | "icon"} property
         * @returns {Signal<string>}
         */
        const trimmed = property => [
            () => result[property],
            value => {
                result[property] = value.trim();
                changed();
                return result[property];
            }
        ];

        const colorPicker = new ColorPicker(true);
        colorPicker.rootElement.addEventListener("pick", evt => {
            result.color = ColorPicker.toHex(evt.detail);
            changed();
        });
        colorPicker.setNewFromFormat(result.color);

        const types = [FINANCE_TYPE_EXPENSE, FINANCE_TYPE_INCOME].map(type => ({
            text: FINANCE_TYPES[type].name,
            value: type,
            selected: type === result.type
        }));

        const confirm = async () => {
            if (result.name === "" || result.icon === "") {
                await window_alert("Name and icon must be set", WINDOW_ALERT_SETTINGS);
                return;
            }

            ret = result;
            window_close(w);
        };

        const w = window_create(
            "Category",
            () => html`
                <${window_TextWindow}>
                    <div class="finance-category-preview">
                        ${() => {
                            revision();
                            return finance_CategoryBadge(result);
                        }}
                    </div>

                    <${finance_RadioSlider} radios="${types}" setValue="${value => result.type = value}" label="Type" />

                    <${TabbyTextField} value="${trimmed("name")}" label="Name" />
                    <${TabbyTextField} value="${trimmed("icon")}" label="Icon" placeholder="nf-fa-house" />

                    ${colorPicker.rootElement}

                    <div class="controls">
                        <button onClick="${confirm}">Ok</button>
                        <button onClick="${() => window_close(w)}">Cancel</button>
                    </div>
                </>
            `,
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
 * Dialog of a movement with a category picker, date, note (not for investments), keypad for the amount and its
 * currency. The categories of investments are the funds.
 *
 * @param {FinanceMovementDialogProps} props
 * @return {Promise<boolean>} whether the movement was saved or deleted
 */
function finance_openMovementDialog(props) {
    return new Promise(resolve => {
        const { type, categories, currency, submit, movement } = props;
        const isInvestment = type === FINANCE_TYPE_INVESTMENT;

        /** @type {Map<any, FinanceCategory>} */
        const categoryMap = new Map();
        for (const category of categories) {
            categoryMap.set(category.id, category);
        }

        let saved = false;
        let isSubmitting = false;
        /** @type {Promise<boolean> | undefined} result of the dialog opened again after adding a category */
        let reopened = undefined;
        /** @type {Signal<FinanceCategory | undefined>} */
        const [selectedCategory, setSelectedCategory] = signal(
            categoryMap.get(isInvestment ? movement?.fundId : movement?.categoryId)
        );

        const dateInput = /** @type {HTMLInputElement} */ (html.element(html`
            <input type="date" value="${movement?.date ?? finance_isoDate()}">
        `));
        /**
         * @param {Date} date
         */
        const setDate = date => {
            dateInput.value = date.toISOString().split('T')[0];
        }

        /**
         * @param {number} days
         * @param {Date | undefined} date
         */
        const offsetDate = (days, date = undefined) => {
            date ??= new Date(dateInput.value);
            date.setDate(date.getDate() + days);
            setDate(date);
        }

        const noteInput = /** @type {HTMLInputElement} */ (html.element(html`
            <input type="text" value="${movement?.note}" placeholder="Note">
        `));

        const curr = movement?.currency ?? currency;
        const currencySelect = /** @type {HTMLSelectElement} */ (html.element(html`
            <select>
                ${FINANCE_CURRENCIES.map(c => html`<option value="${c}" selected="${c === curr}">${c}</option>`)}
            </select>
        `));

        const amountInput = /** @type {HTMLInputElement} */ (html.element(html`
            <input
                class="amount-input"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="100"
                onInput="${() => setAmount(amountInput.value)}"
                onKeydown="${event => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        trySubmit().then();
                    }
                }}"
            >
        `));

        const setAmount = value => {
            const sanitized = finance_sanitizeAmount(value);
            if (amountInput.value !== sanitized) {
                amountInput.value = sanitized;
            }
        };

        if (is(movement)) {
            setAmount(String(movement.amount));
        }

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

        const trySubmit = async () => {
            if (isSubmitting) {
                return;
            }

            const amount = Number(amountInput.value);
            const category = selectedCategory();

            if (!is(category)) {
                await window_alert(isInvestment ? "Select a fund" : "Select a category", WINDOW_ALERT_SETTINGS);
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
                id: movement?.id,
                categoryId: category.id,
                date: dateInput.value,
                amount,
                currency: currencySelect.value,
                baseCurrency: currency,
                note: isInvestment ? "" : noteInput.value.trim()
            });
            isSubmitting = false;

            if (!is(result)) {
                return;
            }

            saved = true;
            window_close(w);
        };

        const addCategory = () => {
            // the dialog is opened again with the new category, its result is the result of this one
            reopened = Promise.resolve().then(async () => {
                const category = await finance_openCategoryDialog();
                const created = is(category)
                    ? await props.saveCategory(category)
                    : undefined;

                // a category of the other type is not offered
                if (is(created) && (created.type ?? FINANCE_TYPE_EXPENSE) === type) {
                    props.categories.push(created);
                }

                return finance_openMovementDialog(props);
            });

            window_close(w);
        };

        const remove = async () => {
            const name = FINANCE_TYPES[type].name.toLowerCase();
            if (await window_confirm(`Do you want to delete this ${name}?`) && await props.remove(movement)) {
                saved = true;
                window_close(w);
            }
        };

        /**
         * @param {{ offset: number }} props
         * @returns {HTMLElement}
         */
        const OffsetDateButton = ({ offset }) => html.element(html`
            <button onClick="${() => offsetDate(offset)}">
                ${offset > 0
                    ? "+" + offset
                    : String(offset)}
            </button>
        `);

        /**
         * @param {{ key: string, class?: string, title?: string, onClick?: () => any, children?: JsmlContent }} props
         * @returns {HTMLElement}
         */
        const Key = ({ key, class: c = undefined, title = undefined, onClick = () => press(key), children = key }) =>
            html.element(html`
                <button class="${['key', c]}" type="button" tabindex="-1" title="${title}" onClick="${onClick}">
                    ${children}
                </button>
            `);

        const w = window_create(
            FINANCE_TYPES[type][is(movement) ? 'edit' : 'add'],
            () => html`
                <div class="${['finance-dialog', type]}">
                    <div class="categories">
                        ${categories.map(category => html`
                            <button
                                class="${['category', { selected: () => selectedCategory() === category }]}"
                                type="button"
                                onClick="${() => setSelectedCategory(category)}"
                            >
                                ${finance_CategoryBadge(category)}
                                <span>${category.name}</span>
                            </button>
                        `)}

                        <${Show} when="${is(props.saveCategory)}">
                            <button class="category" style="${{ padding: "9px" }}" onClick="${addCategory}">
                                ${nf('nf-fa-plus')}${" Add"}
                            </button>
                        </>
                    </div>

                    <div>
                        <${Labeled} label="Date" class="field">
                            ${dateInput}
                        </>

                        <div style="${{ display: "flex", marginTop: "2px", justifyContent: "space-between" }}">
                            <${OffsetDateButton} offset="${-3}" />
                            <${OffsetDateButton} offset="${-2}" />
                            <${OffsetDateButton} offset="${-1}" />
                            <button onClick="${() => dateInput.value = finance_isoDate()}">Now</button>
                            <${OffsetDateButton} offset="${+1}" />
                            <${OffsetDateButton} offset="${+2}" />
                            <${OffsetDateButton} offset="${+3}" />
                        </div>
                    </div>

                    <${Show} when="${!isInvestment}">
                        <${Labeled} label="Note" class="field">
                            ${noteInput}
                        </>
                    </>

                    <div>
                        <div class="amount">
                            ${amountInput}
                            ${currencySelect}
                        </div>

                        <!-- keeps the focus (and the caret) in the amount input while clicking the keypad -->
                        <div class="keypad" onMousedown="${event => event.preventDefault()}">
                            ${"789⌫456C123".split("").map(key => html`
                                <${Key} key="${key}" class="${/[0-9]/.test(key) ? "function" : undefined}" />
                            `)}
                            <${Key} key="0" class="zero" />
                            <${Key} key="." />
                            <${Key}
                                key="submit"
                                class="submit"
                                title="${FINANCE_TYPES[type][is(movement) ? 'edit' : 'add']}"
                                onClick="${() => trySubmit()}"
                            >${nf("nf-fa-check", "✓")}</>
                        </div>
                    </div>

                    <${Show} when="${is(movement) && is(props.remove)}">
                        <div class="row">
                            <button onClick="${remove}">
                                ${nf('nf-oct-trash')}${" Delete"}
                            </button>
                        </div>
                    </>
                </div>
            `,
            FINANCE_DIALOG_SETTINGS
        );

        w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve(reopened ?? saved));
        window_open(w);
        amountInput.focus();
    });
}

/**
 * Opens the dialog of a new or existing movement, saves and deletes it with the API. Used by the widget and the page
 * of all movements, so both edit the movements the same way. New investments are recorded by the investing plan, the
 * dialog edits existing ones only.
 *
 * @param {FinanceCatalog} catalog offers the categories (funds) of the type that are not deleted
 * @param {{
 *     type: FinanceMovementType,
 *     currency: string,
 *     movement?: FinanceMovement,
 *     saveCategory?: (category: FinanceCategory) => Promise<FinanceCategory | undefined>,
 * }} options currency is the preferred currency, the rates of transactions are resolved against it; saveCategory
 * allows adding categories from the dialog
 * @return {Promise<boolean>} whether the movement was saved or deleted
 */
function finance_openMovementEditor(catalog, { type, currency, movement = undefined, saveCategory = undefined }) {
    const api = finance_api();
    const isInvestment = type === FINANCE_TYPE_INVESTMENT;

    /** @type {FinanceMovementDialogProps} */
    const props = {
        type,
        currency,
        movement,
        categories: catalog.of(type),
        saveCategory: isInvestment ? undefined : saveCategory,
        submit: draft => isInvestment
            ? finance_send(api.investments, "PUT", {
                id: draft.id,
                fundId: draft.categoryId,
                date: draft.date,
                amount: draft.amount,
                currency: draft.currency,
            })
            : finance_send(api.transactions, is(movement) ? "PUT" : "POST", draft),
    };

    if (is(movement)) {
        props.remove = isInvestment
            ? () => finance_request(finance_url(api.investments, { id: movement.id }), { method: "DELETE" })
            : () => finance_send(api.transactions, "DELETE", { id: movement.id });
    }

    return finance_openMovementDialog(props);
}
