import { FinanceApi } from "./widgets/finance/finance";
import { CalendarApi } from "./widgets/calendar/calendar";
import { BackgroundsApi } from "./components/Backgrounds/backgrounds";

declare type TabbyApi = {
    /** GET ?set= (id of a background set, all images without it) */
    randomBackground: string,
    finance?: FinanceApi,
    calendar?: CalendarApi,
    backgrounds?: BackgroundsApi,
    admin: {
        url: string,
        label: string
    },
}

export type TabbyAnchor = "start" | "center" | "end" | string;

export type TabbyWidgetConfig = {
    builder: string,
    /** offset from the horizontal anchor in pixels (fraction of the container width without `positionUnit`) */
    x: number,
    /** offset from the vertical anchor in pixels (fraction of the container height without `positionUnit`) */
    y: number,
    /** missing in configs saved before anchors existed, treated as "start" */
    anchorX?: TabbyAnchor,
    /** missing in configs saved before anchors existed, treated as "start" */
    anchorY?: TabbyAnchor,
    /** missing in configs saved before pixel offsets, those are converted on load */
    positionUnit?: "px",
}

declare interface TabbyBuilder<T, C extends TabbyWidgetConfig> {
    get name(): string;

    create(): T;

    build(config: C): T;
}