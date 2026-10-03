import { TabbyWidgetConfig } from "../../tabby";



declare type Bookmark = {
    link: string,
    title: string,
    isTitleIcon: boolean,
    color: string,
};

declare type BookmarksWidgetConfig = {
    items: Bookmark[],
} & TabbyWidgetConfig;