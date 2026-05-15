import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { imageStore } from '../utils/imageStore';
import { generateGroupPdfs } from '../utils/pdfGenerator';

const router = Router();

interface GenerateGroup {
  name: string;
  imageIds: string[]; // ordered; imageIds[0] is the cover/title page
}

interface GenerateRequest {
  groups: GenerateGroup[];
}

/**
 * POST /api/generate
 * Body: { groups: [{ name, imageIds[] }] }
 *
 * imageIds[0] in each group is the title/cover page — no separate titlePageId needed.
 * imageIds may contain duplicates (same image used multiple times in a group).
 *
 * Pipeline (zero disk I/O):
 *  1. Resolve imageIds → StoredImage buffers (deduped for pdf-lib efficiency)
 *  2. Generate one PDF per group with pdf-lib
 *  3. 1 group → stream PDF · N groups → stream ZIP
 */
router.post('/', async (req: Request, res: Response) => {
  const { groups } = req.body as GenerateRequest;

  if (!groups || groups.length === 0) {
    res.status(400).json({ error: 'No groups provided' });
    return;
  }

  // Validate all image IDs before starting generation
  const allIds = [...new Set(groups.flatMap((g) => g.imageIds))];
  for (const id of allIds) {
    if (!imageStore.get(id)) {
      res.status(404).json({ error: `Image not found: ${id}` });
      return;
    }
  }

  try {
    const resolvedGroups = groups.map((g) => ({
      name: g.name,
      // Allow duplicates — same imageId can appear multiple times
      images: g.imageIds
        .map((id) => imageStore.get(id))
        .filter((img): img is NonNullable<typeof img> => img !== undefined),
    }));

    // Generate all PDFs in parallel (no title page extraction — first image IS the cover)
    const pdfs = await generateGroupPdfs(resolvedGroups);

    if (pdfs.length === 1) {
      const { name, bytes } = pdfs[0];
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(name)}.pdf"`);
      res.setHeader('Content-Length', bytes.byteLength);
      res.end(Buffer.from(bytes));
    } else {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="pdf-groups.zip"');
      res.setHeader('Transfer-Encoding', 'chunked');

      const archive = archiver('zip', { zlib: { level: 1 } });
      archive.pipe(res);

      for (const { name, bytes } of pdfs) {
        archive.append(Buffer.from(bytes), { name: `${sanitizeFilename(name)}.pdf` });
      }

      await archive.finalize();
    }
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDFs' });
    }
  }
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() || 'group';
}

export default router;
