import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { uploadImages } from '../utils/api';
import { UploadedImage } from '../types';

interface Props {
  onUploaded: (images: UploadedImage[]) => void;
  onError: (msg: string) => void;
  onUploading: (loading: boolean) => void;
}

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png'];

export function DropZone({ onUploaded, onError, onUploading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function filterFiles(files: FileList | File[]): File[] {
    const arr = Array.from(files);
    const valid = arr.filter((f) => ACCEPTED.includes(f.type));
    const invalid = arr.filter((f) => !ACCEPTED.includes(f.type));
    if (invalid.length > 0) {
      onError(`Skipped ${invalid.length} unsupported file(s). Only JPEG and PNG accepted.`);
    }
    return valid;
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    onUploading(true);
    try {
      const uploaded = await uploadImages(files);
      onUploaded(uploaded);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      onUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = filterFiles(e.dataTransfer.files);
    handleFiles(files);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = filterFiles(e.target.files);
    handleFiles(files);
    e.target.value = '';
  }

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <span className="upload-zone-icon">📄</span>
      <div className="upload-zone-title">Drop images here or click to browse</div>
      <div className="upload-zone-sub">JPEG · PNG &nbsp;·&nbsp; up to 50 MB per file</div>
      <input
        ref={inputRef}
        type="file"
        className="upload-zone-input"
        accept=".jpg,.jpeg,.png"
        multiple
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
