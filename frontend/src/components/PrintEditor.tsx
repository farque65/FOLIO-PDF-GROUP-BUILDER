import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { UploadedImage, GroupSlot, SlotPrintSettings, CropRect, PlaceSettings } from '../types';
import { uploadImages } from '../utils/api';

// ─── Page constants ───────────────────────────────────────────────────────────

export const PAGE_W = 500;
export const PAGE_H = Math.round(PAGE_W * 297 / 210); // ≈ 708 px
const MARGIN_GUIDE = Math.round(PAGE_W * 20 / 210);    // 20 mm ≈ 48 px
const RENDER_W = 1240;                                  // A4 @ 150 DPI
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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      type,
      quality
    );
  });
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function defaultPlace(aspectRatio: number): PlaceSettings {
  const availW = PAGE_W - MARGIN_GUIDE * 2;
  const availH = PAGE_H - MARGIN_GUIDE * 2;
  const w = Math.min(availW, availH * aspectRatio);
  const h = w / aspectRatio;
  return {
    x: (PAGE_W - w) / 2,
    y: (PAGE_H - h) / 2,
    width: w,
    rotation: 0,
  };
}

// ─── CropMode ─────────────────────────────────────────────────────────────────

const CROP_MAX_W = 560;
const CROP_MAX_H = 500;
const MIN_CROP_PX = 20;

type HandleName = 'nw' | 'ne' | 'sw' | 'se';
type DragAction = 'draw' | 'move' | HandleName;
interface CropDisplay { x: number; y: number; w: number; h: number }

function CropMode({
  image, naturalW, naturalH, crop, onCropChange,
}: {
  image: UploadedImage;
  naturalW: number;
  naturalH: number;
  crop: CropRect | null;
  onCropChange: (r: CropRect | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayScale = Math.min(CROP_MAX_W / naturalW, CROP_MAX_H / naturalH, 1);
  const dispW = Math.round(naturalW * displayScale);
  const dispH = Math.round(naturalH * displayScale);

  const cd: CropDisplay | null = crop
    ? { x: crop.x * displayScale, y: crop.y * displayScale, w: crop.width * displayScale, h: crop.height * displayScale }
    : null;

  const dragRef = useRef<{ action: DragAction; ptrX: number; ptrY: number; init: CropDisplay } | null>(null);

  function getRelPt(clientX: number, clientY: number) {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: clamp(clientX - r.left, 0, dispW), y: clamp(clientY - r.top, 0, dispH) };
  }

  function toNatural(d: CropDisplay): CropRect {
    return {
      x: Math.round(clamp(d.x / displayScale, 0, naturalW - 1)),
      y: Math.round(clamp(d.y / displayScale, 0, naturalH - 1)),
      width: Math.round(clamp(d.w / displayScale, 1, naturalW)),
      height: Math.round(clamp(d.h / displayScale, 1, naturalH)),
    };
  }

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x: px, y: py } = getRelPt(e.clientX, e.clientY);
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
      if (d.action === 'nw') {
        next.x = clamp(init.x + dx, 0, r - MIN); next.y = clamp(init.y + dy, 0, b - MIN);
        next.w = r - next.x; next.h = b - next.y;
      } else if (d.action === 'ne') {
        next.y = clamp(init.y + dy, 0, b - MIN);
        next.w = clamp(init.w + dx, MIN, dispW - init.x); next.h = b - next.y;
      } else if (d.action === 'sw') {
        next.x = clamp(init.x + dx, 0, r - MIN);
        next.w = r - next.x; next.h = clamp(init.h + dy, MIN, dispH - init.y);
      } else {
        next.w = clamp(init.w + dx, MIN, dispW - init.x);
        next.h = clamp(init.h + dy, MIN, dispH - init.y);
      }
    }

    next.w = Math.max(MIN, next.w); next.h = Math.max(MIN, next.h);
    next.x = clamp(next.x, 0, dispW - next.w); next.y = clamp(next.y, 0, dispH - next.h);
    if (next.w > 0 && next.h > 0) onCropChange(toNatural(next));
  }, [dispW, dispH, displayScale, naturalW, naturalH, onCropChange]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);

  function startDrag(e: ReactPointerEvent, action: DragAction) {
    e.preventDefault(); e.stopPropagation();
    const { x, y } = getRelPt(e.clientX, e.clientY);
    dragRef.current = { action, ptrX: x, ptrY: y, init: cd ?? { x, y, w: 0, h: 0 } };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return (
    <div className="crop-mode-wrap">
      <div ref={containerRef} className="crop-canvas" style={{ width: dispW, height: dispH }}
        onPointerDown={(e) => startDrag(e, 'draw')}>
        <img src={image.previewUrl} draggable={false}
          style={{ width: dispW, height: dispH, display: 'block', userSelect: 'none' }} />
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
                <div key={h} className={`crop-handle crop-handle-${h}`}
                  onPointerDown={(e) => startDrag(e, h)} />
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

/**
 * Compute new PlaceSettings after dragging a scale corner handle, accounting
 * for the image's current rotation. The opposite corner's screen position is
 * kept fixed. Aspect ratio is preserved.
 */
function computeScale(
  corner: HandleName,
  dx: number,
  dy: number,
  sp: PlaceSettings,
  spH: number,
  aspect: number,
): PlaceSettings {
  const theta = ((sp.rotation ?? 0) * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Rotate a local vector (image space) → screen space
  const toScreen = (lx: number, ly: number) => ({
    x: lx * cosT - ly * sinT,
    y: lx * sinT + ly * cosT,
  });

  const cx = sp.x + sp.width / 2;
  const cy = sp.y + spH / 2;

  // Anchor (opposite corner) in local & screen coords
  const anchorLocal: Record<HandleName, [number, number]> = {
    se: [-sp.width / 2, -spH / 2],
    sw: [ sp.width / 2, -spH / 2],
    ne: [-sp.width / 2,  spH / 2],
    nw: [ sp.width / 2,  spH / 2],
  };
  const [alx, aly] = anchorLocal[corner];
  const aScreen = toScreen(alx, aly);
  const anchorX = cx + aScreen.x;
  const anchorY = cy + aScreen.y;

  // Dragged corner's initial screen position
  const dragLocal: Record<HandleName, [number, number]> = {
    se: [ sp.width / 2,  spH / 2],
    sw: [-sp.width / 2,  spH / 2],
    ne: [ sp.width / 2, -spH / 2],
    nw: [-sp.width / 2, -spH / 2],
  };
  const [dlx, dly] = dragLocal[corner];
  const dScreen = toScreen(dlx, dly);

  // New dragged corner screen position (after pointer delta)
  const newDragX = cx + dScreen.x + dx;
  const newDragY = cy + dScreen.y + dy;

  // Vector anchor → new drag, projected onto image local x-axis
  const vecX = newDragX - anchorX;
  const vecY = newDragY - anchorY;
  const sign = (corner === 'se' || corner === 'ne') ? 1 : -1;
  const projW = sign * (vecX * cosT + vecY * sinT);
  const newWidth = Math.max(MIN_PLACE_W, projW);
  const newHeight = newWidth / aspect;

  // New center: anchor + (half new dims) in local coords → screen
  const cFromAnchor: Record<HandleName, [number, number]> = {
    se: [ newWidth / 2,  newHeight / 2],
    sw: [-newWidth / 2,  newHeight / 2],
    ne: [ newWidth / 2, -newHeight / 2],
    nw: [-newWidth / 2, -newHeight / 2],
  };
  const [cfx, cfy] = cFromAnchor[corner];
  const cScreen = toScreen(cfx, cfy);
  const newCx = anchorX + cScreen.x;
  const newCy = anchorY + cScreen.y;

  return { x: newCx - newWidth / 2, y: newCy - newHeight / 2, width: newWidth, rotation: sp.rotation ?? 0 };
}

// ─── PlaceMode ────────────────────────────────────────────────────────────────

function PlaceMode({
  image, naturalW, naturalH, crop, place, onPlaceChange,
}: {
  image: UploadedImage;
  naturalW: number;
  naturalH: number;
  crop: CropRect | null;
  place: PlaceSettings;
  onPlaceChange: (p: PlaceSettings) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef(place);
  useEffect(() => { placeRef.current = place; }, [place]);

  const cropW = crop?.width ?? naturalW;
  const cropH = crop?.height ?? naturalH;
  const aspect = cropW / (cropH || 1);
  const placeH = place.width / aspect;
  const rotation = place.rotation ?? 0;

  // CSS for rendering the cropped portion of the image inside its container
  const imgScale = place.width / (cropW || 1);
  const imgDispW = naturalW * imgScale;
  const imgDispH = naturalH * imgScale;
  const imgLeft = crop ? -crop.x * imgScale : 0;
  const imgTop  = crop ? -crop.y * imgScale : 0;

  // ── Move ──────────────────────────────────────────────────────────────────
  const moveDrag = useRef<{ startPx: number; startPy: number; startPlace: PlaceSettings } | null>(null);

  const onMoveMove = useCallback((e: PointerEvent) => {
    const d = moveDrag.current;
    if (!d) return;
    onPlaceChange({
      ...d.startPlace,
      x: d.startPlace.x + e.clientX - d.startPx,
      y: d.startPlace.y + e.clientY - d.startPy,
    });
  }, [onPlaceChange]);

  const onMoveUp = useCallback(() => {
    moveDrag.current = null;
    window.removeEventListener('pointermove', onMoveMove);
  }, [onMoveMove]);

  function startMove(e: ReactPointerEvent) {
    e.preventDefault(); e.stopPropagation();
    moveDrag.current = { startPx: e.clientX, startPy: e.clientY, startPlace: place };
    window.addEventListener('pointermove', onMoveMove);
    window.addEventListener('pointerup', onMoveUp, { once: true });
  }

  // ── Scale (rotation-aware) ────────────────────────────────────────────────
  const scaleDrag = useRef<{
    corner: HandleName; startPx: number; startPy: number; startPlace: PlaceSettings; startH: number;
  } | null>(null);

  const onScaleMove = useCallback((e: PointerEvent) => {
    const d = scaleDrag.current;
    if (!d) return;
    const dx = e.clientX - d.startPx;
    const dy = e.clientY - d.startPy;
    onPlaceChange(computeScale(d.corner, dx, dy, d.startPlace, d.startH, aspect));
  }, [aspect, onPlaceChange]);

  const onScaleUp = useCallback(() => {
    scaleDrag.current = null;
    window.removeEventListener('pointermove', onScaleMove);
  }, [onScaleMove]);

  function startScale(e: ReactPointerEvent, corner: HandleName) {
    e.preventDefault(); e.stopPropagation();
    scaleDrag.current = { corner, startPx: e.clientX, startPy: e.clientY, startPlace: place, startH: placeH };
    window.addEventListener('pointermove', onScaleMove);
    window.addEventListener('pointerup', onScaleUp, { once: true });
  }

  // ── Rotate (drag handle) ──────────────────────────────────────────────────
  const rotateDrag = useRef<{
    startAngle: number;
    startRotation: number;
    centerLocalX: number;
    centerLocalY: number;
  } | null>(null);

  const onRotateMove = useCallback((e: PointerEvent) => {
    const d = rotateDrag.current;
    if (!d || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const currentAngle = Math.atan2(
      e.clientY - (rect.top  + d.centerLocalY),
      e.clientX - (rect.left + d.centerLocalX),
    ) * 180 / Math.PI;
    const delta = currentAngle - d.startAngle;
    const newRotation = ((d.startRotation + delta) % 360 + 360) % 360;
    onPlaceChange({ ...placeRef.current, rotation: newRotation });
  }, [onPlaceChange]);

  const onRotateUp = useCallback(() => {
    rotateDrag.current = null;
    window.removeEventListener('pointermove', onRotateMove);
  }, [onRotateMove]);

  function startRotate(e: ReactPointerEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    const p = placeRef.current;
    const pH = p.width / aspect;
    const centerLocalX = p.x + p.width / 2;
    const centerLocalY = p.y + pH / 2;
    const startAngle = Math.atan2(
      e.clientY - (rect.top  + centerLocalY),
      e.clientX - (rect.left + centerLocalX),
    ) * 180 / Math.PI;
    rotateDrag.current = { startAngle, startRotation: p.rotation ?? 0, centerLocalX, centerLocalY };
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', onRotateUp, { once: true });
  }

  const isRotated = Math.round(rotation) % 360 !== 0;

  return (
    <div className="place-mode-wrap">
      <div className="place-page" style={{ width: PAGE_W, height: PAGE_H }} ref={pageRef}>
        {/* Margin guide */}
        <div className="page-margin-guide" style={{ inset: MARGIN_GUIDE }} />

        {/* Corner marks */}
        <div className="page-corner page-corner-tl" />
        <div className="page-corner page-corner-tr" />
        <div className="page-corner page-corner-bl" />
        <div className="page-corner page-corner-br" />

        {/* ── Outer wrapper: handles rotation transform.
              No overflow here — scale handles and rotation knob live outside the image clip. ── */}
        <div
          className="placed-outer"
          style={{
            left: place.x,
            top:  place.y,
            width:  place.width,
            height: placeH,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Rotation knob — sits above top-center, rotates with the image */}
          <div className="rotation-handle-wrap" onPointerDown={startRotate}>
            <div className="rotation-handle-knob" title="Drag to rotate">↻</div>
            <div className="rotation-handle-line" />
          </div>

          {/* Inner: overflow:hidden clips the image to the crop region */}
          <div
            className="placed-image-inner"
            onPointerDown={startMove}
          >
            <img
              src={image.previewUrl}
              draggable={false}
              style={{
                position: 'absolute',
                left: imgLeft,
                top:  imgTop,
                width:  imgDispW,
                height: imgDispH,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Selection border — hidden when rotated (no-box behaviour) */}
          {!isRotated && <div className="placed-selection-border" />}

          {/* Scale handles — outside the overflow:hidden inner, always visible */}
          {(['nw', 'ne', 'sw', 'se'] as HandleName[]).map((corner) => (
            <div
              key={corner}
              className={`place-handle place-handle-${corner}`}
              onPointerDown={(e) => startScale(e, corner)}
            />
          ))}
        </div>

        <div className="page-label">A4 · 210 × 297 mm</div>
      </div>

      <div className="place-hints">
        Drag image to move · Corners to scale · ↻ knob to rotate freely
      </div>
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
  const [mode, setMode] = useState<'crop' | 'place'>('place');
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [crop, setCrop]   = useState<CropRect | null>(slot.printSettings?.crop ?? null);
  const [place, setPlace] = useState<PlaceSettings | null>(slot.printSettings?.place ?? null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadImage(image.previewUrl).then((img) => {
      setNaturalW(img.naturalWidth);
      setNaturalH(img.naturalHeight);
      if (!slot.printSettings?.place) {
        setPlace(defaultPlace(img.naturalWidth / img.naturalHeight));
      }
    });
  }, [image.previewUrl, slot.printSettings?.place]);

  const cropAspect = crop
    ? crop.width / (crop.height || 1)
    : naturalW / (naturalH || 1);

  const currentPlace = place ?? defaultPlace(cropAspect);
  const rotation = currentPlace.rotation ?? 0;

  // ── Toolbar actions ────────────────────────────────────────────────────────

  function fitToPage() {
    const availW = PAGE_W - MARGIN_GUIDE * 2;
    const availH = PAGE_H - MARGIN_GUIDE * 2;
    const w = Math.min(availW, availH * cropAspect);
    const h = w / cropAspect;
    setPlace({ x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, rotation });
  }

  function fillPage() {
    const byW = PAGE_H * cropAspect;
    const byH = PAGE_W / cropAspect;
    if (byW >= PAGE_W) {
      setPlace({ x: (PAGE_W - byW) / 2, y: 0, width: byW, rotation });
    } else {
      setPlace({ x: 0, y: (PAGE_H - byH) / 2, width: PAGE_W, rotation });
    }
  }

  function resetAll() {
    setCrop(null);
    if (naturalW > 0) setPlace(defaultPlace(naturalW / (naturalH || 1))); // rotation reset to 0
  }

  function rotateCW()  { setPlace(p => p ? { ...p, rotation: ((p.rotation ?? 0) + 90) % 360 } : p); }
  function rotateCCW() { setPlace(p => p ? { ...p, rotation: (((p.rotation ?? 0) - 90) % 360 + 360) % 360 } : p); }

  // ── Canvas render & upload ─────────────────────────────────────────────────

  async function handleApply() {
    if (!place) return;
    setApplying(true);
    setError(null);
    try {
      const imgEl = await loadImage(image.previewUrl);

      const canvas = document.createElement('canvas');
      canvas.width  = RENDER_W;
      canvas.height = RENDER_H;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, RENDER_W, RENDER_H);

      const srcX = crop?.x ?? 0;
      const srcY = crop?.y ?? 0;
      const srcW = crop?.width  ?? imgEl.naturalWidth;
      const srcH = crop?.height ?? imgEl.naturalHeight;

      const placeH = place.width / (srcW / (srcH || 1));
      const dstW = place.width * RENDER_SCALE;
      const dstH = placeH     * RENDER_SCALE;

      // Centre of the placed image in render-canvas coordinates
      const centerX = (place.x + place.width / 2) * RENDER_SCALE;
      const centerY = (place.y + placeH      / 2) * RENDER_SCALE;
      const theta   = ((place.rotation ?? 0) * Math.PI) / 180;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(theta);
      // Draw image centred at origin (then rotated + translated above)
      ctx.drawImage(imgEl, srcX, srcY, srcW, srcH, -dstW / 2, -dstH / 2, dstW, dstH);
      ctx.restore();

      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const file = new File([blob], `rendered_${slot.slotId}.jpg`, { type: 'image/jpeg' });
      const [uploaded] = await uploadImages([file]);

      onApply(slot.slotId, { crop, place, renderedImageId: uploaded.id });
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

        {/* Header */}
        <div className="pe-header">
          <div className="pe-title">
            <span className="pe-title-main">🖨 Print Editor</span>
            <span className="pe-title-sub">{groupName} · {image.name}</span>
          </div>
          <button className="pe-close" onClick={onClose}>✕</button>
        </div>

        {/* Toolbar */}
        <div className="pe-toolbar">
          <div className="pe-mode-group">
            <button className={`pe-tab ${mode === 'crop'  ? 'active' : ''}`} onClick={() => setMode('crop')}>✂ Crop</button>
            <button className={`pe-tab ${mode === 'place' ? 'active' : ''}`} onClick={() => setMode('place')}>↔ Place</button>
          </div>

          <div className="pe-toolbar-sep" />
          <button className="pe-action-btn" onClick={fitToPage}>Fit Page</button>
          <button className="pe-action-btn" onClick={fillPage}>Fill Page</button>
          <button className="pe-action-btn" onClick={resetAll}>Reset</button>

          {/* Rotation snap buttons — only in place mode */}
          {mode === 'place' && (
            <>
              <div className="pe-toolbar-sep" />
              <button className="pe-action-btn pe-rotate-btn" onClick={rotateCCW} title="Rotate 90° counter-clockwise">↺ 90°</button>
              <button className="pe-action-btn pe-rotate-btn" onClick={rotateCW}  title="Rotate 90° clockwise">↻ 90°</button>
              {rotDeg !== 0 && (
                <span className="pe-rotation-badge">{rotDeg}°</span>
              )}
            </>
          )}

          <div className="pe-toolbar-spacer" />
          {crop && <span className="pe-crop-badge">Crop: {crop.width} × {crop.height}</span>}
        </div>

        {/* Body */}
        <div className="pe-body">
          {mode === 'crop' ? (
            <CropMode image={image} naturalW={naturalW} naturalH={naturalH} crop={crop} onCropChange={setCrop} />
          ) : (
            <PlaceMode
              image={image} naturalW={naturalW} naturalH={naturalH}
              crop={crop} place={currentPlace} onPlaceChange={setPlace}
            />
          )}
        </div>

        {/* Footer */}
        <div className="pe-footer">
          {error && <span className="pe-error">{error}</span>}
          <button className="pe-btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
          <button
            className={`btn-generate ${applying ? 'loading' : ''}`}
            onClick={handleApply}
            disabled={applying || !place}
            style={{ minWidth: 160 }}
          >
            {applying ? <><span className="spinner" />Rendering…</> : '✓ Apply to Slot'}
          </button>
        </div>
      </div>
    </div>
  );
}
