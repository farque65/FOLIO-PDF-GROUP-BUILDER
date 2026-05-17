import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { UploadedImage } from '../types';
import { partitionFiles, processImageFiles, ACCEPTED_EXTENSIONS } from '../utils/imageUtils';

interface Props {
  onProcessed: (images: UploadedImage[]) => void;
  onError: (msg: string) => void;
  onProcessing: (busy: boolean) => void;
}

export function DropZone({ onProcessed, onError, onProcessing }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(raw: FileList | File[]) {
    const { valid, skipped } = partitionFiles(raw);
    if (skipped > 0) {
      onError(`Skipped ${skipped} unsupported file(s). Use JPEG, PNG, or WebP.`);
    }
    if (valid.length === 0) return;

    onProcessing(true);
    try {
      const images = await processImageFiles(valid);
      onProcessed(images);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to process images');
    } finally {
      onProcessing(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    handleFiles(e.target.files);
    e.target.value = '';
  }

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
    >
      <span className="upload-zone-icon">📄</span>
      <div className="upload-zone-title">Drop images here or click to browse</div>
      <div className="upload-zone-sub">JPEG · PNG · WebP</div>
      <input
        ref={inputRef}
        type="file"
        className="upload-zone-input"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
