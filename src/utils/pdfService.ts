import PdfWorker from '../workers/pdfWorker?worker';
import type { WorkerRequest, WorkerResponse, WorkerPage } from '../workers/pdfWorker';
import type { ImageGroup, UploadedImage } from '../types';

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) _worker = new PdfWorker();
  return _worker;
}

function triggerDownload(bytes: ArrayBuffer, filename: string, mimeType: string) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildWorkerGroups(
  groups: ImageGroup[],
  imageMap: Map<string, UploadedImage>,
): WorkerRequest['groups'] {
  return groups
    .filter((g) => g.slots.length > 0)
    .map((g) => ({
      name: g.name,
      pages: g.slots.map((slot): WorkerPage => {
        if (slot.printSettings?.renderedData) {
          return {
            data: slot.printSettings.renderedData,
            mimeType: 'image/jpeg',
            isRenderedPage: true,
          };
        }
        const img = imageMap.get(slot.imageId);
        if (!img) throw new Error(`Image not found: ${slot.imageId}`);
        return {
          data: img.imageData,
          mimeType: img.pdfMimeType,
          isRenderedPage: false,
        };
      }),
    }));
}

export function generateAndDownload(
  groups: ImageGroup[],
  imageMap: Map<string, UploadedImage>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const workerGroups = buildWorkerGroups(groups, imageMap);
    if (workerGroups.length === 0) {
      reject(new Error('No groups with images'));
      return;
    }

    const worker = getWorker();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      if (!res.ok) { reject(new Error(res.error)); return; }

      if (res.kind === 'pdf') {
        triggerDownload(res.bytes.buffer as ArrayBuffer, `${res.name}.pdf`, 'application/pdf');
      } else {
        triggerDownload(res.bytes.buffer as ArrayBuffer, 'pdf-groups.zip', 'application/zip');
      }
      resolve();
    };

    worker.onerror = (e) => reject(new Error(e.message ?? 'Worker error'));
    const request: WorkerRequest = { groups: workerGroups };
    worker.postMessage(request);
  });
}
