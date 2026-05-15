import { UploadedImage } from '../types';

/** Upload image files to the backend. Returns metadata for each uploaded file. */
export async function uploadImages(files: File[]): Promise<UploadedImage[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error((err as { error?: string }).error ?? 'Upload failed');
  }

  const data = await res.json() as {
    uploaded: Array<{ id: string; name: string; size: number; mimeType: 'image/jpeg' | 'image/png' }>;
  };

  // Build a name → File map for creating object URLs
  const fileMap = new Map<string, File>();
  for (const file of files) {
    // Handle duplicate names: use the first match
    if (!fileMap.has(file.name)) fileMap.set(file.name, file);
  }

  return data.uploaded.map((item) => ({
    ...item,
    previewUrl: fileMap.has(item.name)
      ? URL.createObjectURL(fileMap.get(item.name)!)
      : '',
  }));
}

/** Remove a single image from the server */
export async function deleteImage(id: string): Promise<void> {
  await fetch(`/api/upload/${id}`, { method: 'DELETE' });
}

interface GenerateGroup {
  name: string;
  imageIds: string[]; // ordered; [0] is the cover page
}

/**
 * Generate PDFs from the current group configuration.
 * Each group's imageIds are already in page order — [0] is the cover.
 * Downloads a single PDF or a ZIP of multiple PDFs automatically.
 */
export async function generatePdfs(groups: GenerateGroup[]): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error((err as { error?: string }).error ?? 'Generation failed');
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : groups.length === 1 ? `${groups[0].name}.pdf` : 'pdf-groups.zip';

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
