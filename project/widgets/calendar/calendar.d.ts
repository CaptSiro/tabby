import { TabbyWidgetConfig } from "../../tabby";



export type CalendarApi = {
    /** GET, 200 when the API can be used */
    health: string,
    /** GET ?from=YYYY-MM-DD, POST create, PUT update, DELETE ?id= */
    events: string,
};

declare type CalendarCategory = "past" | "today" | "upcoming";

declare type CalendarEventDraft = {
    id?: number,
    label: string,
    /** YYYY-MM-DD HH:MM:SS in local time */
    datetime: string,
    isDone: boolean,
};

declare type CalendarEvent = CalendarEventDraft & {
    id: number,
};

declare type CalendarEventDialogProps = {
    event?: CalendarEvent,
    /** format of the quick time buttons */
    isMilitaryTime: boolean,
    submit: (draft: CalendarEventDraft) => Promise<any>,
    remove?: (event: CalendarEvent) => Promise<any>,
};

declare type CalendarWidgetConfig = {
    /** events shown before "Show more", 5 by default */
    visibleCount?: number,
    isMilitaryTime?: boolean,
} & TabbyWidgetConfig;
