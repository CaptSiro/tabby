/** Duration of the highlight of the navigation button when there is no previous or next image */
const BACKGROUNDS_EDGE_DURATION = 300;



/**
 * project/tabby.js (api_loadTabby) is loaded only on the dashboard, the api object is read directly
 *
 * @return {BackgroundsApi | null}
 */
function backgrounds_api() {
    return api_getObject("#api-startuh")?.backgrounds ?? null;
}

/**
 * Errors are sent with `$response->sendMessage()`, which renders the Message component as HTML
 *
 * @param {Response} response
 * @return {Promise<string>}
 */
async function backgrounds_errorMessage(response) {
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
 * @return {Promise<BackgroundMembership | undefined>} undefined when the request failed
 */
async function backgrounds_request(url, options = {}) {
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
        await window_alert(await backgrounds_errorMessage(response), WINDOW_ALERT_SETTINGS);
        return undefined;
    }

    return await response.json();
}

/**
 * @param {string} name
 * @return {string}
 */
function backgrounds_normalizeName(name) {
    return name.trim().toLocaleLowerCase();
}

/**
 * @param {BackgroundSet[]} sets
 * @return {BackgroundSet[]}
 */
function backgrounds_sortSets(sets) {
    return sets.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Image page (components/Backgrounds/BackgroundImage.phtml), it is controlled by keyboard:
 * - PageUp / PageDown - previous / next image of the filter chosen in the listing
 * - the searchable set select is focused, ArrowUp / ArrowDown choose a set, Enter adds the image to it or creates it
 * - Escape clears the search, goes back to the listing when the search is empty
 * - sets of the image are buttons, Tab focuses them and Enter removes the image from the set
 *
 * @param {HTMLElement} element
 * @param {{ state: string }} dataset
 */
function backgrounds_image(element, { state }) {
    /** @type {BackgroundImageState} */
    const data = JSON.parse(state);
    const api = backgrounds_api();

    const input = $(".background-set-search", element);
    const options = $(".background-set-options", element);
    const tags = $(".background-image-sets", element);
    const empty = $(".background-image-sets-empty", element);
    if (!is(api) || !is(input) || !is(options) || !is(tags)) {
        return;
    }

    /** Sets of the image */
    let sets = data.sets;
    let allSets = backgrounds_sortSets(data.allSets);
    /** @type {BackgroundSetOption[]} */
    let choices = [];
    let active = 0;
    /** Membership requests run one after another, navigation waits for them, so a change is not lost */
    let pending = Promise.resolve();
    let isNavigating = false;

    for (const url of data.preload) {
        new Image().src = url;
    }

    /**
     * Queues the request after the previous ones, so the sets can be added as fast as they are typed
     *
     * @param {() => Promise<BackgroundMembership | undefined>} request
     * @param {string} search restored into the empty search when the request fails
     */
    const send = (request, search = "") => {
        const promise = pending.then(request);
        pending = promise.catch(() => undefined);

        return promise.then(result => {
            if (is(result)) {
                sets = result.sets;
                if (!allSets.some(x => x.id === result.set.id)) {
                    allSets = backgrounds_sortSets([...allSets, result.set]);
                }

                renderSets();
            } else if (search !== "" && input.value === "") {
                input.value = search;
            }

            renderOptions();

            // a removed set had the focus
            if (!element.contains(document.activeElement)) {
                input.focus();
            }
        });
    };

    /**
     * @param {BackgroundSetOption} choice
     */
    const add = choice => {
        if (choice.type === "note") {
            return;
        }

        const body = { image: data.image };
        if (choice.type === "create") {
            body.name = choice.name;
        } else {
            body.set = choice.set.id;
        }

        const search = input.value;
        input.value = "";
        active = 0;
        renderOptions();

        return send(() => backgrounds_request(api.membership, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }), search);
    };

    /**
     * @param {BackgroundSet} set
     */
    const remove = set => {
        const url = new URL(api.membership);
        url.searchParams.set("image", String(data.image));
        url.searchParams.set("set", String(set.id));

        return send(() => backgrounds_request(url, { method: "DELETE" }));
    };

    /**
     * @param {string | null} url
     * @param {string} edgeSelector button highlighted when there is no url
     */
    const navigate = async (url, edgeSelector) => {
        if (!is(url)) {
            const button = $(edgeSelector, element);
            button?.classList.add("edge");
            setTimeout(() => button?.classList.remove("edge"), BACKGROUNDS_EDGE_DURATION);
            return;
        }

        if (isNavigating) {
            return;
        }

        isNavigating = true;
        await pending;
        location.assign(url);
    };

    const renderSets = () => {
        tags.textContent = "";

        if (sets.length === 0) {
            tags.append(empty);
            return;
        }

        for (const set of sets) {
            tags.append(jsml.div({ class: "tag" }, [
                jsml.span(_, set.name),
                jsml.button({
                    type: "button",
                    title: "Remove from set " + set.name,
                    "aria-label": "Remove from set " + set.name,
                    onClick: () => remove(set)
                }, Icon("nf-fa-close", "✕"))
            ]));
        }
    };

    /**
     * Sets the image is not in that contain the search, followed by the option to create the set when no set has
     * the same name
     *
     * @return {BackgroundSetOption[]}
     */
    const createChoices = () => {
        const name = input.value.trim();
        const search = backgrounds_normalizeName(name);
        const ret = [];

        for (const set of allSets) {
            if (sets.some(x => x.id === set.id)) {
                continue;
            }

            if (backgrounds_normalizeName(set.name).includes(search)) {
                ret.push({ type: "set", name: set.name, set });
            }
        }

        if (search === "") {
            return ret;
        }

        const same = allSets.find(x => backgrounds_normalizeName(x.name) === search);
        if (!is(same)) {
            ret.push({ type: "create", name });
        } else if (sets.some(x => x.id === same.id)) {
            ret.push({ type: "note", name: same.name });
        }

        return ret;
    };

    const renderOptions = () => {
        choices = createChoices();
        options.textContent = "";

        const selectable = choices.filter(x => x.type !== "note").length;
        active = selectable === 0
            ? 0
            : std_clamp(0, selectable - 1, active);

        let index = 0;
        for (const choice of choices) {
            const text = choice.type === "create"
                ? `Create set "${choice.name}"`
                : choice.type === "note"
                    ? `The image is already in set "${choice.name}"`
                    : choice.name;

            let isActive = false;
            if (choice.type !== "note") {
                isActive = index === active;
                index++;
            }

            const option = jsml.div({
                class: "background-set-option " + choice.type + (isActive ? " active" : ""),
                role: "option",
                // keeps the focus in the search
                onMouseDown: event => event.preventDefault(),
                onClick: () => add(choice)
            }, text);

            options.append(option);
        }

        options.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    };

    input.addEventListener("input", () => {
        active = 0;
        renderOptions();
    });

    input.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
            return;
        }

        const selectable = choices.filter(x => x.type !== "note");

        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();
                if (selectable.length === 0) {
                    return;
                }

                const step = event.key === "ArrowDown" ? 1 : -1;
                active = (active + step + selectable.length) % selectable.length;
                renderOptions();
                return;
            }

            case "Enter": {
                event.preventDefault();
                if (selectable.length > 0) {
                    add(selectable[active]);
                }
                return;
            }

            case "Escape": {
                event.preventDefault();
                if (input.value !== "") {
                    input.value = "";
                    active = 0;
                    renderOptions();
                    return;
                }

                navigate(data.listing, ".background-image-listing");
                return;
            }
        }
    });

    window.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        if (event.key === "PageUp") {
            event.preventDefault();
            navigate(data.previous, ".background-image-previous");
            return;
        }

        if (event.key === "PageDown") {
            event.preventDefault();
            navigate(data.next, ".background-image-next");
        }
    });

    renderSets();
    renderOptions();
    input.focus();
}
