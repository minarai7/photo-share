// How many cards at the top of the feed/profile grid load their image eagerly.
// The rest use loading="lazy", so off-screen photos don't compete for bandwidth
// with the ones on the first screen (about one row of 320px tiles on a laptop).
export const EAGER_GRID_IMAGES = 4;
