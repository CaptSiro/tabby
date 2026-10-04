const CALENDAR_BUILDER = 'calendar';

const CALENDAR_VISIBLE_COUNT = 5;
/** Relative dates and times are formatted in English like the rest of the widget */
const CALENDAR_LOCALE = "en-US";
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
/** Hours of the quick time buttons in the event dialog */
const CALENDAR_QUICK_HOURS = [9, 12, 15, 18, 21];

const CALENDAR_PAST = "past";
const CALENDAR_TODAY = "today";
const CALENDAR_UPCOMING = "upcoming";
/** Order of the tabs */
const CALENDAR_CATEGORIES = [CALENDAR_PAST, CALENDAR_TODAY, CALENDAR_UPCOMING];
/** Wording per category */
const CALENDAR_CATEGORY_INFO = {
    [CALENDAR_PAST]: { name: "Overdue", icon: "nf-md-calendar_alert", empty: "Nothing overdue" },
    [CALENDAR_TODAY]: { name: "Today", icon: "nf-md-calendar_today", empty: "Nothing planned for today" },
    [CALENDAR_UPCOMING]: { name: "Upcoming", icon: "nf-md-calendar_arrow_right", empty: "Nothing upcoming" },
};

const CALENDAR_DIALOG_SETTINGS = {
    width: "400px",
    isDialog: true,
    isDraggable: true,
    isMinimizable: false
};



/**
 * @return {CalendarApi | null}
 */
function calendar_api() {
    return api_loadTabby()?.calendar ?? null;
}

/**
 * Errors are sent with `$response->sendMessage()`, which renders the Message component as HTML
 *
 * @param {Response} response
 * @return {Promise<string>}
 */
async function calendar_errorMessage(response) {
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
 * @param {string | URL} url
 * @param {RequestInit} options
 * @return {Promise<any | undefined>} undefined when the request failed, true for responses without body
 */
async function calendar_request(url, options = {}) {
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
        await window_alert(await calendar_errorMessage(response), WINDOW_ALERT_SETTINGS);
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
function calendar_send(url, method, body) {
    return calendar_request(url, {
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
function calendar_url(base, query = {}) {
    const url = new URL(base);

    for (const key in query) {
        url.searchParams.set(key, String(query[key]));
    }

    return url;
}

/**
 * @param {number} n
 * @return {string}
 */
function calendar_pad(n) {
    return String(n).padStart(2, "0");
}

/**
 * @param {Date} date
 * @return {string} YYYY-MM-DD in local time
 */
function calendar_isoDate(date = new Date()) {
    return `${date.getFullYear()}-${calendar_pad(date.getMonth() + 1)}-${calendar_pad(date.getDate())}`;
}

/**
 * @param {Date} date
 * @return {string} HH:MM in local time
 */
function calendar_isoTime(date = new Date()) {
    return `${calendar_pad(date.getHours())}:${calendar_pad(date.getMinutes())}`;
}

/**
 * @param {string} datetime YYYY-MM-DD HH:MM:SS in local time
 * @return {Date}
 */
function calendar_parse(datetime) {
    return new Date(datetime.replace(" ", "T"));
}

/**
 * @param {Date} date
 * @return {Date} midnight of the date's day
 */
function calendar_startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * @param {Date} date
 * @param {number} days
 * @return {Date} new date
 */
function calendar_addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/**
 * @param {Date} date
 * @param {boolean} isMilitaryTime
 * @return {string} e.g. 5:00 PM or 17:00
 */
function calendar_formatTime(date, isMilitaryTime) {
    return date.toLocaleTimeString(CALENDAR_LOCALE, {
        hour: "numeric",
        minute: "2-digit",
        hour12: !isMilitaryTime
    });
}

/**
 * Distance in calendar days, so an event tomorrow morning is "in 1 day" even when it is less than 24 hours away.
 *
 * @param {Date} date
 * @param {Date} now
 * @return {string} e.g. 1 day ago, in 2 months
 */
function calendar_formatRelative(date, now = new Date()) {
    // rounded, days around daylight saving changes are not exactly 24 hours long
    const days = Math.round((calendar_startOfDay(date) - calendar_startOfDay(now)) / CALENDAR_DAY_MS);
    const abs = Math.abs(days);

    let value = days;
    let unit = "day";

    if (abs >= 365) {
        value = Math.round(days / 365.25);
        unit = "year";
    } else if (abs >= 30) {
        value = Math.round(days / 30.44);
        unit = "month";
    } else if (abs >= 7) {
        value = Math.round(days / 7);
        unit = "week";
    }

    return new Intl.RelativeTimeFormat(CALENDAR_LOCALE, { numeric: "always" }).format(value, unit);
}

/**
 * @param {Date} date
 * @param {boolean} isMilitaryTime
 * @return {string} full date and time for tooltips
 */
function calendar_formatFull(date, isMilitaryTime) {
    return date.toLocaleDateString(CALENDAR_LOCALE, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    }) + ", " + calendar_formatTime(date, isMilitaryTime);
}

/**
 * @param {CalendarEvent} event
 * @param {Date} now
 * @return {CalendarCategory}
 */
function calendar_categoryOf(event, now = new Date()) {
    const date = calendar_parse(event.datetime);
    const today = calendar_startOfDay(now);

    if (date < today) {
        return CALENDAR_PAST;
    }

    if (date < calendar_addDays(today, 1)) {
        return CALENDAR_TODAY;
    }

    return CALENDAR_UPCOMING;
}



class CalendarWidget extends TabbyWidget {
    /** @type {CalendarWidgetConfig} */
    #config;
    /** @type {HTMLElement} */
    #display;
    /** @type {HTMLElement | undefined} */
    #element;
    /** @type {HTMLElement} segmented slider of the categories, built once so the highlight can slide */
    #track;
    /** @type {Map<CalendarCategory, { tab: HTMLElement, radio: HTMLInputElement, count: HTMLElement }>} */
    #tabs = new Map();
    /** @type {HTMLElement} */
    #listing;

    /** @type {CalendarEvent[]} in chronological order */
    #events = [];
    /** @type {CalendarCategory} */
    #category = CALENDAR_TODAY;
    /** The category is chosen automatically once, after the events are loaded for the first time */
    #isCategoryChosen = false;
    #isExpanded = false;
    /** @type {boolean | undefined} undefined until the health endpoint answers */
    #isAvailable;
    #unavailableReason = "";



    constructor(config) {
        super();

        this.#config = config;
        this.setConfig(config);

        const { div, button, span, label, input } = jsml;
        const name = std_id_html(8);

        this.#track = div("track", CALENDAR_CATEGORIES.map(category => {
            const info = CALENDAR_CATEGORY_INFO[category];
            const radio = input({
                type: "radio",
                name,
                value: category,
                onChange: () => this.select(category)
            });
            const count = span("count", "0");
            const tab = label({ class: "tab " + category, title: info.name }, [
                radio,
                span("name", info.name),
                count
            ]);

            this.#tabs.set(category, { tab, radio, count });
            return tab;
        }));

        this.#track.style.setProperty("--count", String(CALENDAR_CATEGORIES.length));

        this.#listing = div("listing");
        this.#display = div("w-calendar", [
            div("tabs", [
                this.#track,
                button({
                    class: "add",
                    title: "Add Event",
                    onClick: () => this.addEvent()
                }, Icon("nf-md-calendar_plus", "+"))
            ]),
            this.#listing
        ]);

        // other tabs may have changed events
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && this.#element?.isConnected) {
                this.refresh().then();
            }
        });

        // relative dates and categories change with time
        setInterval(() => {
            if (this.#element?.isConnected) {
                this.render();
            }
        }, 60 * 1000);

        this.render();
        this.refresh().then();
    }



    get visibleCount() {
        return this.#config.visibleCount ?? CALENDAR_VISIBLE_COUNT;
    }

    get isMilitaryTime() {
        return this.#config.isMilitaryTime ?? false;
    }

    /**
     * Done events are not shown as overdue. Overdue events are ordered from the most recent, the others
     * chronologically with done events at the end.
     *
     * @param {CalendarCategory} category
     * @return {CalendarEvent[]}
     */
    eventsOf(category) {
        const now = new Date();
        const events = this.#events.filter(event => calendar_categoryOf(event, now) === category);

        if (category === CALENDAR_PAST) {
            return events
                .filter(event => !event.isDone)
                .reverse();
        }

        return [
            ...events.filter(event => !event.isDone),
            ...events.filter(event => event.isDone),
        ];
    }

    /**
     * Overdue counts only unfinished events, which are all the events it shows
     *
     * @param {CalendarCategory} category
     * @return {number}
     */
    countOf(category) {
        return this.eventsOf(category).length;
    }

    /**
     * Today, or upcoming when today is empty, or overdue when upcoming is empty too
     *
     * @return {CalendarCategory}
     */
    defaultCategory() {
        for (const category of [CALENDAR_TODAY, CALENDAR_UPCOMING, CALENDAR_PAST]) {
            if (this.countOf(category) > 0) {
                return category;
            }
        }

        return CALENDAR_TODAY;
    }

    /**
     * @param {CalendarCategory} category
     */
    select(category) {
        this.#isCategoryChosen = true;

        if (this.#category !== category) {
            this.#category = category;
            this.#isExpanded = false;
        }

        this.render();
    }

    /**
     * Failures are shown in the widget instead of alerts, the check is repeated on the next refresh
     *
     * @return {Promise<boolean>}
     */
    async checkHealth() {
        const api = calendar_api();
        if (!is(api)) {
            this.#unavailableReason = "Calendar API is not defined";
            return false;
        }

        try {
            const response = await fetch(api.health);
            if (response.ok) {
                return true;
            }

            this.#unavailableReason = await calendar_errorMessage(response);
        } catch {
            this.#unavailableReason = "Server is not reachable";
        }

        return false;
    }

    async refresh() {
        if (this.#isAvailable !== true) {
            this.#isAvailable = await this.checkHealth();

            if (!this.#isAvailable) {
                this.render();
                return;
            }
        }

        const events = await calendar_request(calendar_url(calendar_api().events, {
            from: calendar_isoDate()
        }));

        if (!Array.isArray(events)) {
            return;
        }

        this.#events = events;

        if (!this.#isCategoryChosen) {
            this.#isCategoryChosen = true;
            this.#category = this.defaultCategory();
        }

        this.render();
    }

    /**
     * @return {Promise<boolean>} whether the API can be used, alerts the user otherwise
     */
    async ensureAvailable() {
        if (this.#isAvailable === true) {
            return true;
        }

        await window_alert("Calendar API is not available: " + this.#unavailableReason, WINDOW_ALERT_SETTINGS);
        return false;
    }

    render() {
        this.renderTabs();
        this.renderListing();
    }

    renderTabs() {
        for (const [category, { radio, count }] of this.#tabs) {
            const n = this.countOf(category);

            count.textContent = String(n);
            radio.checked = category === this.#category;
        }

        this.#track.style.setProperty("--index", String(CALENDAR_CATEGORIES.indexOf(this.#category)));
    }

    renderListing() {
        const { div, button } = jsml;
        this.#listing.textContent = "";

        if (this.#isAvailable === false) {
            this.#listing.append(div({
                class: "empty",
                title: this.#unavailableReason
            }, "API unavailable"));
            return;
        }

        if (this.#isAvailable !== true) {
            this.#listing.append(div("empty", "Loading…"));
            return;
        }

        const events = this.eventsOf(this.#category);
        if (events.length === 0) {
            this.#listing.append(div("empty", CALENDAR_CATEGORY_INFO[this.#category].empty));
            return;
        }

        const isTruncated = !this.#isExpanded && events.length > this.visibleCount;
        const visible = isTruncated
            ? events.slice(0, this.visibleCount)
            : events;

        for (const event of visible) {
            this.#listing.append(this.renderEvent(event));
        }

        if (events.length > this.visibleCount) {
            this.#listing.append(
                button({
                    class: "show-more",
                    onClick: () => {
                        this.#isExpanded = !this.#isExpanded;
                        this.renderListing();
                    }
                }, isTruncated
                    ? `Show more (${events.length - this.visibleCount})`
                    : "Show less")
            );
        }
    }

    /**
     * @param {CalendarEvent} event
     * @return {HTMLElement}
     */
    renderEvent(event) {
        const { div, span, input } = jsml;
        const date = calendar_parse(event.datetime);
        const edit = () => this.editEvent(event);

        return div(cls("event", { done: event.isDone }), [
            input({
                type: "checkbox",
                checked: event.isDone,
                title: event.isDone ? "Mark as not done" : "Mark as done",
                onChange: e => this.setDone(event, e.target.checked)
            }),
            span({
                class: "label",
                title: event.label,
                onClick: edit
            }, event.label),
            span({
                class: "datetime",
                title: calendar_formatFull(date, this.isMilitaryTime),
                onClick: edit
            }, this.#category === CALENDAR_TODAY
                ? calendar_formatTime(date, this.isMilitaryTime)
                : calendar_formatRelative(date))
        ]);
    }

    instantiate() {
        this.#element = tabby_WidgetElement(this, this.#display, this.#config);
        return this.#element;
    }

    /**
     * Shown right away, reverted when the request fails
     *
     * @param {CalendarEvent} event
     * @param {boolean} isDone
     */
    async setDone(event, isDone) {
        if (!(await this.ensureAvailable())) {
            this.render();
            return;
        }

        event.isDone = isDone;
        this.render();

        const saved = await calendar_send(calendar_api().events, "PUT", event);
        if (!is(saved)) {
            event.isDone = !isDone;
            this.render();
            return;
        }

        Object.assign(event, saved);
        this.render();
    }

    async addEvent() {
        if (!(await this.ensureAvailable())) {
            return;
        }

        const saved = await calendar_openEventDialog({
            isMilitaryTime: this.isMilitaryTime,
            submit: draft => calendar_send(calendar_api().events, "POST", draft),
        });

        if (saved) {
            await this.refresh();
        }
    }

    /**
     * @param {CalendarEvent} event
     */
    async editEvent(event) {
        if (!(await this.ensureAvailable())) {
            return;
        }

        const saved = await calendar_openEventDialog({
            event,
            isMilitaryTime: this.isMilitaryTime,
            submit: draft => calendar_send(calendar_api().events, "PUT", draft),
            remove: () => calendar_request(
                calendar_url(calendar_api().events, { id: event.id }),
                { method: "DELETE" }
            ),
        });

        if (saved) {
            await this.refresh();
        }
    }

    inspect() {
        return [
            TitleInspector("Calendar"),

            HRInspector(),

            NumberInspector(this.visibleCount, () => true, "Visible events", String(CALENDAR_VISIBLE_COUNT), _, {
                min: "1",
                step: "1",
                onChange: event => {
                    const value = Number(event.target.value);
                    if (event.target.value === "" || !Number.isInteger(value) || value < 1) {
                        event.target.value = String(this.visibleCount);
                        return;
                    }

                    this.#config.visibleCount = value;
                    tabby_save();
                    this.renderListing();
                }
            }),

            CheckboxInspector(this.isMilitaryTime, value => {
                this.#config.isMilitaryTime = value;
                tabby_save();
                this.render();
                return true;
            }, "24-hour time"),

            Optional(this.#isAvailable === false, NoteInspector("Calendar API is not available: " + this.#unavailableReason)),
        ];
    }

    save() {
        const ret = {
            ...this.#config,
            ...super.save()
        };

        ret.builder = CALENDAR_BUILDER;

        return ret;
    }
}



/**
 * Add Event dialog, in edit mode when `props.event` is set
 *
 * @param {CalendarEventDialogProps} props
 * @return {Promise<boolean>} whether the event was saved or deleted
 */
function calendar_openEventDialog(props) {
    return new Promise(resolve => {
        const { event, isMilitaryTime, submit, remove } = props;
        const { div, button, input } = jsml;

        let saved = false;
        let isSubmitting = false;

        // new events start at the next full hour
        const initial = is(event)
            ? calendar_parse(event.datetime)
            : new Date(new Date().setMinutes(60, 0, 0));

        const labelInput = input({
            type: "text",
            value: event?.label ?? "",
            placeholder: "Event",
            onKeydown: e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    trySubmit().then();
                }
            }
        });

        const dateInput = input({ type: "date", value: calendar_isoDate(initial) });
        const timeInput = input({ type: "time", value: calendar_isoTime(initial) });

        /**
         * @param {Date} date
         */
        const setDate = date => {
            dateInput.value = calendar_isoDate(date);
        };

        /**
         * @param {number} days
         */
        const offsetDate = days => {
            const current = dateInput.value === ""
                ? new Date()
                : new Date(dateInput.value + "T00:00:00");

            setDate(calendar_addDays(current, days));
        };

        const OffsetDateButton = offset => button(
            { type: "button", onClick: () => offsetDate(offset) },
            offset > 0
                ? "+" + offset
                : String(offset)
        );

        const QuickTimeButton = hours => button({
            type: "button",
            onClick: () => timeInput.value = calendar_pad(hours) + ":00"
        }, calendar_formatTime(new Date(2000, 0, 1, hours), isMilitaryTime));

        const trySubmit = async () => {
            if (isSubmitting) {
                return;
            }

            const label = labelInput.value.trim();

            if (label === "") {
                await window_alert("Label must be set", WINDOW_ALERT_SETTINGS);
                return;
            }

            if (dateInput.value === "") {
                await window_alert("Select a date", WINDOW_ALERT_SETTINGS);
                return;
            }

            if (timeInput.value === "") {
                await window_alert("Select a time", WINDOW_ALERT_SETTINGS);
                return;
            }

            isSubmitting = true;
            const result = await submit({
                id: event?.id,
                label,
                // time inputs may include seconds when set by the browser
                datetime: `${dateInput.value} ${timeInput.value.slice(0, 5)}:00`,
                isDone: event?.isDone ?? false
            });
            isSubmitting = false;

            if (!is(result)) {
                return;
            }

            saved = true;
            window_close(w);
        };

        const w = window_create(
            is(event) ? "Edit Event" : "Add Event",
            div("calendar-dialog", [
                LabelAndComponentInspector("field", "Label", labelInput),

                div(_, [
                    LabelAndComponentInspector("field", "Date", dateInput),
                    div("quick", [
                        OffsetDateButton(-3),
                        OffsetDateButton(-2),
                        OffsetDateButton(-1),
                        button({ type: "button", onClick: () => setDate(new Date()) }, "Now"),
                        OffsetDateButton(+1),
                        OffsetDateButton(+2),
                        OffsetDateButton(+3),
                    ])
                ]),

                div(_, [
                    LabelAndComponentInspector("field", "Time", timeInput),
                    div("quick", CALENDAR_QUICK_HOURS.map(QuickTimeButton))
                ]),

                div("controls", [
                    Optional(is(event) && is(remove), button({
                        type: "button",
                        class: "delete",
                        onClick: async () => {
                            if (!(await window_confirm(`Do you want to delete event '${event.label}'?`, WINDOW_CONFIRM_SETTINGS))) {
                                return;
                            }

                            if (!is(await remove(event))) {
                                return;
                            }

                            saved = true;
                            window_close(w);
                        }
                    }, [Icon("nf-oct-trash"), " Delete"])),

                    button({
                        type: "button",
                        class: "submit",
                        onClick: () => trySubmit()
                    }, [Icon("nf-fa-check", "✓"), is(event) ? " Save" : " Add"]),
                ])
            ]),
            CALENDAR_DIALOG_SETTINGS
        );

        w.addEventListener(EVENT_WINDOW_CLOSED, () => resolve(saved));
        window_open(w);
        labelInput.focus();
    });
}



const calendar_builder = new FunctionalTabbyBuilder(
    CALENDAR_BUILDER,
    config => new CalendarWidget(config)
);



tabby_addBuilder(calendar_builder);
tabby_addPrefab(
    tabby_PrefabElement(calendar_builder, Icon('nf-md-calendar_check'), "Calendar")
);
