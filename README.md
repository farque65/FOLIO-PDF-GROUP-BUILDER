# Folio — PDF Group Builder

A full-stack app to upload images, organize them into groups, and generate PDFs from those groups. A designated **title page** image is automatically prepended to every generated PDF.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **PDF generation**: `pdf-lib` (pure in-memory, zero disk I/O)
- **Bundling**: `archiver` (zip stream)

## Architecture & Key Design Decisions

### Zero-Disk PDF Strategy

Images are stored **entirely in memory** using a `Map<imageId, Buffer>` singleton on the server. The pipeline is:

```
Upload → multer.memoryStorage() → ImageStore (Map) → pdf-lib (Uint8Array) → archiver → stream
```

Nothing ever touches the filesystem. The `ImageStore` auto-evicts images after 1 hour via a background sweeper.

### Title Page

One image can be designated as the global **title page**. When generating, the backend prepends this image to the ordered image list for *every* group before calling `pdf-lib`. No special-casing needed in the PDF generator itself.

### Single vs Multi-Group Output

- **1 group** → streams a single `.pdf` directly  
- **2+ groups** → streams a `.zip` via `archiver` with minimal compression (PDF data is already compressed)

### Size Estimation

The sidebar shows `~estimated size` by summing raw image buffer sizes per group (plus the title page size if set). This is a fast client-side approximation — actual PDF sizes will be similar since pdf-lib embeds JPEG data as-is.

## Setup

```bash
# Install all dependencies
npm run install:all

# Run frontend + backend concurrently
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001

## Usage

1. **Upload** JPEG or PNG images via drag-and-drop or file picker
2. **Mark a title page** by hovering an image and clicking ★ — it will prepend to every PDF
3. **Drag images** from the pool into groups (or between groups)
4. **Rename groups** by clicking the group name
5. **Add groups** with the "+ Add Group" button
6. **Check the sidebar** for estimated sizes per group
7. **Click Generate PDFs** — downloads a single PDF or a zip of multiple PDFs

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload images (multipart, field: `images`) |
| `DELETE` | `/api/upload/:id` | Remove an image from memory |
| `POST` | `/api/generate` | Generate PDFs from group config, stream back |
| `POST` | `/api/generate/preview-sizes` | Get estimated sizes without generating |
| `GET` | `/api/health` | Health check |

### Generate request body

```json
{
  "titlePageId": "uuid-or-null",
  "groups": [
    { "name": "Section A", "imageIds": ["uuid1", "uuid2"] },
    { "name": "Section B", "imageIds": ["uuid3"] }
  ]
}
```
