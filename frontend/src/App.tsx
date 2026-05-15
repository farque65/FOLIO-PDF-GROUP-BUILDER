import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { DropZone } from './components/DropZone';
import { GroupCard } from './components/GroupCard';
import { ImageTile } from './components/ImageTile';
import { Sidebar } from './components/Sidebar';
import { PrintEditor } from './components/PrintEditor';
import { useGroups } from './hooks/useGroups';
import { DragItemData, GroupSlot, SlotPrintSettings, UploadedImage } from './types';
import { generatePdfs } from './utils/api';

// ─── Toast ───────────────────────────────────────────────────────────────────

interface Toast { id: string; kind: 'success' | 'error' | 'loading'; message: string }
let toastSeq = 0;

// ─── Pool helpers ─────────────────────────────────────────────────────────────

function PoolDropZone({ isActive }: { isActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { type: 'pool' } });
  if (!isActive) return null;
  return (
    <div ref={setNodeRef} className={`pool-return-zone ${isOver ? 'is-over' : ''}`}>
      ↩ Drop here to remove from group
    </div>
  );
}

function PoolImage({ image, onRemove }: { image: UploadedImage; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-${image.id}`,
    data: { type: 'pool-image', imageId: image.id } satisfies DragItemData,
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="pool-image-wrapper">
      <ImageTile image={image} isDragging={isDragging} onRemove={onRemove} showActions />
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    state,
    addImages,
    removeImage,
    addGroup,
    removeGroup,
    renameGroup,
    addSlotToGroup,
    removeSlot,
    reorderSlots,
    moveSlotToGroup,
    setSlotAsTitlePage,
    updateSlotPrintSettings,
  } = useGroups();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);

  // Print editor state
  const [editingSlot, setEditingSlot] = useState<{ slot: GroupSlot; groupId: string } | null>(null);

  const imageMap = new Map(state.images.map((img) => [img.id, img]));
  const activeImage = activeDrag ? imageMap.get(activeDrag.imageId) ?? null : null;

  // ─── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const findGroupIdForId = useCallback(
    (id: string): string | null => {
      if (id.startsWith('group-')) return id.slice(6);
      for (const g of state.groups) {
        if (g.slots.some((sl) => sl.slotId === id)) return g.id;
      }
      return null;
    },
    [state.groups]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as DragItemData);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeData = active.data.current as DragItemData | undefined;
    const overData = over.data.current as DragItemData | undefined;
    if (!activeData) return;
    if (activeData.type === 'group-slot' && overData?.type === 'group-slot') {
      if (activeData.groupId === overData.groupId) {
        const group = state.groups.find((g) => g.id === activeData.groupId);
        if (!group) return;
        const oldIdx = group.slots.findIndex((s) => s.slotId === activeData.slotId);
        const newIdx = group.slots.findIndex((s) => s.slotId === overData.slotId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderSlots(activeData.groupId, oldIdx, newIdx);
        }
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;
    const activeData = active.data.current as DragItemData | undefined;
    if (!activeData) return;
    const overId = over.id as string;
    if (activeData.type === 'pool-image') {
      const targetGroupId = findGroupIdForId(overId);
      if (targetGroupId) addSlotToGroup(targetGroupId, activeData.imageId);
      return;
    }
    if (activeData.type === 'group-slot') {
      if (overId === 'pool') { removeSlot(activeData.groupId, activeData.slotId); return; }
      const targetGroupId = findGroupIdForId(overId);
      if (!targetGroupId || targetGroupId === activeData.groupId) return;
      moveSlotToGroup(activeData.groupId, activeData.slotId, targetGroupId);
    }
  }

  // ─── Print editor ─────────────────────────────────────────────────────────

  function openEditor(groupId: string, slotId: string) {
    const group = state.groups.find((g) => g.id === groupId);
    const slot = group?.slots.find((sl) => sl.slotId === slotId);
    if (slot) setEditingSlot({ slot, groupId });
  }

  function handlePrintApply(slotId: string, settings: SlotPrintSettings) {
    if (!editingSlot) return;
    updateSlotPrintSettings(editingSlot.groupId, slotId, settings);
    setEditingSlot(null);
    showToast('success', 'Print settings applied');
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(kind: Toast['kind'], message: string, durationMs = 3500): string {
    const id = String(toastSeq++);
    setToasts((prev) => [...prev, { id, kind, message }]);
    if (kind !== 'loading') setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), durationMs);
    return id;
  }
  function dismissToast(id: string) { setToasts((prev) => prev.filter((t) => t.id !== id)); }

  // ─── Generate ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    const nonEmptyGroups = state.groups.filter((g) => g.slots.length > 0);
    if (nonEmptyGroups.length === 0) {
      showToast('error', 'Add images to at least one group before generating.');
      return;
    }
    setGenerating(true);
    const toastId = showToast('loading', 'Generating PDFs…', 60_000);
    try {
      const groupPayload = nonEmptyGroups.map((g) => ({
        name: g.name,
        // For slots with print settings, use the pre-rendered page image
        imageIds: g.slots.map((sl) => sl.printSettings?.renderedImageId ?? sl.imageId),
      }));
      await generatePdfs(groupPayload);
      dismissToast(toastId);
      showToast('success', nonEmptyGroups.length === 1 ? 'PDF downloaded!' : `${nonEmptyGroups.length} PDFs downloaded as ZIP`);
    } catch (err) {
      dismissToast(toastId);
      showToast('error', err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const assignedImageIds = new Set(state.groups.flatMap((g) => g.slots.map((sl) => sl.imageId)));
  const poolImages = state.images.filter((img) => !assignedImageIds.has(img.id));
  const isDragActive = activeDrag !== null;
  const canGenerate = !generating && !uploading && state.groups.some((g) => g.slots.length > 0);
  const totalImages = state.images.length;
  const totalGroups = state.groups.length;

  // Find the image for the slot being edited
  const editingImage = editingSlot ? imageMap.get(editingSlot.slot.imageId) : null;
  const editingGroupName = editingSlot ? state.groups.find((g) => g.id === editingSlot.groupId)?.name ?? '' : '';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="app-shell">
        {/* Header */}
        <header className="header">
          <div className="header-logo">
            <span className="header-logo-name">Folio</span>
            <span className="header-logo-tag">PDF Builder</span>
          </div>
          <div className="header-divider" />
          <span className="header-status">
            {totalImages > 0
              ? `${totalImages} image${totalImages !== 1 ? 's' : ''} · ${totalGroups} group${totalGroups !== 1 ? 's' : ''}`
              : 'Upload images to get started'}
          </span>
          <button
            className={`btn-generate ${generating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {generating ? <><span className="spinner" />Generating…</> : <><span>⬇</span>Generate PDFs</>}
          </button>
        </header>

        {/* Body */}
        <div className="body-layout">
          <main className="main-area">
            <DropZone
              onUploaded={(imgs) => { addImages(imgs); showToast('success', `${imgs.length} image${imgs.length !== 1 ? 's' : ''} uploaded`); }}
              onError={(msg) => showToast('error', msg, 5000)}
              onUploading={setUploading}
            />

            {state.images.length > 0 && (
              <>
                <section className="pool-section">
                  <div className="section-header">
                    <span className="section-title">Image Pool</span>
                    <span className="section-count">{poolImages.length} unassigned</span>
                  </div>
                  <div className="pool-hint">
                    Drag into groups · ✎ edit print layout · ★ set cover · + duplicate
                  </div>
                  <div className="image-pool">
                    {poolImages.length === 0
                      ? <span className="pool-empty">All images assigned to groups</span>
                      : poolImages.map((img) => (
                          <PoolImage key={img.id} image={img} onRemove={() => removeImage(img.id)} />
                        ))}
                  </div>
                  <PoolDropZone isActive={isDragActive && activeDrag?.type === 'group-slot'} />
                </section>

                <section className="groups-section">
                  <div className="groups-header">
                    <span className="section-title">PDF Groups</span>
                    <span className="section-count">{state.groups.length}</span>
                    <button className="btn-add-group" onClick={addGroup}><span>+</span> Add Group</button>
                  </div>
                  {state.groups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      allImages={state.images}
                      onRename={(name) => renameGroup(group.id, name)}
                      onRemoveGroup={() => removeGroup(group.id)}
                      onRemoveSlot={(slotId) => removeSlot(group.id, slotId)}
                      onSetTitlePage={(slotId) => setSlotAsTitlePage(group.id, slotId)}
                      onAddAgain={(imageId) => addSlotToGroup(group.id, imageId)}
                      onEditSlot={(slotId) => openEditor(group.id, slotId)}
                      isDragActive={isDragActive}
                    />
                  ))}
                </section>
              </>
            )}
          </main>

          <Sidebar state={state} />
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeImage && (
            <ImageTile
              image={activeImage}
              isOverlay
              showActions={false}
              style={{ cursor: 'grabbing', transform: 'rotate(2deg)', boxShadow: '0 12px 32px rgba(26,22,18,0.25)' }}
            />
          )}
        </DragOverlay>

        {/* Print Editor Modal */}
        {editingSlot && editingImage && (
          <PrintEditor
            slot={editingSlot.slot}
            image={editingImage}
            groupName={editingGroupName}
            onApply={handlePrintApply}
            onClose={() => setEditingSlot(null)}
          />
        )}

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.kind === 'loading' && <span className="spinner" />}
              {t.kind === 'success' && '✓'}
              {t.kind === 'error' && '✕'}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    </DndContext>
  );
}
