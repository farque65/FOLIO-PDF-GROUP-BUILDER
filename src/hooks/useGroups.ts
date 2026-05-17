import { useState, useCallback } from 'react';
import { uuidv4 } from '../utils/uuidShim';
import { AppState, ImageGroup, GroupSlot, UploadedImage, SlotPrintSettings } from '../types';
import { generateGroupName } from '../utils/format';
import { arrayMove } from '@dnd-kit/sortable';

function makeGroup(index: number): ImageGroup {
  return { id: uuidv4(), name: generateGroupName(index), slots: [] };
}
function makeSlot(imageId: string): GroupSlot {
  return { slotId: uuidv4(), imageId };
}

export function useGroups() {
  const [state, setState] = useState<AppState>({
    images: [],
    groups: [makeGroup(0)],
  });

  const addImages = useCallback((incoming: UploadedImage[]) => {
    setState((s) => ({ ...s, images: [...s.images, ...incoming] }));
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setState((s) => {
      // Clean up the object URL to free browser memory
      const img = s.images.find((i) => i.id === imageId);
      if (img) URL.revokeObjectURL(img.previewUrl);

      return {
        images: s.images.filter((i) => i.id !== imageId),
        groups: s.groups.map((g) => ({
          ...g,
          slots: g.slots.filter((sl) => sl.imageId !== imageId),
        })),
      };
    });
  }, []);

  const addGroup = useCallback(() => {
    setState((s) => ({ ...s, groups: [...s.groups, makeGroup(s.groups.length)] }));
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    setState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== groupId) }));
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
  }, []);

  const addSlotToGroup = useCallback((groupId: string, imageId: string, atIndex?: number) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        const slot = makeSlot(imageId);
        if (atIndex !== undefined) {
          const slots = [...g.slots];
          slots.splice(atIndex, 0, slot);
          return { ...g, slots };
        }
        return { ...g, slots: [...g.slots, slot] };
      }),
    }));
  }, []);

  const removeSlot = useCallback((groupId: string, slotId: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, slots: g.slots.filter((sl) => sl.slotId !== slotId) }
          : g
      ),
    }));
  }, []);

  const reorderSlots = useCallback((groupId: string, fromIndex: number, toIndex: number) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, slots: arrayMove(g.slots, fromIndex, toIndex) } : g
      ),
    }));
  }, []);

  const moveSlotToGroup = useCallback(
    (fromGroupId: string, slotId: string, toGroupId: string, atIndex?: number) => {
      setState((s) => {
        const slot = s.groups.find((g) => g.id === fromGroupId)?.slots.find((sl) => sl.slotId === slotId);
        if (!slot) return s;
        return {
          ...s,
          groups: s.groups.map((g) => {
            if (g.id === fromGroupId) return { ...g, slots: g.slots.filter((sl) => sl.slotId !== slotId) };
            if (g.id === toGroupId) {
              const slots = [...g.slots];
              slots.splice(atIndex ?? slots.length, 0, slot);
              return { ...g, slots };
            }
            return g;
          }),
        };
      });
    },
    []
  );

  const setSlotAsTitlePage = useCallback((groupId: string, slotId: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => {
        if (g.id !== groupId) return g;
        const idx = g.slots.findIndex((sl) => sl.slotId === slotId);
        return idx <= 0 ? g : { ...g, slots: arrayMove(g.slots, idx, 0) };
      }),
    }));
  }, []);

  const updateSlotPrintSettings = useCallback(
    (groupId: string, slotId: string, settings: SlotPrintSettings | undefined) => {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) =>
          g.id === groupId
            ? {
                ...g,
                slots: g.slots.map((sl) =>
                  sl.slotId === slotId ? { ...sl, printSettings: settings } : sl
                ),
              }
            : g
        ),
      }));
    },
    []
  );

  return {
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
  };
}
