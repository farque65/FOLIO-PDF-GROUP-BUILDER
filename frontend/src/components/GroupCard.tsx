import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ImageGroup, UploadedImage } from '../types';
import { SortableSlot } from './SortableSlot';
import { formatBytes } from '../utils/format';

interface Props {
  group: ImageGroup;
  allImages: UploadedImage[];
  onRename: (name: string) => void;
  onRemoveGroup: () => void;
  onRemoveSlot: (slotId: string) => void;
  onSetTitlePage: (slotId: string) => void;
  onAddAgain: (imageId: string) => void;
  onEditSlot: (slotId: string) => void;
  isDragActive: boolean;
}

export function GroupCard({
  group,
  allImages,
  onRename,
  onRemoveGroup,
  onRemoveSlot,
  onSetTitlePage,
  onAddAgain,
  onEditSlot,
  isDragActive,
}: Props) {
  const [editingName, setEditingName] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { type: 'group-droppable', groupId: group.id },
  });

  const imageMap = new Map(allImages.map((img) => [img.id, img]));
  const resolvedSlots = group.slots
    .map((sl) => ({ slot: sl, image: imageMap.get(sl.imageId) }))
    .filter((s): s is { slot: typeof s.slot; image: UploadedImage } => !!s.image);

  const totalSize = resolvedSlots.reduce((acc, { image }) => acc + image.size, 0);
  const titleImage = resolvedSlots[0]?.image;
  const dropHighlight = isOver && isDragActive;

  return (
    <div className={`group-card ${dropHighlight ? 'drop-target' : ''}`}>
      {/* Header */}
      <div className="group-card-header">
        <div className="group-header-left">
          <div className="group-index-pip" />
          {editingName ? (
            <input
              autoFocus
              className="group-card-name-input editing"
              value={group.name}
              onChange={(e) => onRename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              maxLength={60}
            />
          ) : (
            <span
              className="group-card-name-display"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {group.name}
            </span>
          )}
        </div>
        <div className="group-card-header-right">
          <span className="group-card-meta">
            {resolvedSlots.length} page{resolvedSlots.length !== 1 ? 's' : ''}
            {totalSize > 0 && ` · ~${formatBytes(totalSize)}`}
          </span>
          <button className="btn-remove-group" onClick={onRemoveGroup} title="Remove group">✕</button>
        </div>
      </div>

      {/* Cover strip */}
      {titleImage && (
        <div className="group-title-strip">
          <span className="group-title-strip-label">★ Cover page</span>
          <span className="group-title-strip-name">{titleImage.name}</span>
          {resolvedSlots[0]?.slot.printSettings && (
            <span className="group-title-strip-print">🖨 print settings applied</span>
          )}
        </div>
      )}

      {/* Sortable body */}
      <div
        ref={setNodeRef}
        className={`group-card-body ${dropHighlight ? 'drop-highlight' : ''}`}
      >
        <SortableContext items={group.slots.map((s) => s.slotId)} strategy={rectSortingStrategy}>
          {resolvedSlots.map(({ slot, image }, index) => (
            <SortableSlot
              key={slot.slotId}
              slot={slot}
              groupId={group.id}
              image={image}
              index={index}
              totalSlots={resolvedSlots.length}
              onRemove={() => onRemoveSlot(slot.slotId)}
              onSetTitlePage={() => onSetTitlePage(slot.slotId)}
              onAddAgain={() => onAddAgain(slot.imageId)}
              onEdit={() => onEditSlot(slot.slotId)}
            />
          ))}
        </SortableContext>

        {isDragActive && resolvedSlots.length === 0 && (
          <div className="group-drop-hint active"><span>↓</span><span>Drop images here</span></div>
        )}
        {!isDragActive && resolvedSlots.length === 0 && (
          <div className="group-drop-hint"><span>↓</span><span>Drag images here from the pool</span></div>
        )}
      </div>

      {resolvedSlots.length > 1 && (
        <div className="group-card-footer">
          <span className="group-footer-hint">
            Drag to reorder · Page 1 is the cover · Click ✎ to edit print settings
          </span>
        </div>
      )}
    </div>
  );
}
