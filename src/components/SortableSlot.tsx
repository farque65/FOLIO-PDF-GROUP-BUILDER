import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImageTile } from './ImageTile';
import { GroupSlot, UploadedImage } from '../types';

interface Props {
  slot: GroupSlot;
  groupId: string;
  image: UploadedImage;
  index: number;
  totalSlots: number;
  onRemove: () => void;
  onSetTitlePage: () => void;
  onAddAgain: () => void;
  onEdit: () => void;
}

export function SortableSlot({
  slot,
  groupId,
  image,
  index,
  onRemove,
  onSetTitlePage,
  onAddAgain,
  onEdit,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: slot.slotId,
    data: {
      type: 'group-slot',
      slotId: slot.slotId,
      groupId,
      imageId: slot.imageId,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-slot ${isDragging ? 'is-dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <ImageTile
        image={image}
        isTitlePage={index === 0}
        isDragging={isDragging}
        hasPrintSettings={!!slot.printSettings}
        onRemove={onRemove}
        onSetTitlePage={index === 0 ? undefined : onSetTitlePage}
        onAddAgain={onAddAgain}
        onEdit={onEdit}
        showActions
        badge={<div className="slot-index-badge">{index + 1}</div>}
      />
    </div>
  );
}
