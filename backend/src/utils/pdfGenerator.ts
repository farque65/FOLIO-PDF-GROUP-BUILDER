import { PDFDocument, PDFImage, PageSizes } from 'pdf-lib';
import { StoredImage } from './imageStore';

/**
 * Generates a single PDF from an ordered list of images.
 *
 * Optimization: if the same imageId appears more than once, its PDF image
 * object is embedded once and reused — pdf-lib will reference it internally
 * rather than duplicating bytes in the output.
 */
export async function generatePdf(images: StoredImage[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Deduplicate embeddings: imageId → embedded PDFImage
  const embeddedCache = new Map<string, PDFImage>();

  for (const image of images) {
    let embedded = embeddedCache.get(image.id);

    if (!embedded) {
      if (image.mimeType === 'image/jpeg') {
        embedded = await pdfDoc.embedJpg(image.buffer);
      } else if (image.mimeType === 'image/png') {
        embedded = await pdfDoc.embedPng(image.buffer);
      } else {
        continue; // should not happen — upload route validates
      }
      embeddedCache.set(image.id, embedded);
    }

    const imgDims = embedded.scale(1);
    const isLandscape = imgDims.width > imgDims.height;
    const [pageW, pageH] = isLandscape
      ? [PageSizes.A4[1], PageSizes.A4[0]]
      : PageSizes.A4;

    const page = pdfDoc.addPage([pageW, pageH]);

    const MARGIN = 24;
    const maxW = pageW - MARGIN * 2;
    const maxH = pageH - MARGIN * 2;
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const scaledW = imgDims.width * scale;
    const scaledH = imgDims.height * scale;

    page.drawImage(embedded, {
      x: (pageW - scaledW) / 2,
      y: (pageH - scaledH) / 2,
      width: scaledW,
      height: scaledH,
    });
  }

  return pdfDoc.save();
}

/**
 * Generate one PDF per group. The first image in each group is the cover page
 * (no separate title page logic needed — order comes from the frontend).
 */
export async function generateGroupPdfs(
  groups: Array<{ name: string; images: StoredImage[] }>
): Promise<Array<{ name: string; bytes: Uint8Array; size: number }>> {
  return Promise.all(
    groups.map(async ({ name, images }) => {
      const bytes = await generatePdf(images);
      return { name, bytes, size: bytes.byteLength };
    })
  );
}
