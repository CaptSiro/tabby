const BOOKMARKS_BUILDER = 'bookmarks';

const BOOKMARKS_KEY = 'tabby_bookmarks';



class BookmarksWidget extends TabbyWidget {
    /** @type {BookmarksWidgetConfig} */
    #config;
    /** @type {HTMLElement} */
    #display;



    constructor(config) {
        super();

        this.#config = config;
        this.setConfig(config);

        this.#display = html.element(html`<div class="w-bookmarks"></div>`);
    }



    renderItems() {
        this.#display.textContent = "";

        if (!is(this.#config.items)) {
            return;
        }

        for (const item of this.#config.items) {
            const content = item.isTitleIcon
                ? nf(item.title)
                : html`<span>${item.title}</span>`;
            
            this.#display.append(
                html.node(html`
                    <a
                        href="${item.link}"
                        class="${cls("bookmark center", { icon: item.isTitleIcon })}"
                        target="_top"
                        style="${{ backgroundColor: item.color }}"
                    >
                        ${content}
                    </a>
                `),
            );
        }
    }

    instantiate() {
        this.renderItems();
        const widget = tabby_WidgetElement(this, this.#display, this.#config);
        widget.style.borderRadius = "calc(3 * var(--border-radius))";
        return widget;
    }

    /**
     * @param {Opt<Bookmark>} item
     * @returns {Promise<Opt<Bookmark>>}
     */
    inspectItem(item = undefined) {
        return new Promise(resolve => {
            let result = is(item)
                ? { ...item }
                : {
                    color: "rgba(0, 0, 0, 0)",
                    isTitleIcon: false,
                    title: "",
                    link: ""
                };

            let ret = undefined;

            const colorPicker = new ColorPicker(true);
            colorPicker.rootElement.addEventListener("pick", evt => {
                result.color = ColorPicker.toHex(evt.detail);
            });

            if (is(item)) {
                colorPicker.setNewFromFormat(item.color);
            }
            
            const usePropTrimmed = (object, property) => {
                const [get, set] = useProp(object, property);
                return [get, x => set(x.trim())];
            }

            const w = window_create(
                "Bookmark",
                () => html`
                    <${window_TextWindow}>
                        <${TabbyCheckbox} state="${useProp(result, 'isTitleIcon')}" label="Is title icon" />
                        <${TabbyTextField} value="${usePropTrimmed(result, 'title')}" label="Title" />
                        <${TabbyTextField} value="${usePropTrimmed(result, 'link')}" label="Link" />
                        
                        ${colorPicker.rootElement}
                        
                        <div class="controls">
                            <button onClick="${async () => {
                                if (result.link === "" || result.title === "") {
                                    await window_alert("Title and link must be set", WINDOW_ALERT_SETTINGS);
                                    return;
                                }
                                
                                ret = result;
                                window_close(w);
                            }}">Ok</button>
                            
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

    inspect() {
        this.#config.items ??= [];

        const save = () => {
            tabby_save();
            this.renderItems();
            tabby_inspect(() => this.inspect());
        }

        const onAdd = async () => {
            const bookmark = await this.inspectItem();
            if (!is(bookmark)) {
                return;
            }
            
            this.#config.items.push(bookmark);
            save();
        }
        
        /**
         * @param {Event} event
         * @param {Bookmark} selected
         * @param {number} index
         */
        const onEdit = async (event, selected, index) => {
            const bookmark = await this.inspectItem(selected);
            if (!is(bookmark)) {
                return;
            }

            this.#config.items[index] = bookmark;
            save();
        }

        /**
         * @param {Event} event
         * @param {Bookmark} selected
         * @param {number} index
         */
        const onDelete = async (event, selected, index) => {
            if (!(await window_confirm(`Do you want to delete bookmark '${selected.link}'?`, WINDOW_CONFIRM_SETTINGS))) {
                return;
            }

            this.#config.items.splice(index, 1);
            save();
        }
        
        return html`
            <${TabbyTitle} title="Bookmarks" />
            
            <${TabbyHR} />
            
            <${EditableList}
                class="i-bookmarks"
                collection="${this.#config.items}"
                onAdd="${onAdd}"
                onEdit="${onEdit}"
                onDelete="${onDelete}"
                fallback="No bookmarks"
            >
                ${x => html`
                    <div class="bookmark">
                        ${x.title}
                    </div>
                `}
            </>
        `;
    }

    save() {
        const ret = {
            ...this.#config,
            ...super.save()
        };

        ret.builder = BOOKMARKS_BUILDER;

        return ret;
    }
}



const bookmarks_builder = new FunctionalTabbyBuilder(
    BOOKMARKS_BUILDER,
    config => new BookmarksWidget(config)
);



tabby_addBuilder(bookmarks_builder);
tabby_addPrefab(
    tabby_PrefabElement({
        builder: bookmarks_builder,
        icon: nf("nf-md-book"),
        name: "Bookmarks"
    })
);
