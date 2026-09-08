const TABBY_ANIMATION_DURATION = 500;
const TABBY_KEY_LAYOUT = "tabby_layout";
const TABBY_KEY_EDIT_MODE = "tabby_edit-mode";
const TABBY_KEY_WIDGETS = "tabby_widgets";
const TABBY_KEY_RANDOM_BACKGROUNDS = "tabby_random_backgrounds";

const tabby_editMode = new Impulse({ default: false });
const tabby_content = $(".layers > .content");
const tabby_inspector = $(".inspector-container > .inspector");
const tabby_widgets_element = $(".widgets > .container");
/** @type {Map<HTMLElement, StartuhWidget>} */
const tabby_widgets = new Map();
/** @type {Map<string, StartuhBuilder>} */
const tabby_builders = new Map();
const tabby_main = $('main');
const tabby_layout = JSON.parse(localStorage.getItem(TABBY_KEY_LAYOUT) ?? "[300, 300]");

let tabby_animateTimeout = null;
/** @type {HTMLElement | null} */
let tabby_currentWidget = null;



tabby_updateLayout();
if (JSON.parse(localStorage.getItem(TABBY_KEY_EDIT_MODE))) {
    tabby_editToggle();
}



function tabby_load() {
    const widgets = JSON.parse(localStorage.getItem(TABBY_KEY_WIDGETS) ?? "[]");

    for (let i = 0; i < widgets.length; i++) {
        /** @type {StartuhWidgetConfig} */
        const widget = widgets[i];

        const builder = tabby_builders.get(widget.builder);
        if (!is(builder)) {
            continue;
        }

        tabby_addWidget(builder.build(widget));
    }
}

window.addEventListener("load", async () => {
    tabby_load();
    await tabby_chooseRandomBackground();
    tabby_inspect(tabby_defaultInspect());
}, { once: true });

function tabby_save() {
    const configs = [];

    for (const widget of tabby_widgets.values()) {
        configs.push(widget.save());
    }

    localStorage.setItem(
        TABBY_KEY_WIDGETS,
        JSON.stringify(configs)
    );
}



async function tabby_chooseRandomBackground() {
    const image = $("#background-image");
    if (!is(image)) {
        return;
    }

    const chooseRandomly = JSON.parse(localStorage.getItem(TABBY_KEY_RANDOM_BACKGROUNDS ?? "false"));
    if (!chooseRandomly) {
        image.src = image.dataset.default;
        return;
    }

    const api = api_loadStartuh();
    if (!is(api)) {
        return;
    }

    const response = await fetch(api.randomBackground);
    if (await std_fetch_handleServerError(response)) {
        return;
    }

    if (!response.ok) {
        await alert(await response.text());
        return;
    }

    image.src = (await response.json()).file;
}

function tabby_defaultInspect() {
    return [
        TitleInspector('Startuh'),

        HRInspector(),

        CheckboxInspector(Boolean(localStorage.getItem(TABBY_KEY_RANDOM_BACKGROUNDS) ?? "false"), async value => {
            localStorage.setItem(TABBY_KEY_RANDOM_BACKGROUNDS, JSON.stringify(value));
            await tabby_chooseRandomBackground();
            return true;
        }, 'Randomly choose background image')
    ];
}

function tabby_editToggle() {
    tabby_editMode.pulse(!tabby_editMode.value());

    localStorage.setItem(TABBY_KEY_EDIT_MODE, JSON.stringify(tabby_editMode.value()));
    tabby_main.classList.toggle('edit', tabby_editMode.value());

    tabby_main.classList.add("animate");
    if (is(tabby_animateTimeout)) {
        clearTimeout(tabby_animateTimeout);
    }

    tabby_animateTimeout = setTimeout(() => {
        tabby_main.classList.remove("animate");
        tabby_animateTimeout = null;
    }, TABBY_ANIMATION_DURATION);
}

/**
 * @param {StartuhBuilder} builder
 */
function tabby_addBuilder(builder) {
    tabby_builders.set(builder.name, builder);
}

function tabby_addWidget(widget) {
    const element = widget.instantiate();
    tabby_widgets.set(element, widget);

    tabby_addContent(element);

    tabby_save();
}

function tabby_addContent(element) {
    tabby_content.append(element);
}

tabby_content.addEventListener("pointerdown", event => {
    if (!tabby_editMode.value()) {
        return;
    }

    const widgetElement = event.target.classList.contains('widget')
        ? event.target
        : event.target.closest(".widget");

    if (!is(widgetElement)) {
        tabby_currentWidget?.classList.remove("focus");
        tabby_currentWidget = null;
        tabby_inspect(tabby_defaultInspect());
        return;
    }

    if (widgetElement.classList.contains("focus")) {
        return;
    }

    tabby_currentWidget?.classList.remove("focus");
    widgetElement.classList.add("focus");
    tabby_currentWidget = widgetElement;

    const widget = tabby_widgets.get(tabby_currentWidget);
    if (!is(widget)) {
        return;
    }

    tabby_inspect(widget.inspect());
});

window.addEventListener("keydown", event => {
    if (!is(tabby_currentWidget) || !tabby_editMode.value()) {
        return;
    }

    if (event.target.tagName !== "BODY") {
        return;
    }

    if (event.altKey || event.ctrlKey || event.shiftKey) {
        return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
    }

    tabby_currentWidget.remove();
    tabby_widgets.delete(tabby_currentWidget);
    tabby_currentWidget = null;
    tabby_save();
});

function tabby_addPrefab(element) {
    tabby_widgets_element.append(element);
}

/**
 * @param {Content} content
 */
function tabby_inspect(content = undefined) {
    tabby_inspector.innerHTML = "";

    if (!is(content) || (Array.isArray(content) && content.length === 0)) {
        return;
    }

    jsml_addContent(tabby_inspector, content);
}

function tabby_updateLayout() {
    tabby_main.style.setProperty("--column-0", tabby_layout[0] + "px");
    tabby_main.style.setProperty("--column-1", tabby_layout[1] + "px");
    localStorage.setItem(TABBY_KEY_LAYOUT, JSON.stringify(tabby_layout));
}



/**
 * @template T
 * @implements {StartuhBuilder<T, StartuhWidgetConfig>}
 */
class FunctionalStartuhBuilder {
    /** @type {(config?: StartuhWidgetConfig) => T} */
    #builder;

    /** @type {string} */
    #name;



    /**
     * @param {string} name
     * @param {(config?: StartuhWidgetConfig) => StartuhWidget} builder
     */
    constructor(name, builder) {
        this.#name = name;
        this.#builder = builder;
    }



    build(config) {
        return this.#builder(config);
    }

    create() {
        return this.#builder({
            builder: this.#name,
            x: 0.5,
            y: 0.5
        });
    }

    get name() {
        return this.#name;
    }
}

class StartuhWidget {
    /** @type {Vec2} */
    position = new Vec2(0.5, 0.5);



    setConfig(config) {
        this.position = new Vec2(config.x, config.y);
    }

    setPosition(x, y) {
        this.position = new Vec2(x, y);
        tabby_save();
    }

    instantiate() {
        return tabby_WidgetElement(this, "Widget");
    }

    /**
     * @return {Content}
     */
    inspect() {
        return [];
    }

    /**
     * @returns {StartuhWidgetConfig}
     */
    save() {
        return {
            builder: "",
            x: this.position.x,
            y: this.position.y,
        }
    }
}



/**
 * @param {StartuhWidget} context
 * @param {Content} content
 * @param {number | undefined} x
 * @param {number | undefined} y
 */
function tabby_WidgetElement(context, content, { x, y } = {}) {
    const percentage = (a, b) => ((a / b) * 100) + "%";
    const coords = c => is(c) ? (c * 100) + "%" : "50%";

    let moving = false;
    let mouseOffset = std_vec2(0, 0);

    let positionX = x ?? 0.5;
    let positionY = y ?? 0.5;

    const widget = jsml.div({
        class: "widget glass",

        style: {
            left: coords(x),
            top: coords(y)
        },

        /** @param {PointerEvent} event */
        onPointerDown: event => {
            if (!tabby_editMode.value()) {
                return;
            }

            const that = widget.getBoundingClientRect();
            mouseOffset = std_vec2(event.x - that.x, event.y - that.y);

            widget.setPointerCapture(event.pointerId);
            moving = true;
        },

        /** @param {PointerEvent} event */
        onPointerMove: event => {
            if (!moving) {
                return;
            }

            const that = widget.getBoundingClientRect();
            const container = widget.parentElement.getBoundingClientRect();

            const x = event.x - mouseOffset.x;
            const y = event.y - mouseOffset.y;

            const widgetX = std_clamp(0, container.width - that.width, x - container.x);
            const widgetY = std_clamp(0, container.height - that.height, y - container.y);

            positionX = widgetX / container.width;
            positionY = widgetY / container.height;

            widget.style.left = percentage(widgetX, container.width);
            widget.style.top = percentage(widgetY, container.height);
        },

        /** @param {PointerEvent} event */
        onPointerUp: event => {
            context.setPosition(positionX, positionY);
            widget.releasePointerCapture(event.pointerId);
            moving = false;
        }
    }, content);

    return widget;
}

/**
 * @param {StartuhBuilder<StartuhWidget, any>} builder
 * @param {HTMLElement} icon
 * @param {string} name
 */
function tabby_PrefabElement(builder, icon, name) {
    return jsml.div({
        class: "row prefab",
        onClick: () => {
            tabby_addWidget(builder.create());
        }
    }, [
        icon,
        jsml.span(_, name)
    ]);
}

/**
 * @param {HTMLElement} element
 * @param {string} index
 * @param {string} sign
 * @param {string} range
 */
function tabby_resizeHandle(element, { index, sign, range }) {
    sign ??= "1";
    if (!is(index)) {
        return;
    }

    const interval = std_range(range);
    const multiplier = Math.sign(Number(sign));
    const i = Number(index);
    let moving = false;

    element.addEventListener("pointerdown", event => {
        element.setPointerCapture(event.pointerId);
        moving = true;
    });

    element.addEventListener("pointermove", event => {
        if (!moving) {
            return;
        }

        tabby_layout[i] = interval.clamp(tabby_layout[i] + multiplier * event.movementX);
        tabby_updateLayout();
    });

    element.addEventListener("pointerup", event => {
        element.releasePointerCapture(event.pointerId);
        moving = false;
    });
}
