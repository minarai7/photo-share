import type { ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLanguage } from "../lang/useLanguage";
import { alongTheRow } from "./alongTheRow";

export type SortablePhoto = { key: string; name: string; previewUrl: string };

function Photo({ photo, index, total, onRemove, disabled }: { photo: SortablePhoto; index: number; total: number; onRemove: (key: string) => void; disabled: boolean }) {
    const { t } = useLanguage();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.key, disabled });
    return (
        <li
            ref={setNodeRef}
            className="sp-item"
            data-dragging={isDragging ? "" : undefined}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            {...attributes}
            {...listeners}
            aria-label={t.compose.photoLabel(index + 1, total, photo.name)}
        >
            <img className="sp-img" src={photo.previewUrl} alt="" draggable={false} />
            {index === 0 && <span className="sp-cover">{t.compose.cover}</span>}
            <button
                type="button"
                className="sp-remove"
                aria-label={t.compose.removePhoto(index + 1)}
                disabled={disabled}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(photo.key)}
            >
                ×
            </button>
        </li>
    );
}

/**
 * The new post's filmstrip: drag or keyboard (space, then arrow keys) to
 * reorder; the first photo is the COVER; × removes; `addSlot` ends the row.
 */
export function SortablePhotos({
    photos, onReorder, onRemove, addSlot, disabled = false,
}: {
    photos: SortablePhoto[];
    onReorder: (activeKey: string, overKey: string) => void;
    onRemove: (key: string) => void;
    addSlot?: ReactNode;
    disabled?: boolean;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    function onDragEnd({ active, over }: DragEndEvent) {
        if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
    }
    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[alongTheRow]} onDragEnd={onDragEnd}>
            <SortableContext items={photos.map((p) => p.key)} strategy={horizontalListSortingStrategy}>
                <ol className="sortable">
                    {photos.map((p, i) => (
                        <Photo key={p.key} photo={p} index={i} total={photos.length} onRemove={onRemove} disabled={disabled} />
                    ))}
                    {addSlot}
                </ol>
            </SortableContext>
        </DndContext>
    );
}
