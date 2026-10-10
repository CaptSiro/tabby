/**
 * Values of the options are urls of the listing with the filter applied
 *
 * @param {HTMLSelectElement} select
 */
function backgrounds_listingFilter(select) {
    select.addEventListener("change", () => {
        location.assign(select.value);
    });
}
