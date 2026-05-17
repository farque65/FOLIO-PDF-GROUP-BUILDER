import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { UploadedImage, GroupSlot, SlotPrintSettings, CropRect, PlaceSettings } from '../types';

// ─── Page constants ───────────────────────────────────────────────────────────

export const PAGE_W = 500;
export const PAGE_H = Math.round(PAGE_W * 297 / 210);
const MARGIN_GUIDE = Math.round(PAGE_W * 20 / 210);
const RENDER_W = 1240;  // A4 @ 150 DPI
const RENDER_H = 1754;
const RENDER_SCALE = RENDER_W / PAGE_W;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? b.arrayBuffer().then(resolve)
          : reject(new Error('canvas.toBlob returned null')),
      'image/jpeg',
      0.92
    );
  });
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function defaultPlace(aspect: number): PlaceSettings {
  const availW = PAGE_W - MARGIN_GUIDE * 2;
  const availH = PAGE_H - MARGIN_GUIDE * 2;
  const w = Math.min(availW, availH * aspect);
  const h = w / aspect;
  return { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, rotation: 0 };
}

// ─── Crop mode ────────────────────────────────────────────────────────────────

const CROP_MAX_W = 560;
const CROP_MAX_H = 500;
const MIN_CROP_PX = 20;

type HandleName = 'nw' | 'ne' | 'sw' | 'se';
type DragAction = 'draw' | 'move' | HandleName;
interface CropDisplay { x: number; y: number; w: number; h: number }

function CropMode({
  image, naturalW, naturalH, crop, onCropChange,
}: {
  image: UploadedImage; naturalW: number; naturalH: number;
  crop: CropRect | null; onCropChange: (r: CropRect | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ds = Math.min(CROP_MAX_W / naturalW, CROP_MAX_H / naturalH, 1);
  const dispW = Math.round(naturalW * ds);
  const dispH = Math.round(naturalH * ds);

  const cd: CropDisplay | null = crop
    ? { x: crop.x * ds, y: crop.y * ds, w: crop.width * ds, h: crop.height * ds }
    : null;

  const dragRef = useRef<{ action: DragAction; ptrX: number; ptrY: number; init: CropDisplay } | null>(null);

  function rel(clientX: number, clientY: number) {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: clamp(clientX - r.left, 0, dispW), y: clamp(clientY - r.top, 0, dispH) };
  }

  function toNatural(d: CropDisplay): CropRect {
    return {
      x: Math.round(clamp(d.x / ds, 0, naturalW - 1)),
      y: Math.round(clamp(d.y / ds, 0, naturalH - 1)),
      width:  Math.round(clamp(d.w / ds, 1, naturalW)),
      height: Math.round(clamp(d.h / ds, 1, naturalH)),
    };
  }

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x: px, y: py } = rel(e.clientX, e.clientY);
    const dx = px - d.ptrX, dy = py - d.ptrY;
    const init = d.init;
    const MIN = MIN_CROP_PX;
    let next = { ...init };

    if (d.action === 'draw') {
      next = { x: Math.min(d.ptrX, px), y: Math.min(d.ptrY, py), w: Math.abs(px - d.ptrX), h: Math.abs(py - d.ptrY) };
    } else if (d.action === 'move') {
      next.x = clamp(init.x + dx, 0, dispW - init.w);
      next.y = clamp(init.y + dy, 0, dispH - init.h);
    } else {
      const r = init.x + init.w, b = init.y + init.h;
      if (d.action === 'nw') { next.x = clamp(init.x + dx, 0, r - MIN); next.y = clamp(init.y + dy, 0, b - MIN); next.w = r - next.x; next.h = b - next.y; }
      else if (d.action === 'ne') { next.y = clamp(init.y + dy, 0, b - MIN); next.w = clamp(init.w + dx, MIN, dispW - init.x); next.h = b - next.y; }
      else if (d.action === 'sw') { next.x = clamp(init.x + dx, 0, r - MIN); next.w = r - next.x; next.h = clamp(init.h + dy, MIN, dispH - init.y); }
      else { next.w = clamp(init.w + dx, MIN, dispW - init.x); next.h = clamp(init.h + dy, MIN, dispH - init.y); }
    }

    next.w = Math.max(MIN, next.w); next.h = Math.max(MIN, next.h);
    next.x = clamp(next.x, 0, dispW - next.w); next.y = clamp(next.y, 0, dispH - next.h);
    if (next.w > 0 && next.h > 0) onCropChange(toNatural(next));
  }, [dispW, dispH, ds, naturalW, naturalH, onCropChange]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  function startDrag(e: ReactPointerEvent, action: DragAction) {
    e.preventDefault(); e.stopPropagation();
    const { x, y } = rel(e.clientX, e.clientY);
    dragRef.current = { action, ptrX: x, ptrY: y, init: cd ?? { x, y, w: 0, h: 0 } };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return (
    <div className="crop-mode-wrap">
      <div ref={containerRef} className="crop-canvas" style={{ width: dispW, height: dispH }}
        onPointerDown={(e) => startDrag(e, 'draw')}>
        <img src={image.previewUrl} draggable={false} style={{ width: dispW, height: dispH, display: 'block', userSelect: 'none' }} />
        {cd && (
          <>
            <div className="crop-dim" style={{ top: 0, left: 0, width: '100%', height: cd.y }} />
            <div className="crop-dim" style={{ top: cd.y + cd.h, left: 0, width: '100%', bottom: 0 }} />
            <div className="crop-dim" style={{ top: cd.y, left: 0, width: cd.x, height: cd.h }} />
            <div className="crop-dim" style={{ top: cd.y, left: cd.x + cd.w, right: 0, height: cd.h }} />
            <div className="crop-rect" style={{ top: cd.y, left: cd.x, width: cd.w, height: cd.h }}
              onPointerDown={(e) => startDrag(e, 'move')}>
              <div className="crop-grid-h" style={{ top: '33.33%' }} />
              <div className="crop-grid-h" style={{ top: '66.66%' }} />
              <div className="crop-grid-v" style={{ left: '33.33%' }} />
              <div className="crop-grid-v" style={{ left: '66.66%' }} />
              {(['nw', 'ne', 'sw', 'se'] as HandleName[]).map((h) => (
                <div key={h} className={`crop-handle crop-handle-${h}`} onPointerDown={(e) => startDrag(e, h)} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="crop-hints">
        <span>Drag to draw · Drag inside to move · Drag corners to resize</span>
        {crop && (
          <>
            <span className="crop-hint-dim">{crop.width} × {crop.height} px</span>
            <button className="crop-clear" onClick={() => onCropChange(null)}>✕ Clear crop</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Scale with rotation ──────────────────────────────────────────────────────

const MIN_PLACE_W = 40;

function computeScale(corner: HandleName, dx: number, dy: number, sp: PlaceSettings, spH: number, aspect: number): PlaceSettings {
  const theta = ((sp.rotation ?? 0) * Math.PI) / 180;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const toScr = (lx: number, ly: number) => ({ x: lx * cosT - ly * sinT, y: lx * sinT + ly * cosT });
  const cx = sp.x + sp.width / 2, cy = sp.y + spH / 2;

  const aL: Record<HandleName, [number, number]> = { se: [-sp.width/2,-spH/2], sw:[sp.width/2,-spH/2], ne:[-sp.width/2,spH/2], nw:[sp.width/2,spH/2] };
  const dL: Record<HandleName, [number, number]> = { se:[sp.width/2,spH/2], sw:[-sp.width/2,spH/2], ne:[sp.width/2,-spH/2], nw:[-sp.width/2,-spH/2] };

  const aScr = toScr(...aL[corner]);
  const ancX = cx + aScr.x, ancY = cy + aScr.y;
  const dScr = toScr(...dL[corner]);
  const newDX = cx + dScr.x + dx, newDY = cy + dScr.y + dy;
  const vecX = newDX - ancX, vecY = newDY - ancY;

  const sign = (corner === 'se' || corner === 'ne') ? 1 : -1;
  const nw = Math.max(MIN_PLACE_W, sign * (vecX * cosT + vecY * sinT));
  const nh = nw / aspect;

  const cL: Record<HandleName, [number, number]> = { se:[nw/2,nh/2], sw:[-nw/2,nh/2], ne:[nw/2,-nh/2], nw:[-nw/2,-nh/2] };
  const cScr = toScr(...cL[corner]);
  return { x: ancX + cScr.x - nw/2, y: ancY + cScr.y - nh/2, width: nw, rotation: sp.rotation ?? 0 };
}

// ─── Place mode ───────────────────────────────────────────────────────────────

function PlaceMode({ image, naturalW, naturalH, crop, place, onPlaceChange }: {
  image: UploadedImage; naturalW: number; naturalH: number;
  crop: CropRect | null; place: PlaceSettings; onPlaceChange: (p: PlaceSettings) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef(place);
  useEffect(() => { placeRef.current = place; }, [place]);

  const cropW = crop?.width ?? naturalW;
  const cropH = crop?.height ?? naturalH;
  const aspect = cropW / (cropH || 1);
  const placeH = place.width / aspect;
  const rotation = place.rotation ?? 0;
  const imgScale = place.width / (cropW || 1);
  const imgLeft = crop ? -crop.x * imgScale : 0;
  const imgTop  = crop ? -crop.y * imgScale : 0;
  const imgDispW = naturalW * imgScale;
  const imgDispH = naturalH * imgScale;

  // ── Move ──────────────────────────────────────────────────────────────────
  const moveDrag = useRef<{ sx: number; sy: number; sp: PlaceSettings } | null>(null);
  const onMoveMove = useCallback((e: PointerEvent) => {
    const d = moveDrag.current; if (!d) return;
    onPlaceChange({ ...d.sp, x: d.sp.x + e.clientX - d.sx, y: d.sp.y + e.clientY - d.sy });
  }, [onPlaceChange]);
  const onMoveUp = useCallback(() => { moveDrag.current = null; window.removeEventListener('pointermove', onMoveMove); }, [onMoveMove]);
  function startMove(e: ReactPointerEvent) {
    e.preventDefault(); e.stopPropagation();
    moveDrag.current = { sx: e.clientX, sy: e.clientY, sp: place };
    window.addEventListener('pointermove', onMoveMove);
    window.addEventListener('pointerup', onMoveUp, { once: true });
  }

  // ── Scale ─────────────────────────────────────────────────────────────────
  const scaleDrag = useRef<{ corner: HandleName; sx: number; sy: number; sp: PlaceSettings; sh: number } | null>(null);
  const onScaleMove = useCallback((e: PointerEvent) => {
    const d = scaleDrag.current; if (!d) return;
    onPlaceChange(computeScale(d.corner, e.clientX - d.sx, e.clientY - d.sy, d.sp, d.sh, aspect));
  }, [aspect, onPlaceChange]);
  const onScaleUp = useCallback(() => { scaleDrag.current = null; window.removeEventListener('pointermove', onScaleMove); }, [onScaleMove]);
  function startScale(e: ReactPointerEvent, corner: HandleName) {
    e.preventDefault(); e.stopPropagation();
    scaleDrag.current = { corner, sx: e.clientX, sy: e.clientY, sp: place, sh: placeH };
    window.addEventListener('pointermove', onScaleMove);
    window.addEventListener('pointerup', onScaleUp, { once: true });
  }

  // ── Rotate ────────────────────────────────────────────────────────────────
  const rotateDrag = useRef<{ startAngle: number; startRot: number; clx: number; cly: number } | null>(null);
  const onRotateMove = useCallback((e: PointerEvent) => {
    const d = rotateDrag.current; if (!d || !pageRef.current) return;
    const r = pageRef.current.getBoundingClientRect();
    const cur = Math.atan2(e.clientY - (r.top + d.cly), e.clientX - (r.left + d.clx)) * 180 / Math.PI;
    const newRot = (((d.startRot + cur - d.startAngle) % 360) + 360) % 360;
    onPlaceChange({ ...placeRef.current, rotation: newRot });
  }, [onPlaceChange]);
  const onRotateUp = useCallback(() => { rotateDrag.current = null; window.removeEventListener('pointermove', onRotateMove); }, [onRotateMove]);
  function startRotate(e: ReactPointerEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!pageRef.current) return;
    const r = pageRef.current.getBoundingClientRect();
    const p = placeRef.current;
    const pH = p.width / aspect;
    const clx = p.x + p.width / 2, cly = p.y + pH / 2;
    const startAngle = Math.atan2(e.clientY - (r.top + cly), e.clientX - (r.left + clx)) * 180 / Math.PI;
    rotateDrag.current = { startAngle, startRot: p.rotation ?? 0, clx, cly };
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', onRotateUp, { once: true });
  }

  const isRotated = Math.round(rotation) % 360 !== 0;

  return (
    <div className="place-mode-wrap">
      <div className="place-page" style={{ width: PAGE_W, height: PAGE_H }} ref={pageRef}>
        <div className="page-margin-guide" style={{ inset: MARGIN_GUIDE }} />
        <div className="page-corner page-corner-tl" /><div className="page-corner page-corner-tr" />
        <div className="page-corner page-corner-bl" /><div className="page-corner page-corner-br" />

        <div className="placed-outer" style={{ left: place.x, top: place.y, width: place.width, height: placeH, transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}>
          <div className="rotation-handle-wrap" onPointerDown={startRotate}>
            <div className="rotation-handle-knob" title="Drag to rotate">↻</div>
            <div className="rotation-handle-line" />
          </div>
          <div className="placed-image-inner" onPointerDown={startMove}>
            <img src={image.previewUrl} draggable={false}
              style={{ position: 'absolute', left: imgLeft, top: imgTop, width: imgDispW, height: imgDispH, userSelect: 'none', pointerEvents: 'none' }} />
          </div>
          {!isRotated && <div className="placed-selection-border" />}
          {(['nw', 'ne', 'sw', 'se'] as HandleName[]).map((corner) => (
            <div key={corner} className={`place-handle place-handle-${corner}`} onPointerDown={(e) => startScale(e, corner)} />
          ))}
        </div>

        <div className="page-label">A4 · 210 × 297 mm</div>
      </div>
      <div className="place-hints">Drag image to move · Corners to scale · ↻ knob to rotate freely</div>
    </div>
  );
}

// ─── PrintEditor ──────────────────────────────────────────────────────────────

interface Props {
  slot: GroupSlot;
  image: UploadedImage;
  groupName: string;
  onApply: (slotId: string, settings: SlotPrintSettings) => void;
  onClose: () => void;
}

export function PrintEditor({ slot, image, groupName, onApply, onClose }: Props) {
  const [mode, setMode]   = useState<'crop' | 'place'>('place');
  const [naturalW, setNW] = useState(1);
  const [naturalH, setNH] = useState(1);
  const [crop, setCrop]   = useState<CropRect | null>(slot.printSettings?.crop ?? null);
  const [place, setPlace] = useState<PlaceSettings | null>(slot.printSettings?.place ?? null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadImage(image.previewUrl).then((img) => {
      setNW(img.naturalWidth); setNH(img.naturalHeight);
      if (!slot.printSettings?.place) setPlace(defaultPlace(img.naturalWidth / img.naturalHeight));
    });
  }, [image.previewUrl, slot.printSettings?.place]);

  const cropAspect = crop ? crop.width / (crop.height || 1) : naturalW / (naturalH || 1);
  const currentPlace = place ?? defaultPlace(cropAspect);
  const rotation = currentPlace.rotation ?? 0;

  function fitToPage() {
    const w = Math.min(PAGE_W - MARGIN_GUIDE * 2, (PAGE_H - MARGIN_GUIDE * 2) * cropAspect);
    const h = w / cropAspect;
    setPlace({ x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, rotation });
  }
  function fillPage() {
    const byW = PAGE_H * cropAspect;
    if (byW >= PAGE_W) setPlace({ x: (PAGE_W - byW) / 2, y: 0, width: byW, rotation });
    else { const byH = PAGE_W / cropAspect; setPlace({ x: 0, y: (PAGE_H - byH) / 2, width: PAGE_W, rotation }); }
  }
  function resetAll() {
    setCrop(null);
    if (naturalW > 0) setPlace(defaultPlace(naturalW / (naturalH || 1)));
  }
  function rotateCW()  { setPlace((p) => p ? { ...p, rotation: ((p.rotation ?? 0) + 90) % 360 } : p); }
  function rotateCCW() { setPlace((p) => p ? { ...p, rotation: (((p.rotation ?? 0) - 90) % 360 + 360) % 360 } : p); }

  async function handleApply() {
    if (!place) return;
    setApplying(true); setError(null);
    try {
      const imgEl = await loadImage(image.previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = RENDER_W; canvas.height = RENDER_H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);

      const srcX = crop?.x ?? 0, srcY = crop?.y ?? 0;
      const srcW = crop?.width ?? imgEl.naturalWidth, srcH = crop?.height ?? imgEl.naturalHeight;
      const placeH = place.width / (srcW / (srcH || 1));
      const dstW = place.width * RENDER_SCALE, dstH = placeH * RENDER_SCALE;
      const cx = (place.x + place.width / 2) * RENDER_SCALE;
      const cy = (place.y + placeH / 2) * RENDER_SCALE;
      const theta = ((place.rotation ?? 0) * Math.PI) / 180;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(theta);
      ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, -dstW / 2, -dstH / 2, dstW, dstH);
      ctx.restore();

      // ── Key difference from the backend version ──────────────────────────
      // Instead of uploading the blob, we convert it directly to an ArrayBuffer
      // and store it on the slot. Zero network round-trip.
      const renderedData = await canvasToArrayBuffer(canvas);

      onApply(slot.slotId, { crop, place, renderedData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setApplying(false);
    }
  }

  const rotDeg = Math.round(rotation);

  return (
    <div className="pe-backdrop" onPointerDown={onClose}>
      <div className="pe-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pe-header">
          <div className="pe-title">
            <span className="pe-title-main">🖨 Print Editor</span>
            <span className="pe-title-sub">{groupName} · {image.name}</span>
          </div>
          <button className="pe-close" onClick={onClose}>✕</button>
        </div>

        <div className="pe-toolbar">
          <div className="pe-mode-group">
            <button className={`pe-tab ${mode === 'crop'  ? 'active' : ''}`} onClick={() => setMode('crop')}>✂ Crop</button>
            <button className={`pe-tab ${mode === 'place' ? 'active' : ''}`} onClick={() => setMode('place')}>↔ Place</button>
          </div>
          <div className="pe-toolbar-sep" />
          <button className="pe-action-btn" onClick={fitToPage}>Fit Page</button>
          <button className="pe-action-btn" onClick={fillPage}>Fill Page</button>
          <button className="pe-action-btn" onClick={resetAll}>Reset</button>
          {mode === 'place' && (
            <>
              <div className="pe-toolbar-sep" />
              <button className="pe-action-btn pe-rotate-btn" onClick={rotateCCW} title="Rotate 90° CCW">↺ 90°</button>
              <button className="pe-action-btn pe-rotate-btn" onClick={rotateCW}  title="Rotate 90° CW">↻ 90°</button>
              {rotDeg !== 0 && <span className="pe-rotation-badge">{rotDeg}°</span>}
            </>
          )}
          <div className="pe-toolbar-spacer" />
          {crop && <span className="pe-crop-badge">Crop: {crop.width} × {crop.height}</span>}
        </div>

        <div className="pe-body">
          {mode === 'crop'
            ? <CropMode image={image} naturalW={naturalW} naturalH={naturalH} crop={crop} onCropChange={setCrop} />
            : <PlaceMode image={image} naturalW={naturalW} naturalH={naturalH} crop={crop} place={currentPlace} onPlaceChange={setPlace} />}
        </div>

        <div className="pe-footer">
          {error && <span className="pe-error">{error}</span>}
          <button className="pe-btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
          <button className={`btn-generate ${applying ? 'loading' : ''}`} onClick={handleApply}
            disabled={applying || !place} style={{ minWidth: 160 }}>
            {applying ? <><span className="spinner" />Rendering…</> : '✓ Apply to Slot'}
          </button>
        </div>
      </div>
    </div>
  );
}
