/** An image that has been uploaded to the server */
export interface UploadedImage {
  id: string;
  name: string;
  size: number;
  mimeType: 'image/jpeg' | 'image/png';
  previewUrl: string;
}

/** Crop region stored in natural image pixels */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page placement stored in A4 display-pixels (page origin = top-left) */
export interface PlaceSettings {
  x: number;
  y: number;
  width: number;    // height is derived from crop aspect ratio
  rotation: number; // degrees, clockwise. 0 = upright.
}

/**
 * Print settings for a slot.
 * renderedImageId = the uploaded A4-canvas JPEG ready for PDF assembly.
 */
export interface SlotPrintSettings {
  crop: CropRect | null;
  place: PlaceSettings;
  renderedImageId: string;
}

/**
 * A single placement of an image within a group.
 * The same image can appear multiple times — each placement has its own slotId.
 * slots[0] is always the cover/title page.
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
