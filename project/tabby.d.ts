import { FinanceApi } from "./widgets/finance/finance";

declare type TabbyApi = {
    randomBackground: string,
    finance?: FinanceApi,
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