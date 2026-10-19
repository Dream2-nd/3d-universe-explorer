import { create } from "zustand";
import type { CatalogEntry } from "./data/catalog";

export type NavMode = "orbit" | "fly";

interface TourState {
  active: boolean;
  index: number;
  total: number;
  caption: string;
  name: string;
}

interface UniverseState {
  entered: boolean;
  engineReady: boolean;
  selectedId: string | null;
  hoverId: string | null;
  hoverPos: { x: number; y: number } | null;
  catalogOpen: boolean;
  mapOpen: boolean;
  navMode: NavMode;
  tour: TourState;
  muted: boolean;
  fx: boolean;
  scaleTier: string;
  scaleDist: string;
  searchExtra: CatalogEntry[];
  travelLabel: string | null;

  setEntered: (v: boolean) => void;
  setEngineReady: (v: boolean) => void;
  setSelected: (id: string | null) => void;
  setHover: (id: string | null, x?: number, y?: number) => void;
  setCatalogOpen: (v: boolean) => void;
  setMapOpen: (v: boolean) => void;
  setNavMode: (m: NavMode) => void;
  setTour: (t: Partial<TourState>) => void;
  setMuted: (m: boolean) => void;
  setFx: (f: boolean) => void;
  setScale: (tier: string, dist: string) => void;
  setSearchExtra: (items: CatalogEntry[]) => void;
  setTravelLabel: (s: string | null) => void;
}

export const useUniverse = create<UniverseState>((set) => ({
  entered: false,
  engineReady: false,
  selectedId: null,
  hoverId: null,
  hoverPos: null,
  catalogOpen: false,
  mapOpen: false,
  navMode: "orbit",
  tour: { active: false, index: 0, total: 0, caption: "", name: "" },
  muted: false,
  fx: true,
  scaleTier: "DEEP SPACE",
  scaleDist: "—",
  searchExtra: [],
  travelLabel: null,

  setEntered: (entered) => set({ entered }),
  setEngineReady: (engineReady) => set({ engineReady }),
  setSelected: (selectedId) => set({ selectedId }),
  setHover: (hoverId, x, y) =>
    set({ hoverId, hoverPos: hoverId && x !== undefined && y !== undefined ? { x, y } : null }),
  setCatalogOpen: (catalogOpen) => set({ catalogOpen }),
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setNavMode: (navMode) => set({ navMode }),
  setTour: (t) => set((s) => ({ tour: { ...s.tour, ...t } })),
  setMuted: (muted) => set({ muted }),
  setFx: (fx) => set({ fx }),
  setScale: (scaleTier, scaleDist) => set({ scaleTier, scaleDist }),
  setSearchExtra: (searchExtra) => set({ searchExtra }),
  setTravelLabel: (travelLabel) => set({ travelLabel }),
}));

// Engine singleton handle (set by App once engine is constructed)
import type { UniverseEngine } from "./engine/UniverseEngine";
let engineInstance: UniverseEngine | null = null;
export const setEngine = (e: UniverseEngine | null) => { engineInstance = e; };
export const getEngine = () => engineInstance;
