/**
 * An image loaded from disk. imageData holds the raw bytes for PDF embedding.
 * WebP files are pre-converted to JPEG on load; pdfMimeType reflects that.
 */
export interface UploadedImage {
  id: string;
  name: string;
  size: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Object URL for <img> preview — revoke when removing */
  previewUrl: string;
  /** Raw bytes for pdf-lib (JPEG or PNG). WebP is converted to JPEG on ingest. */
  imageData: ArrayBuffer;
  /** The actual format of imageData (may differ from mimeType for WebP → JPEG) */
  pdfMimeType: 'image/jpeg' | 'image/png';
}

/** Crop region in natural image pixels */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Placement on A4 canvas in display-pixels (page origin = top-left) */
export interface PlaceSettings {
  x: number;
  y: number;
  width: number;    // height derived from crop aspect ratio
  rotation: number; // degrees clockwise
}

/**
 * Print settings for one slot.
 * renderedData is an ArrayBuffer of a JPEG of the fully composited A4 page —
 * generated in-browser by the canvas renderer in PrintEditor, stored here
 * directly without any server round-trip.
 */
export interface SlotPrintSettings {
  crop: CropRect | null;
  place: PlaceSettings;
  renderedData: ArrayBuffer;
}

/**
 * One image placement inside a group.
 * The same image can appear multiple times (each has its own slotId).
 * slots[0] is always the cover page.
 */
export interface GroupSlot {
  slotId: string;
  imageId: string;
  printSettings?: SlotPrintSettings;
}

export interface ImageGroup {
  id: string;
  name: string;
  slots: GroupSlot[];
}

export interface AppState {
  images: UploadedImage[];
  groups: ImageGroup[];
}

export type DragItemData =
  | { type: 'pool-image'; imageId: string }
  | { type: 'group-slot'; slotId: string; groupId: string; imageId: string };
