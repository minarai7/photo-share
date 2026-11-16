import type { Modifier } from "@dnd-kit/core";

/**
 * The new post's filmstrip is one row: a dragged photo follows the pointer
 * sideways only, never up or down out of the row.
 */
export const alongTheRow: Modifier = ({ transform }) => ({ ...transform, y: 0 });
