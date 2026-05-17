import { UploadedImage } from '../types';

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

export function partitionFiles(files: FileList | File[]): { valid: File[]; skipped: number } {
  const arr = Array.from(files);
  const valid = arr.filter((f) => ACCEPTED_MIME_TYPES.includes(f.type));
  return { valid, skipped: arr.length - valid.length };
}

/**
 * Convert a WebP File to a JPEG ArrayBuffer via an offscreen canvas.
 * This is the only format conversion path — JPEG and PNG are read as-is.
 */
async function webpToJpeg(file: File): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return blob.arrayBuffer();
}

/**
 * Process one image File into a fully resolved UploadedImage.
 * Creates an ObjectURL for preview; converts WebP → JPEG for pdf-lib compatibility.
 */
export async function processImageFile(file: File): Promise<UploadedImage> {
  const id = crypto.randomUUID();
  // Object URL is cheap and instant — use the original file for display
  const previewUrl = URL.createObjectURL(file);

  let imageData: ArrayBuffer;
  let pdfMimeType: 'image/jpeg' | 'image/png';

  if (file.type === 'image/webp') {
    imageData = await webpToJpeg(file);
    pdfMimeType = 'image/jpeg';
  } else {
    imageData = await file.arrayBuffer();
    pdfMimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  }

  return {
    id,
    name: file.name,
    size: file.size,
    mimeType: file.type as UploadedImage['mimeType'],
    previewUrl,
    imageData,
    pdfMimeType,
  };
}

/** Process multiple files in parallel */
export async function processImageFiles(files: File[]): Promise<UploadedImage[]> {
  return Promise.all(files.map(processImageFile));
}
