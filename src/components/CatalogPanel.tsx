import { useMemo, useState } from "react";
import { X, ChevronDown, Telescope, Globe, Sun, Moon, CircleDot, Zap, Circle, Aperture, Cloud, Radio, Flame, Star, Satellite, Orbit } from "lucide-react";
import { CATALOG, categoryColor, type CatalogEntry, type Category } from "../data/catalog";
import { useUniverse, getEngine } from "../store";

const CAT_ICON: Record<Category, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  galaxy: Orbit, star: Sun, planet: Globe, moon: Moon, dwarf: CircleDot, comet: Zap, belt: Circle,
  blackhole: Aperture, nebula: Cloud, pulsar: Radio, supernova: Flame, cluster: Star, system: Satellite,
};

const GROUPS: { title: string; cats: Category[] }[] = [
  { title: "Galaxies", cats: ["galaxy"] },
  { title: "Black Holes & Stellar Extremes", cats: ["blackhole", "pulsar", "supernova"] },
  { title: "Nebulae & Clusters", cats: ["nebula", "cluster"] },
  { title: "Solar System", cats: ["star", "planet", "moon", "dwarf", "comet", "belt"] },
  { title: "Exoplanet Systems", cats: ["system"] },
];

function belongs(e: CatalogEntry, cats: Category[]) {
  if (cats.includes(e.category)) {
    // keep the Solar System group pure-solar: exclude exoplanets & simulated worlds
    if (cats.includes("planet") && cats.includes("moon")) {
      if (e.id === "meteors") return true;
      return !e.fictional && !e.distance?.includes("ly");
    }
    return true;
  }
  return false;
}

export default function CatalogPanel() {
  const open = useUniverse((s) => s.catalogOpen);
  const setOpen = useUniverse((s) => s.setCatalogOpen);
  const extra = useUniverse((s) => s.searchExtra);
  const selectedId = useUniverse((s) => s.selectedId);
  const [expanded, setExpanded] = useState<string | null>("Solar System");

  const groups = useMemo(() => {
    return GROUPS.map((g) => {
      let items = CATALOG.filter((e) => belongs(e, g.cats));
      if (g.title === "Galaxies") items = [...items, ...extra];
      return { title: g.title, items };
    }).filter((g) => g.items.length > 0);
  }, [extra]);

  if (!open) return null;

  return (
    <div className="absolute left-3 top-[70px] bottom-3 z-40 w-[min(300px,calc(100vw-24px))] pointer-events-auto anim-slide-left">
      <div className="glass-strong rounded-2xl h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <Telescope className="h-4 w-4 text-cyan-300/70" />
            <span className="mono text-[10.5px] tracking-[0.28em] text-starlight">CATALOG</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="glow-line shrink-0" />
        <div className="flex-1 overflow-y-auto cosmos-scroll py-1">
          {groups.map((g) => {
            const isOpen = expanded === g.title;
            return (
              <div key={g.title} className="border-b border-white/[0.04] last:border-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : g.title)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="mono text-[10px] tracking-[0.24em] text-cyan-200/80">{g.title.toUpperCase()}</span>
                  <span className="flex items-center gap-2">
                    <span className="mono text-[9px] text-slate-500">{g.items.length}</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {g.items.map((e) => {
                      const Icon = CAT_ICON[e.category];
                      const activeObj = selectedId === e.id;
                      return (
                        <button
                          key={e.id}
                          onClick={() => { getEngine()?.travelTo(e.id); }}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${activeObj ? "bg-cyan-400/10" : "hover:bg-white/[0.04]"}`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: categoryColor(e.category) }} />
                          <span className="flex-1 min-w-0">
                            <span className={`block text-[12px] truncate ${activeObj ? "text-cyan-200" : "text-slate-200"}`}>{e.name}</span>
                            <span className="block text-[9.5px] text-slate-500 truncate">{e.type}</span>
                          </span>
                          {e.fictional && <span className="mono text-[8px] text-amber-300/80 border border-amber-300/30 rounded px-1 py-0.5">SIM</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mono px-4 py-2.5 text-[9px] tracking-[0.15em] text-slate-500 border-t border-white/[0.06] shrink-0">
          {CATALOG.length + extra.length} OBJECTS · SIM = CLEARLY SIMULATED
        </div>
      </div>
    </div>
  );
}
