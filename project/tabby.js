/**
 * @return {TabbyApi|null|any}
 */
function api_loadTabby() {
    return api_getObject("#api-startuh");
}



const TABBY_ANIMATION_DURATION = 500;
/** Pixels the pointer has to travel before a widget starts to be dragged in edit mode */
const TABBY_DRAG_THRESHOLD = 4;
/** Unit of the saved widget offsets, older configs without it store fractions of the container size */
const TABBY_POSITION_UNIT = "px";
const TABBY_KEY_LAYOUT = "tabby_layout";
const TABBY_KEY_EDIT_MODE = "tabby_edit-mode";
const TABBY_KEY_WIDGETS = "tabby_widgets";
const TABBY_KEY_RANDOM_BACKGROUNDS = "tabby_random_backgrounds";

const tabby_editMode = new Impulse({ default: false });
const tabby_content = $(".layers > .content");
const tabby_inspector = $(".inspector-container > .inspector");
const tabby_widgets_element = $(".widgets > .container");
/** @type {Map<HTMLElement, TabbyWidget>} */
const tabby_widgets = new Map();
/** @type {Map<string, TabbyBuilder>} */
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
        /** @type {TabbyWidgetConfig} */
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

    const api = api_loadTabby();
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
        TitleInspector('Tabby'),

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
 * @param {TabbyBuilder} builder
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
 * @implements {TabbyBuilder<T, TabbyWidgetConfig>}
 */
class FunctionalTabbyBuilder {
    /** @type {(config?: TabbyWidgetConfig) => T} */
    #builder;

    /** @type {string} */
    #name;



    /**
     * @param {string} name
     * @param {(config?: TabbyWidgetConfig) => TabbyWidget} builder
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
            x: 0,
            y: 0,
            anchorX: "center",
            anchorY: "center",
            positionUnit: TABBY_POSITION_UNIT
        });
    }

    get name() {
        return this.#name;
    }
}

class TabbyWidget {
    /** @type {Vec2} */
    position = new Vec2(0, 0);

    /** @type {TabbyAnchor} */
    anchorX = "center";

    /** @type {TabbyAnchor} */
    anchorY = "center";



    setConfig(config) {
        this.position = new Vec2(config.x, config.y);
        // configs saved before anchors existed are relative to the top left corner
        this.anchorX = config.anchorX ?? "start";
        this.anchorY = config.anchorY ?? "start";
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {TabbyAnchor} anchorX
     * @param {TabbyAnchor} anchorY
     */
    setPosition(x, y, anchorX, anchorY) {
        this.position = new Vec2(x, y);
        this.anchorX = anchorX;
        this.anchorY = anchorY;
        tabby_save();
    }

    instantiate() {
        return tabby_WidgetElement(this, "Widget");
    }
    
    createBaseWidgetSettings() {
        return [
            NumberInspector(this.position.x, value => {
                this.setPosition(value, this.position.y, this.anchorX, this.anchorY);
                return true;
            }, "Position X", _, 'px'),

            NumberInspector(this.position.y, value => {
                this.setPosition(this.position.x, value, this.anchorX, this.anchorY);
                return true;
            }, "Position Y", _, 'px'),
            
            SelectInspector(value => {
                this.setPosition(this.position.x, this.position.y, value, this.anchorY);
                return true;
            }, selectOption([
                { value: "start", text: "Start" },
                { value: "center", text: "Center" },
                { value: "end", text: "End" },
            ], this.anchorX), "Anchor X"),
            
            SelectInspector(value => {
                this.setPosition(this.position.x, this.position.y, this.anchorX, value);
                return true;
            }, selectOption([
                { value: "start", text: "Start" },
                { value: "center", text: "Center" },
                { value: "end", text: "End" },
            ], this.anchorY), "Anchor Y"),
        ];
    }

    /**
     * @return {Content}
     */
    inspect() {
        return [];
    }

    /**
     * @returns {TabbyWidgetConfig}
     */
    save() {
        return {
            builder: "",
            x: this.position.x,
            y: this.position.y,
            anchorX: this.anchorX,
            anchorY: this.anchorY,
            positionUnit: TABBY_POSITION_UNIT,
        }
    }
}



/**
 * Picks the anchor whose point on the widget (start edge, center, end edge) is closest to the same point on the
 * container and computes the offset from it in pixels.
 *
 * @param {number} start widget start edge relative to the container
 * @param {number} size widget size
 * @param {number} containerSize
 * @returns {{ anchor: TabbyAnchor, offset: number }}
 */
function tabby_closestAnchor(start, size, containerSize) {
    const candidates = [
        { anchor: "start", distance: start },
        { anchor: "center", distance: start + size / 2 - containerSize / 2 },
        { anchor: "end", distance: containerSize - (start + size) },
    ];

    let closest = candidates[0];
    for (const candidate of candidates) {
        if (Math.abs(candidate.distance) < Math.abs(closest.distance)) {
            closest = candidate;
        }
    }

    return {
        anchor: closest.anchor,
        offset: Math.round(closest.distance)
    };
}

/**
 * Positions the widget along one axis purely with CSS, so the browser keeps it at the same distance from its anchor
 * when the container or the widget itself is resized. Widgets have `margin: auto` and `fit-content` size, so when
 * both insets are set the widget is centered between them.
 *
 * @param {HTMLElement} element
 * @param {TabbyAnchor} anchor
 * @param {number} offset pixels from the anchor
 * @param {"left" | "top"} startProperty
 * @param {"right" | "bottom"} endProperty
 */
function tabby_placeAxis(element, anchor, offset, startProperty, endProperty) {
    const pixels = value => value + "px";

    switch (anchor) {
        case "end":
            element.style[startProperty] = "auto";
            element.style[endProperty] = pixels(offset);
            break;

        case "center":
            // shrinking the centering region from one side by twice the offset moves its middle by the offset
            element.style[startProperty] = pixels(Math.max(0, 2 * offset));
            element.style[endProperty] = pixels(Math.max(0, -2 * offset));
            break;

        default:
            element.style[startProperty] = pixels(offset);
            element.style[endProperty] = "auto";
            break;
    }
}

/**
 * @param {TabbyWidget} context
 * @param {Content} content
 * @param {number | undefined} x
 * @param {number | undefined} y
 * @param {TabbyAnchor | undefined} anchorX
 * @param {TabbyAnchor | undefined} anchorY
 * @param {string | undefined} positionUnit missing in configs that store the offsets as fractions of the container
 */
function tabby_WidgetElement(context, content, { x, y, anchorX, anchorY, positionUnit } = {}) {
    // pointer is down, but the widget is not dragged until it moves past TABBY_DRAG_THRESHOLD
    let pressed = false;
    let moving = false;
    let pressPosition = std_vec2(0, 0);
    let mouseOffset = std_vec2(0, 0);

    let horizontal = is(x)
        ? { anchor: anchorX ?? "start", offset: x }
        : { anchor: "center", offset: 0 };
    let vertical = is(y)
        ? { anchor: anchorY ?? "start", offset: y }
        : { anchor: "center", offset: 0 };

    if (positionUnit !== TABBY_POSITION_UNIT) {
        // Offsets used to be fractions of the container, convert them once with the current container size, so the
        // widget stays where it was. The pixels are stored on the next save, without saving here, because the widget
        // is not registered yet while it is being instantiated.
        const container = tabby_content.getBoundingClientRect();
        horizontal.offset = Math.round(horizontal.offset * container.width);
        vertical.offset = Math.round(vertical.offset * container.height);
        context.position = new Vec2(horizontal.offset, vertical.offset);
    }

    const widget = jsml.div({
        class: "widget glass",

        /** @param {PointerEvent} event */
        onPointerDown: event => {
            if (!tabby_editMode.value() || event.button !== 0) {
                return;
            }

            const that = widget.getBoundingClientRect();
            mouseOffset = std_vec2(event.x - that.x, event.y - that.y);
            pressPosition = std_vec2(event.x, event.y);
            pressed = true;
        },

        /** @param {PointerEvent} event */
        onPointerMove: event => {
            if (!pressed) {
                return;
            }

            if (!moving) {
                if (Math.hypot(event.x - pressPosition.x, event.y - pressPosition.y) < TABBY_DRAG_THRESHOLD) {
                    return;
                }

                // Capturing on pointer down would retarget the click to the widget, so buttons inside would never
                // receive it. Capturing only once dragging starts keeps clicks working and still prevents a drag
                // from ending with a click inside the widget.
                widget.setPointerCapture(event.pointerId);
                moving = true;
            }

            const that = widget.getBoundingClientRect();
            const container = widget.parentElement.getBoundingClientRect();

            const x = event.x - mouseOffset.x;
            const y = event.y - mouseOffset.y;

            const widgetX = std_clamp(0, container.width - that.width, x - container.x);
            const widgetY = std_clamp(0, container.height - that.height, y - container.y);

            horizontal = tabby_closestAnchor(widgetX, that.width, container.width);
            vertical = tabby_closestAnchor(widgetY, that.height, container.height);

            tabby_placeAxis(widget, horizontal.anchor, horizontal.offset, "left", "right");
            tabby_placeAxis(widget, vertical.anchor, vertical.offset, "top", "bottom");
        },

        /** @param {PointerEvent} event */
        onPointerUp: event => {
            pressed = false;

            if (!moving) {
                return;
            }

            context.setPosition(horizontal.offset, vertical.offset, horizontal.anchor, vertical.anchor);
            widget.releasePointerCapture(event.pointerId);
            moving = false;
        },

        onPointerCancel: () => {
            pressed = false;

            if (!moving) {
                return;
            }

            // keep the position reached so far, the same as a regular drop
            context.setPosition(horizontal.offset, vertical.offset, horizontal.anchor, vertical.anchor);
            moving = false;
        }
    }, content);

    tabby_placeAxis(widget, horizontal.anchor, horizontal.offset, "left", "right");
    tabby_placeAxis(widget, vertical.anchor, vertical.offset, "top", "bottom");

    return widget;
}

/**
 * @param {TabbyBuilder<TabbyWidget, any>} builder
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
