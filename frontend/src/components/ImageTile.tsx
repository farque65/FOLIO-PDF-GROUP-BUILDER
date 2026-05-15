import { forwardRef, HTMLAttributes } from 'react';
import { UploadedImage } from '../types';

interface Props extends HTMLAttributes<HTMLDivElement> {
  image: UploadedImage;
  isTitlePage?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  hasPrintSettings?: boolean;
  onRemove?: () => void;
  onSetTitlePage?: () => void;
  onAddAgain?: () => void;
  onEdit?: () => void;
  badge?: React.ReactNode;
  showActions?: boolean;
}

export const ImageTile = forwardRef<HTMLDivElement, Props>(function ImageTile(
  {
    image,
    isTitlePage = false,
    isDragging = false,
    isOverlay = false,
    hasPrintSettings = false,
    onRemove,
    onSetTitlePage,
    onAddAgain,
    onEdit,
    badge,
    showActions = true,
    style,
    className = '',
    ...rest
  },
  ref
) {
  return (
    <div
      ref={ref}
      className={`image-tile ${isTitlePage ? 'title-page' : ''} ${isDragging ? 'dragging' : ''} ${isOverlay ? 'overlay' : ''} ${className}`}
      style={style}
      title={image.name}
      {...rest}
    >
      <img src={image.previewUrl} alt={image.name} draggable={false} />

      {showActions && (
        <div className="image-tile-overlay">
          {onEdit && (
            <button
              className="image-tile-btn btn-edit"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title="Print settings"
            >
              ✎
            </button>
          )}
          {onSetTitlePage && !isTitlePage && (
            <button
              className="image-tile-btn btn-title"
              onClick={(e) => { e.stopPropagation(); onSetTitlePage(); }}
              title="Set as cover page"
            >
              ★
            </button>
          )}
          {onAddAgain && (
            <button
              className="image-tile-btn btn-add-again"
              onClick={(e) => { e.stopPropagation(); onAddAgain(); }}
              title="Add another copy"
            >
              +
            </button>
          )}
          {onRemove && (
            <button
              className="image-tile-btn btn-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {isTitlePage && <div className="title-badge">Cover</div>}
      {hasPrintSettings && <div className="print-badge">🖨</div>}
      {badge}
    </div>
  );
});
