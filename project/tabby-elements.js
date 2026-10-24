/**
 * @param {Signal<boolean>} state
 * @param {JsmlContent} label
 * @returns {HTMLElement}
 */
function TabbyCheckbox({ state, label = "" }) {
    const [checked, setChecked] = state;
    
    const checkbox = CheckBox({
        checked,
        label,
        onChange: event => {
            event.target.checked = setChecked(event.target.checked);
        }
    });
    
    checkbox.classList.add("i-checkbox");
    return checkbox;
}

function choose(event, setValue, collection) {
    const value = setValue(event.target.value);
    if (collection.length === 0) {
        return;
    }
    
    for (const element of collection) {
        if (element.value !== value) {
            element["checked"] = false;
            continue;
        }
        
        element["checked"] = true;
    }
    
    return value;
}

/**
 * @param {Writter<string>} setValue
 * @param {KeyValuePair[]} radios
 * @param {string} label
 * @returns {HTMLElement}
 */
function TabbyRadioGroup({ radios, setValue, label = undefined }) {
    const name = std_id_html(8);
    
    const radioGroup = html.element`
        <div class="i-radio-group" onChange="${event => choose(event, setValue, radioGroup.querySelectorAll(`input[name=${name}]`))}">
            <${Show} when="${is(label)}">
                <span>${label}</span>
            </>
            
            <${For} each="${radios}">
                ${x => html`
                    <${Radio} label="${x.text}" value="${x.value}" name="${name}" checked="${x.selected}"/>
                `}
            </>
        </div>
    `;
    
    return radioGroup;
}

/**
 * @param {JsmlTagProps<"textarea"> & { value: Signal<string>, label: string }} props
 * @returns {HTMLElement}
 */
function TabbyTextArea(props) {
    const { value: [text, setText], label = undefined, ...p } = props;
    
    const area = html.element(html`
        <textarea
            value="${text}"
            onBlur="${event => setText(event.target.value)}"
            onKeydown="${event => {
                if (!(event.key === "Enter" && event.ctrlKey)) {
                    return;
                }
                
                event.target.dispatchEvent(new Event("blur"));
            }}"
            ...${p}
        ></textarea>
    `);

    return html.element(html`
        <div class="i-text-area">
            <${Label} label="${label}" target="${area}" />
            ${area}
        </div>
    `);
}

/**
 * @param {JsmlTagProps<"input"> & { value: Signal<string>, label: string }} props
 * @returns {HTMLElement}
 */
function TabbyTextField(props) {
    const { value: [text, setText], label = undefined, ...p } = props;
    
    const textField = html.element(html`
        <input
            type="text"
            value="${text}"
            onBlur="${event => setText(event.target.value)}"
            onKeydown="${event => {
                if (event.key !== "Enter") return;
                event.target.dispatchEvent(new Event("blur"));
            }}"
            ...${p}
        >
    `);
    
    return html.element(html`
        <div class="i-text-field">
            <${Label} label="${label}" target="${textField}" />
            ${input}
        </div>
    `);
}

/**
 * @param {JsmlTagProps<"input"> & { value: Signal<number>, label: string, measurement?: string }} props
 * @returns {HTMLElement}
 */
function TabbyNumber(props) {
    const { value: [value, setValue], label = undefined, measurement = undefined, ...p } = props;
    const id = std_id_html(8);
    
    return html.element(html`
        <div class="i-number">
            <${Show} when="${is(label)}">
                <label for="${id}">
                    ${label}
                </label>
            </>
            
            <input
                id="${id}"
                type="number"
                value="${value}"
                onChange="${event => setValue(Number(event.target.value))}"
                ...${p}
            >
            
            <${Show} when="${is(measurement)}">
                <span>${measurement}</span>
            </>
        </div>
    `);
}

/**
 * @param {JsmlTagProps<"input"> & { value: Signal<Date>, label: string, isDateTime: boolean }} props
 * @returns {HTMLElement}
 */
function TabbyDate(props) {
    const { value: [date, setDate], label = undefined, isDateTime = false, ...p } = props;
    
    const input = html.element(html`
        <input
            type="${isDateTime ? 'datetime-local' : 'date'}"
            onChange="${event => setDate(new Date(event.target.value))}"
        >
    `);
    
    effect(() => {
        const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
        const localDateTime = new Date(date().getTime() - timezoneOffset);
        input.value = localDateTime.toISOString().slice(0, 16);
    });
    
    return (
        LabelAndComponentInspector("i-date", label, input)
    );
}

/**
 * @param {{ options: KeyValuePair[], setValue: Writter<string>, label: string, containerClass?: string }} props
 * @returns {HTMLElement}
 */
function TabbySelect(props) {
    const { options, setValue, label = undefined, containerClass = undefined, ...p } = props;
    const id = std_id_html(8);
    
    const select = html.element(html`
        <select
            onChange="${event => choose(event, setValue, select.children)}"
        >
            <${For} each="${options}">
                ${x => html`
                    <option value="${x.value}" selected="${x.selected}">
                        ${x.text}
                    </option>
                `}
            </>
        </select>
    `);

    return html.element(html`
        <div class="${['i-select dont-force', containerClass]}">
            <${Show} when="${is(label)}">
                <label for="${id}">
                    ${label}
                </label>
            </>
            
            <div class="select-container">
                ${select}
            </div>
        </div>
    `);
}

/**
 * @param {JsmlTagProps<"input"> & { value: Signal<string>, label: string }} props
 * @returns {HTMLElement}
 */
function TabbyColorPicker(props) {
    const { value: [color, setColor], label = undefined, placeholder = undefined, ...p } = props;
    
    const input = html.element(html`
        <input
            type="color"
            value="${color}"
            onChange="${event => setColor(event.target.value)}"
        >
    `);
    
    return LabelAndComponentInspector("i-date", label, input, placeholder);
}

/**
 * @param {} props
 * @returns {HTMLElement}
 */
function TitleInspector(props) {
    return (
        h3("i-title" + (className !== undefined ? " " + className : ""), title)
    );
}

function NoteInspector(note, className = undefined) {
    return (
        jsml.h5("i-note" + (className !== undefined ? " " + className : ""), note)
    );
}

function HRInspector(className = undefined) {
    return (
        div("i-hr" + (className !== undefined ? " " + className : ""), "​") //todo does not display without zero-width-character (?)
    );
}

/**
 * @param {KeyValuePair[]} options
 * @param {string} value
 * @param {string} defaultValue
 * @return {KeyValuePair[]}
 */
function selectOption(options, value, defaultValue = undefined) {
    let defaultOption;
    for (const option of options) {
        if (option.value === defaultValue) {
            defaultOption = option;
        }
        if (option.value !== value) continue;
        
        option.selected = true;
        return options;
    }
    
    defaultOption.selected = true;
    return options;
}

/**
 * @template T
 * @param {string} className
 * @param {string} label
 * @param {HTMLElement} component
 * @param {string | undefined} placeholder
 * @returns {HTMLElement}
 */
function LabelAndComponentInspector(className, label, component, placeholder = undefined) {
    const id = std_id_html(8);
    
    component.id = id;
    if (placeholder) {
        component.setAttribute("placeholder", placeholder);
    }
    
    return (
        div(className, [
            Optional(label !== undefined,
                jsml.label({ for: id }, label)
            ),
            component
        ])
    );
}

function NotInspectorAble() {
    return undefined;
}



class ColorPicker {
    #rootElement;
    /**
     * @return {HTMLElement}
     */
    get rootElement() {
        return this.#rootElement;
    }
    
    #display;
    #red;
    #green;
    #blue;
    #alpha;
    #old;
    #new;
    
    constructor(inline = false, cancelAction = () => {}, pickAction = () => {}) {
        this.#rootElement = ColorPicker.createColorPicker(inline);
        
        this.#red = this.#rootElement.querySelector(".color-picker-r");
        this.#red.addEventListener("input", this.onRgbChange("red"));
        
        this.#green = this.#rootElement.querySelector(".color-picker-g");
        this.#green.addEventListener("input", this.onRgbChange("green"));
        
        this.#blue = this.#rootElement.querySelector(".color-picker-b");
        this.#blue.addEventListener("input", this.onRgbChange("blue"));
        
        this.#alpha = this.#rootElement.querySelector(".color-picker-a");
        this.#alpha.addEventListener("input", this.onRgbChange("alpha"));
        
        this.#display = this.#rootElement.querySelector(".format");
        this.#display.addEventListener("input", event => {
            const color = this.parseColor(event.target.value);
            if (color === null) {
                this.#display.classList.add("invalid");
                return;
            }
            
            this.#display.classList.remove("invalid");
            this.setNewColor(color);
        });
        
        this.#old = this.#rootElement.querySelector(".old");
        this.#new = this.#rootElement.querySelector(".new");
        
        this.#rootElement.querySelector(".cancel")?.addEventListener("click", cancelAction);
        this.#rootElement.querySelector(".pick")?.addEventListener("click", pickAction);
    }
    
    static createColorPicker(inline = false) {
        const guids = Array(5).fill(null).map(() => std_id_html(8));
        
        return (
            div("color-picker", [
                Optional(inline === false,
                    div("showcase", [
                        div("transparent"),
                        div("old"),
                        div("new")
                    ])
                ),
                div("sliders", [
                    div("row", [
                        jsml.label({ for: guids[0] }, "R:"),
                        jsml.input({
                            class: "color-picker-r",
                            type: "range",
                            min: "0",
                            max: "255",
                            value: "0",
                            id: guids[0]
                        })
                    ]),
                    div("row", [
                        jsml.label({ for: guids[1] }, "G:"),
                        jsml.input({
                            class: "color-picker-g",
                            type: "range",
                            min: "0",
                            max: "255",
                            value: "0",
                            id: guids[1]
                        })
                    ]),
                    div("row", [
                        jsml.label({ for: guids[2] }, "B:"),
                        jsml.input({
                            class: "color-picker-b",
                            type: "range",
                            min: "0",
                            max: "255",
                            value: "0",
                            id: guids[2]
                        })
                    ]),
                    div("row", [
                        jsml.label({ for: guids[3] }, "A:"),
                        jsml.input({
                            class: "color-picker-a",
                            type: "range",
                            min: "0",
                            max: "1",
                            step: "0.01",
                            value: "0",
                            id: guids[3]
                        })
                    ])
                ]),
                div("row", [
                    jsml.label({ class: "format-label", for: guids[4] }),
                    jsml.input({ class: "format", type: "text", id: guids[4] })
                ]),
                Optional(inline === false,
                    div("controls", [
                        jsml.button("button-like-main cancel", "Cancel"),
                        jsml.button("button-like-main pick", "Pick")
                    ])
                )
            ])
        );
    }
    
    /**
     * @param {Color} color
     */
    static toHex(color) {
        return "#" + [
            color.red.toString(16),
            color.green.toString(16),
            color.blue.toString(16),
            Math.round(color.alpha * 255).toString(16)
        ]
            .map(channel => (channel.length === 1 ? ("0" + channel) : channel))
            .join("");
    }
    
    setChannel(channel, value) {
        this.#rootElement.style.setProperty("--" + channel, value);
    }
    
    onRgbChange(channel) {
        return event => {
            this.setChannel(channel, event.target.value);
            this.displayCurrentColor();
            this.#rootElement.dispatchEvent(new CustomEvent("pick", { detail: this.getCurrentColor() }));
        };
    }
    
    /**
     * @typedef Color
     * @property {number} red
     * @property {number} green
     * @property {number} blue
     * @property {number} alpha
     */
    /**
     * @param {string} colorFormat
     * @return {Color | null}
     */
    parseColor(colorFormat) {
        let values = /^rgba?\((25[0-5]|2[0-4][0-9]|1?[0-9]{1,2}) ?, ?(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2}) ?, ?(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2}) ?,? ?(1|0|0\.[0-9]+)?\)$/.exec(colorFormat);
        if (values !== null) {
            return {
                red: +values[1],
                green: +values[2],
                blue: +values[3],
                alpha: +(values[4] ?? 1)
            };
        }
        
        switch (colorFormat.length) {
            case 4:
                values = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(colorFormat);
                if (values === null) return null;
                return {
                    red: parseInt(values[1].repeat(2), 16),
                    green: parseInt(values[2].repeat(2), 16),
                    blue: parseInt(values[3].repeat(2), 16),
                    alpha: 1
                };
            case 7:
                values = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(colorFormat);
                if (values === null) return null;
                return {
                    red: parseInt(values[1], 16),
                    green: parseInt(values[2], 16),
                    blue: parseInt(values[3], 16),
                    alpha: 1
                };
            case 9:
                values = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(colorFormat);
                if (values === null) return null;
                return {
                    red: parseInt(values[1], 16),
                    green: parseInt(values[2], 16),
                    blue: parseInt(values[3], 16),
                    alpha: parseInt(values[4], 16) / 255
                };
            default:
                return null;
        }
    }
    
    setOldColor(colorFormat) {
        const color = this.parseColor(colorFormat);
        if (color === null) {
            throw "Unknown color format. Currently supported: RGB, RGBA, HEX(3 letters), HEX (6 letters), HEX + alpha (8 letters)";
        }
        
        this.#old.style.backgroundColor = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha})`;
        this.setNewColor(color);
        this.displayCurrentColor();
    }
    
    setNewFromFormat(colorFormat) {
        const color = this.parseColor(colorFormat);
        if (color === null) {
            throw "Unknown color format. Currently supported: RGB, RGBA, HEX(3 letters), HEX (6 letters), HEX + alpha (8 letters)";
        }
        
        this.setNewColor(color);
        this.displayCurrentColor();
    }
    
    /**
     * @param {Color} color
     */
    setNewColor(color) {
        this.#red.value = color.red;
        this.setChannel("red", color.red);
        
        this.#green.value = color.green;
        this.setChannel("green", color.green);
        
        this.#blue.value = color.blue;
        this.setChannel("blue", color.blue);
        
        this.#alpha.value = color.alpha;
        this.setChannel("alpha", color.alpha);
        
        this.#rootElement.dispatchEvent(new CustomEvent("pick", { detail: color }));
    }
    
    getCurrentColor() {
        return {
            red: Number(this.#rootElement.style.getPropertyValue("--red")),
            green: Number(this.#rootElement.style.getPropertyValue("--green")),
            blue: Number(this.#rootElement.style.getPropertyValue("--blue")),
            alpha: Number(this.#rootElement.style.getPropertyValue("--alpha"))
        };
    }
    
    displayCurrentColor(color = undefined) {
        this.#display.value = ColorPicker.toHex(color ?? this.getCurrentColor());
    }
}