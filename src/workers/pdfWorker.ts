/**
 * pdfWorker.ts — runs entirely off the main thread.
 *
 * Receives a WorkerRequest via postMessage, generates one PDF per group
 * using pdf-lib, bundles into a ZIP with fflate if needed, then posts
 * the result bytes back. Large ArrayBuffers are transferred (zero-copy).
 */

import { PDFDocument, PageSizes } from 'pdf-lib';
import { zipSync } from 'fflate';

// ─── Shared message types ─────────────────────────────────────────────────────

export interface WorkerPage {
  data: ArrayBuffer;
  mimeType: 'image/jpeg' | 'image/png';
  /**
   * true  → data is a pre-rendered A4 JPEG (from PrintEditor canvas).
   * false → data is a raw source image, auto-fitted to an A4 page.
   */
  isRenderedPage: boolean;
}

export interface WorkerGroup {
  name: string;
  pages: WorkerPage[];
}

export interface WorkerRequest {
  groups: WorkerGroup[];
}

export type WorkerResponse =
  | { ok: true; kind: 'pdf'; bytes: Uint8Array; name: string }
  | { ok: true; kind: 'zip'; bytes: Uint8Array }
  | { ok: false; error: string };

// ─── PDF generation ───────────────────────────────────────────────────────────

const MARGIN_PT = 24;

async function buildPdf(pages: WorkerPage[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const page of pages) {
    const bytes = new Uint8Array(page.data);

    const embedded =
      page.mimeType === 'image/jpeg'
        ? await pdfDoc.embedJpg(bytes)
        : await pdfDoc.embedPng(bytes);

    if (page.isRenderedPage) {
      // Pre-rendered full A4 page — fill exactly, no margins
      const [w, h] = PageSizes.A4;
      const pdfPage = pdfDoc.addPage([w, h]);
      pdfPage.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
    } else {
      // Raw source image — auto-orient and centre with margin
      const dims = embedded.scale(1);
      const isLandscape = dims.width > dims.height;
      const [pageW, pageH] = isLandscape
        ? [PageSizes.A4[1], PageSizes.A4[0]]
        : PageSizes.A4;

      const pdfPage = pdfDoc.addPage([pageW, pageH]);
      const scale = Math.min(
        (pageW - MARGIN_PT * 2) / dims.width,
        (pageH - MARGIN_PT * 2) / dims.height,
      );
      const dw = dims.width * scale;
      const dh = dims.height * scale;

      pdfPage.drawImage(embedded, {
        x: (pageW - dw) / 2,
        y: (pageH - dh) / 2,
        width: dw,
        height: dh,
      });
    }
  }

  return pdfDoc.save();
}

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() || 'group';
}

// ─── Message handler ──────────────────────────────────────────────────────────

onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { groups } = event.data;

  try {
    if (groups.length === 1) {
      const bytes = await buildPdf(groups[0].pages);
      const response: WorkerResponse = { ok: true, kind: 'pdf', bytes, name: sanitise(groups[0].name) };
      postMessage(response);
      return;
    }

    const pdfs = await Promise.all(
      groups.map(async (g) => ({ name: sanitise(g.name), bytes: await buildPdf(g.pages) }))
    );

    const zipInput: Record<string, Uint8Array> = {};
    for (const { name, bytes } of pdfs) {
      zipInput[`${name}.pdf`] = bytes;
    }

    const zipBytes = zipSync(zipInput, { level: 1 });
    const response: WorkerResponse = { ok: true, kind: 'zip', bytes: zipBytes };
    postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown worker error',
    };
    postMessage(response);
  }
};
