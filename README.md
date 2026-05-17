# Folio — PDF Group Builder

A browser-native tool for organising images into named groups and generating print-ready PDFs. Everything runs client-side — no server, no uploads, no data leaves the browser.

![Folio favicon](public/favicon.svg)

---

## Features

- **Drag-and-drop grouping** — drag images from the pool into PDF groups; reorder pages within a group; move images between groups; drag back to the pool to unassign
- **Per-group cover pages** — the first slot in each group is always the cover; promote any image with ★ or by dragging it to position one
- **Duplicate pages** — add the same image multiple times to the same group via the + button
- **Print Editor** — per-slot layout tool with two modes:
  - **Crop** — draw a region on the source image; rule-of-thirds grid; four corner handles; move-and-resize
  - **Place** — position the cropped image freely on an A4 canvas; drag to move; corner handles for aspect-ratio-locked scaling; drag-handle knob for free rotation; ↺/↻ buttons for 90° snaps
- **Live A4 preview** — the place canvas scales responsively to fit any screen width while keeping pointer-event coordinates correct
- **Per-slot render** — clicking Apply composites the image onto a 1 240 × 1 754 px canvas (A4 at 150 DPI), converts it to JPEG, and stores the bytes in browser memory — no network call
- **PDF generation off the main thread** — a dedicated Web Worker runs `pdf-lib` and `fflate`; the UI stays fully responsive while PDFs are assembled
- **Single PDF or ZIP** — one group downloads as a `.pdf`; multiple groups download as a `.zip`
- **WebP support** — WebP files are converted to JPEG via canvas on ingest; JPEG and PNG are read directly
- **Mobile responsive** — sidebar collapses at tablet widths, hides on phones; Print Editor opens as a bottom-sheet on mobile; the A4 preview scales down via `ResizeObserver`
- **Zero backend** — no server, no database, no API keys; deploy anywhere static files are served

---

## Tech stack

| Concern        | Library                               |
| -------------- | ------------------------------------- |
| UI framework   | React 18 + TypeScript                 |
| Build tool     | Vite 5                                |
| Drag and drop  | @dnd-kit/core + @dnd-kit/sortable     |
| PDF generation | pdf-lib (runs in Web Worker)          |
| ZIP bundling   | fflate `zipSync` (runs in Web Worker) |
| Deployment     | Vercel (static, zero config)          |

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
# → http://localhost:5173

# 3. Production build
npm run build

# 4. Preview the production build locally
npm run preview
```

No environment variables are needed. There is no backend.

---

## Project structure

```
folio/
├── public/
│   └── favicon.svg          # SVG favicon (ink bg · cream F · rust dot)
├── src/
│   ├── types/
│   │   └── index.ts         # All shared TypeScript interfaces
│   ├── components/
│   │   ├── App.tsx           # Root — DnD context, state wiring, toasts
│   │   ├── DropZone.tsx      # File drop / picker; processes files locally
│   │   ├── GroupCard.tsx     # One PDF group with sortable slot grid
│   │   ├── ImageTile.tsx     # Thumbnail with action overlay buttons
│   │   ├── PrintEditor.tsx   # Crop + Place modal editor
│   │   ├── Sidebar.tsx       # Per-group size summary panel
│   │   └── SortableSlot.tsx  # useSortable wrapper around ImageTile
│   ├── hooks/
│   │   └── useGroups.ts      # All group/slot/image state mutations
│   ├── utils/
│   │   ├── format.ts         # formatBytes, generateGroupName
│   │   ├── imageUtils.ts     # File ingestion, WebP → JPEG conversion
│   │   ├── pdfService.ts     # Main-thread interface to the PDF worker
│   │   └── uuidShim.ts       # crypto.randomUUID wrapper
│   ├── workers/
│   │   └── pdfWorker.ts      # pdf-lib + fflate, runs off main thread
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── index.html
├── vercel.json
├── vite.config.ts
└── tsconfig.json
```

---

## Architecture

### Image storage

Images are never uploaded anywhere. When a file is dropped:

1. `URL.createObjectURL(file)` creates a preview URL for `<img>` tags
2. `file.arrayBuffer()` reads the raw bytes into an `ArrayBuffer` stored in React state
3. WebP files are additionally converted to JPEG via `<canvas>` before storing (pdf-lib only embeds JPEG and PNG natively)

Each `UploadedImage` in state therefore carries both `previewUrl` (for display) and `imageData: ArrayBuffer` (for PDF embedding). When an image is removed, `URL.revokeObjectURL` is called to free the browser's memory.

### PDF generation pipeline

```
User clicks Generate
        │
        ▼
pdfService.ts   ← builds WorkerRequest from group slots
        │         (renderedData if print settings exist, imageData otherwise)
        ▼
postMessage ──► pdfWorker.ts  (Web Worker — separate JS bundle)
                    │
                    ├─ pdf-lib: one PDFDocument per group
                    │   ├─ isRenderedPage=true  → embed JPEG, fill A4 page exactly
                    │   └─ isRenderedPage=false → embed image, auto-fit with margin
                    │
                    ├─ 1 group  → Uint8Array (PDF bytes)
                    └─ N groups → fflate.zipSync → Uint8Array (ZIP bytes)
                    │
postMessage ◄───────┘  (bytes transferred, not copied)
        │
        ▼
Blob → URL.createObjectURL → <a download> click → browser download
```

The worker is bundled separately by Vite's `?worker` import. `pdf-lib` and `fflate` live entirely in the worker bundle (438 KB), keeping the main thread bundle lean (220 KB).

### Print Editor render path

When the user clicks **Apply to Slot** in the Print Editor:

1. The source image is drawn to an offscreen `<canvas>` at **1 240 × 1 754 px** (A4 at 150 DPI)
2. `ctx.translate` + `ctx.rotate` applies placement and rotation; `ctx.drawImage` applies the crop via the six-argument form `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`
3. `canvas.toBlob('image/jpeg', 0.92)` → `blob.arrayBuffer()` produces a JPEG `ArrayBuffer`
4. This buffer is stored on the slot as `printSettings.renderedData` — no upload, no server

On generate, slots with `renderedData` send that pre-composited A4 JPEG to the worker; the worker embeds it as a full-bleed page. Slots without print settings send the raw source image; the worker auto-fits it centred with a 24 pt margin.

### Responsive A4 preview

The Place mode canvas is logically 500 × 708 px (A4 aspect ratio). On narrow screens it would overflow. The solution uses three nested divs:

```
containerRef           ← ResizeObserver measures available width
  └─ clip wrapper      ← sized to PAGE_W × pageScale (collapses extra space)
       └─ scale div    ← transform: scale(pageScale), origin top-left
            └─ pageRef / .place-page  (always 500 × 708 logical px)
```

`pageRef.getBoundingClientRect()` accounts for CSS transforms, so visual position of any logical point `(x, y)` is `(rect.left + x × scale, rect.top + y × scale)`. All three drag handlers (move, scale, rotate) divide screen-space deltas by `scaleRef.current` to recover logical page deltas.

---

## Deploying to Vercel

The repo includes a `vercel.json` that Vercel uses automatically:

```json
{
	"buildCommand": "npm run build",
	"outputDirectory": "dist",
	"framework": "vite",
	"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

To deploy:

1. Push the repository to GitHub, GitLab, or Bitbucket
2. Import the project in [vercel.com/new](https://vercel.com/new)
3. Vercel auto-detects the Vite framework — no settings to change
4. Click **Deploy**

The `rewrites` rule ensures the SPA loads correctly if someone navigates directly to any URL path.

---

## Supported formats

| Format     | Ingest                         | PDF embedding      |
| ---------- | ------------------------------ | ------------------ |
| JPEG / JPG | ✓ direct                       | ✓ native (pdf-lib) |
| PNG        | ✓ direct                       | ✓ native (pdf-lib) |
| WebP       | ✓ converted to JPEG via canvas | ✓ (as JPEG)        |

---

## Browser support

Requires a modern evergreen browser. The binding constraints are:

| API                         | Minimum                            |
| --------------------------- | ---------------------------------- |
| `crypto.randomUUID`         | Chrome 92, Firefox 95, Safari 15.4 |
| `createImageBitmap`         | Chrome 55, Firefox 42, Safari 15   |
| Web Workers (module format) | Chrome 80, Firefox 114, Safari 15  |
| `ResizeObserver`            | Chrome 64, Firefox 69, Safari 13.1 |
| Pointer Events              | Chrome 55, Firefox 59, Safari 13   |

---

## Build output

```
dist/index.html                   0.82 kB  (gzip: 0.46 kB)
dist/assets/pdfWorker.js        438.96 kB  ← pdf-lib + fflate (worker bundle)
dist/assets/index.css            25.58 kB  (gzip: 5.20 kB)
dist/assets/index.js            220.76 kB  (gzip: 70.88 kB)
```

The worker bundle is large because it bundles `pdf-lib` (~400 KB). It loads once and stays resident for the page lifetime. Because it runs off the main thread, its size does not affect UI responsiveness.
