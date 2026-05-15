import { Router, Request, Response } from 'express';
import multer from 'multer';
import { imageStore } from '../utils/imageStore';

const router = Router();

// Use memory storage — buffers never touch disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per image
    files: 100,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported format: ${file.mimetype}. Only JPEG and PNG are supported.`));
    }
  },
});

/**
 * POST /api/upload
 * Accepts multipart/form-data with field name "images"
 * Returns metadata for each uploaded image (id, name, size)
 * Buffers are stored in the in-memory imageStore
 */
router.post('/', upload.array('images', 100), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const uploaded = files.map((file) => {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype as 'image/jpeg' | 'image/png';
    const stored = imageStore.add(file.originalname, mime, file.buffer);
    return {
      id: stored.id,
      name: stored.originalName,
      size: stored.size,
      mimeType: stored.mimeType,
    };
  });

  res.json({ uploaded });
});

/**
 * DELETE /api/upload/:id
 * Remove a single image from the store
 */
router.delete('/:id', (req: Request, res: Response) => {
  imageStore.remove(req.params.id);
  res.json({ ok: true });
});

export default router;
