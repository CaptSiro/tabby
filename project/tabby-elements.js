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
            ${textField}
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
                onChange="${event => {
                    // an empty or unparsable field keeps the current value instead of becoming 0
                    const next = isNaN(event.target.valueAsNumber)
                        ? value()
                        : setValue(event.target.valueAsNumber);

                    // written back even when the signal did not change, so "01" becomes "1"
                    event.target.value = String(next);
                }}"
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
            ...${p}
        >
    `);
    
    effect(() => {
        const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
        const localDateTime = new Date(date().getTime() - timezoneOffset);
        input.value = localDateTime.toISOString().slice(0, isDateTime ? 16 : 10);
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
    
    const select = html.element(html`
        <select onChange="${event => setValue(event.target.value)}" ...${p}>
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
                <${Label} label="${label}" target="${select}" />
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
    const { value: [color, setColor], label = undefined, ...p } = props;
    
    const input = html.element(html`
        <input
            type="color"
            value="${color}"
            onChange="${event => setColor(event.target.value)}"
            ...${p}
        >
    `);
    
    return LabelAndComponentInspector("i-date", label, input);
}

/**
 * @param {JsmlProps & { title }} props
 * @returns {HTMLElement}
 */
function TabbyTitle(props) {
    const { title, ...p } = props;
    
    return html.element(html`
        <h3 ...${withClass(p, 'i-title')}>
            ${title}
        </h3>
    `);
}

/**
 * @param {JsmlProps & { note }} props
 * @return {HTMLHeadingElement}
 */
function TabbyNote(props) {
    const { note, ...p } = props;
    
    return html.element(html`
        <h5 ...${withClass(p, 'i-note')}>
            ${note}
        </h5>
    `);
}

/**
 * @param {JsmlProps} props
 * @return {HTMLElement}
 */
function TabbyHR(props = {}) {
    return html.element(html`
        <div ...${withClass(props, 'i-hr')}>
            ​
        </div>
    `);
}

/**
 * @param {JsmlParentProps<{ label: MaybeReactive<string> }>} props
 * @returns {HTMLElement}
 */
function Labeled(props) {
    const { label, children, ...p } = props;
    const component = html.element(children);
    
    return html.element(html`
        <div ...${p}>
            <${Label} label="${label}" target="${component}" />
            ${component}
        </div>
    `);
}

/**
 *
 * @returns {{ current: HTMLElement | undefined }}
 */
function ref() {
    return {
        current: undefined
    };
}


/**
 * List whose rows can be selected by clicking. Selection is the item itself, clicking the selected row deselects it.
 * `selectedIndex` is written by the list (read it, don't set it) and follows the item when the collection changes.
 *
 * @template T
 * @param {JsmlProps & {
 *      each: MaybeReactive<Iterable<T> | ArrayLike<T> | null | undefined>,
 *      fallback?: JsmlContent,
 *      children: ((item: T, index: Accessor<number>) => JsmlContent)
 *          | [(item: T, index: Accessor<number>) => JsmlContent],
 *      selected?: Signal<T | undefined>,
 *      selectedIndex?: Signal<number>,
 *      compare?: (a: T, b: T) => boolean
 * }} props
 */
function SelectableList(props) {
    let {
        children: render,
        each,
        fallback = undefined,
        selected = signal(),
        selectedIndex = signal(-1),
        compare = (a, b) => a === b,
        ...p
    } = props;
    if (Array.isArray(render) && render.length === 1) {
        render = render[0];
    }
    
    if (typeof render !== "function") {
        throw new TypeError(`${SelectableList.name} expects a single function child: (item, index) => content`);
    }
    
    const [getSelected, setSelected] = selected;
    const [_, setSelectedIndex] = selectedIndex;
    
    effect(() => {
        const list = read(each);
        const items = is(list) ? Array.from(list) : [];
        const s = getSelected();
        const index = is(s) ? items.indexOf(s) : -1;
        
        if (is(s) && index === -1) {
            setSelected(undefined);
        }
        
        setSelectedIndex(index);
    });
    
    return html`
        <div role="listbox" ...${withClass(p, "selectable-list")}>
            <${For} each="${each}" fallback="${fallback}">
                ${(item, index) => html`
                    <div
                        role="option"
                        class="${{ selected: () => compare(getSelected(), item) }}"
                        aria-selected="${() => String(compare(getSelected(), item))}"
                        onClick="${() => setSelected(compare(getSelected(), item) ? undefined : item)}"
                    >${render(item, index)}</div>
                `}
            </>
        </div>
    `;
}


/**
 * @template T
 * @param {JsmlProps & {
 *      collection: MaybeReactive<Iterable<T> | ArrayLike<T> | null | undefined>,
 *      fallback?: JsmlContent,
 *      children: ((item: T, index: Accessor<number>) => JsmlContent)
 *          | [(item: T, index: Accessor<number>) => JsmlContent],
 *      selected?: Signal<T | undefined>,
 *      selectedIndex?: Signal<number>,
 *      onAdd?: (event: Event) => Promise<void> | void,
 *      onEdit?: (event: Event, item: T, index: number) => Promise<void> | void,
 *      onDelete?: (event: Event, item: T, index: number) => Promise<void> | void,
 *      compare?: (a: T, b: T) => boolean
 * }} props
 */
function EditableList(props) {
    const {
        children: render,
        collection,
        onAdd,
        onEdit,
        onDelete,
        compare = (a, b) => a === b,
        fallback = undefined,
        selected = signal(),
        selectedIndex = signal(-1),
        ...p
    } = props;
    
    const [getSelected] = selected;
    const [getSelectedIndex] = selectedIndex;
    
    /**
     * @param {((event: Event, item: T, index: number) => Promise<void> | void) | undefined} fn
     * @returns {(event: Event) => Promise<void>}
     */
    const withSelection = fn => async event => {
        const item = getSelected();
        
        if (!is(item)) {
            return;
        }
        
        await fn?.(event, item, getSelectedIndex());
    };
    
    return html`
        <div ...${withClass(p, "editable-list")}>
            <${SelectableList}
                class="editable-list-listing"
                each="${collection}"
                fallback="${fallback}"
                selected="${selected}"
                selectedIndex="${selectedIndex}"
                compare="${compare}"
            >${render}</>
            
            <div class="row">
                <button onClick="${async event => await onAdd?.(event)}">Add</button>
                <button disabled="${() => !is(getSelected())}" onClick="${withSelection(onEdit)}">Edit</button>
                <button disabled="${() => !is(getSelected())}" onClick="${withSelection(onDelete)}">Delete</button>
            </div>
        </div>
    `;
}

jsml.define(TabbyCheckbox, TabbyRadioGroup, TabbyTextArea, TabbyTextField, TabbyNumber, TabbyDate, TabbySelect,
    TabbyColorPicker, TabbyTitle, TabbyNote, TabbyHR, Labeled, SelectableList, EditableList);
