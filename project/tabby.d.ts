export type TabbyAnchor = "start" | "center" | "end" | string;

export type TabbyWidgetConfig = {
    builder: string,
    /** offset from the horizontal anchor as a fraction of the container width */
    x: number,
    /** offset from the vertical anchor as a fraction of the container height */
    y: number,
    /** missing in configs saved before anchors existed, treated as "start" */
    anchorX?: TabbyAnchor,
    /** missing in configs saved before anchors existed, treated as "start" */
    anchorY?: TabbyAnchor,
}

declare interface TabbyBuilder<T, C extends TabbyWidgetConfig> {
    get name(): string;

    create(): T;

    build(config: C): T;
}