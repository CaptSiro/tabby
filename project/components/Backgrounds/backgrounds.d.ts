export type BackgroundsApi = {
    /** GET ?set=&p= listing page of the images */
    listing: string,
    /** GET BackgroundSetSummary[] ordered by name */
    sets: string,
    /** POST { image, set } or { image, name } adds the image to a set, DELETE ?image=&set= removes it */
    membership: string,
    /** Query of the set in the listing and in randomBackground */
    setQuery: string,
};

declare type BackgroundSet = {
    id: number,
    name: string,
};

declare type BackgroundSetSummary = BackgroundSet & {
    /** Number of images in the set */
    count: number,
};

declare type BackgroundMembership = {
    /** Set the image has been added to or removed from */
    set: BackgroundSet,
    /** All sets of the image ordered by name */
    sets: BackgroundSet[],
};

declare type BackgroundSetOption = {
    type: "set",
    name: string,
    set: BackgroundSet,
} | {
    type: "create" | "note",
    name: string,
};

/** data-state of the image page (BackgroundImage::getState) */
declare type BackgroundImageState = {
    image: number,
    /** Url of the image page of the previous image of the filter */
    previous: string | null,
    next: string | null,
    listing: string,
    /** Urls of the previous and next image files */
    preload: string[],
    sets: BackgroundSet[],
    allSets: BackgroundSet[],
};
