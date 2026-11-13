// How many cards at the top of the feed/profile grid load their image eagerly.
// The rest use loading="lazy", so off-screen photos don't compete for bandwidth
// with the ones on the first screen (about one row of 320px tiles on a laptop).
export const EAGER_GRID_IMAGES = 4;

// Posts per page in the feed and on profiles ("Load more" fetches the next
// page). The API allows up to 100 (MaxPageSize in post_service.go).
export const FEED_PAGE_SIZE = 20;
