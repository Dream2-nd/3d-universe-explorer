import { useEffect, useMemo, useRef, useState } from "react";
import { Search, LayoutList, X, Orbit } from "lucide-react";
import { CATALOG, CATALOG_BY_ID, searchCatalog, categoryColor, type CatalogEntry } from "../data/catalog";
import { useUniverse, getEngine } from "../store";

export function useEntryLookup() {
  const extra = useUniverse((s) => s.searchExtra);
  return useMemo(() => {
    const map: Record<string, CatalogEntry> = { ...CATALOG_BY_ID };
    for (const e of extra) map[e.id] = e;
    return map;
  }, [extra]);
}

export default function TopBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const extra = useUniverse((s) => s.searchExtra);
  const catalogOpen = useUniverse((s) => s.catalogOpen);
  const setCatalogOpen = useUniverse((s) => s.setCatalogOpen);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchCatalog(query, extra, 10), [query, extra]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (entry: CatalogEntry | undefined) => {
    if (!entry) return;
    getEngine()?.travelTo(entry.id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-40 px-4 pt-4 pb-2 flex items-start gap-3 pointer-events-none">
      {/* brand */}
      <div className="pointer-events-auto flex items-center gap-3">
        <button className="hud-btn" onClick={() => setCatalogOpen(!catalogOpen)} title="Object catalog">
          <LayoutList className="h-[18px] w-[18px]" />
        </button>
        <div className="hidden sm:block select-none">
          <div className="font-display font-bold tracking-[0.3em] text-[15px] text-starlight leading-none">
            COSMOS
          </div>
          <div className="mono text-[8.5px] tracking-[0.28em] text-cyan-300/60 mt-1">UNIVERSE EXPLORER</div>
        </div>
      </div>

      <div className="flex-1" />

      {/* search */}
      <div ref={wrapRef} className="pointer-events-auto relative w-full max-w-[340px]">
        <div className={`glass rounded-xl flex items-center gap-2 px-3 transition-all ${open && results.length ? "border-cyan-300/40" : ""}`}>
          <Search className="h-4 w-4 text-cyan-300/60 shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setSel(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") go(results[sel]);
              else if (e.key === "Escape") { setOpen(false); setQuery(""); }
            }}
            placeholder="Search planets, galaxies, black holes…"
            className="w-full bg-transparent py-2.5 text-[13px] placeholder:text-slate-500 focus:outline-none text-starlight"
          />
          {query && (
            <button onClick={() => { setQuery(""); setOpen(false); }} className="text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && results.length > 0 && (
          <div className="absolute top-full mt-2 left-0 right-0 glass-strong rounded-xl overflow-hidden anim-fade-up" style={{ animationDuration: "0.2s" }}>
            {results.map((r, i) => (
              <button
                key={r.id}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${i === sel ? "bg-cyan-400/10" : ""}`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: categoryColor(r.category), boxShadow: `0 0 8px ${categoryColor(r.category)}` }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-starlight truncate">{r.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{r.type}</span>
                </span>
                {r.fictional && <span className="mono text-[9px] text-amber-300/90 border border-amber-300/30 rounded px-1.5 py-0.5 shrink-0">SIM</span>}
              </button>
            ))}
            <div className="glow-line" />
            <div className="mono px-3.5 py-2 text-[9px] tracking-[0.18em] text-slate-500">
              {CATALOG.length + extra.length} OBJECTS INDEXED · ENTER TO NAVIGATE
            </div>
          </div>
        )}
      </div>

      <button
        className="hud-btn pointer-events-auto hidden md:flex"
        onClick={() => getEngine()?.travelTo("milky-way")}
        title="Milky Way overview"
      >
        <Orbit className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
