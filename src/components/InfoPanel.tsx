import { useEffect, useState, useRef } from "react";
import { X, Sparkles, Ruler, Weight, Clock, Thermometer, FlaskConical, RotateCw, RefreshCcw, MapPin, BadgeCheck, Navigation, ExternalLink } from "lucide-react";
import { CATALOG_BY_ID, categoryColor, categoryLabel, type CatalogEntry } from "../data/catalog";
import { useUniverse, getEngine } from "../store";
import { useEntryLookup } from "./TopBar";

const Row = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string }) =>
  value ? (
    <div className="flex gap-3 py-2 border-b border-white/[0.05] last:border-0">
      <Icon className="h-3.5 w-3.5 text-cyan-300/50 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">{label}</div>
        <div className="mono text-[11.5px] text-slate-200 mt-0.5 leading-relaxed">{value}</div>
      </div>
    </div>
  ) : null;

export default function InfoPanel() {
  const selectedId = useUniverse((s) => s.selectedId);
  const setSelected = useUniverse((s) => s.setSelected);
  const extra = useUniverse((s) => s.searchExtra);
  const lookup = useEntryLookup();
  const [liveDist, setLiveDist] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const entry: CatalogEntry | undefined = selectedId ? lookup[selectedId] : undefined;

  useEffect(() => {
    setLiveDist(null);
    if (!selectedId) return;
    const iv = setInterval(() => setLiveDist(getEngine()?.getSelectedDistance() ?? null), 400);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  if (!selectedId || !entry) return null;

  const color = categoryColor(entry.category);
  const parent = entry.parent ? CATALOG_BY_ID[entry.parent] : undefined;
  void extra;

  return (
    <div className="absolute right-3 top-[70px] bottom-3 z-40 w-[min(380px,calc(100vw-24px))] pointer-events-none flex">
      <div key={selectedId} className="glass-strong rounded-2xl w-full flex flex-col pointer-events-auto anim-slide-right overflow-hidden">
        {/* header */}
        <div className="relative px-5 pt-5 pb-4 shrink-0" style={{ background: `linear-gradient(160deg, ${color}14, transparent 60%)` }}>
          <button
            onClick={() => setSelected(null)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="mono text-[9px] tracking-[0.24em] px-2 py-1 rounded-full border" style={{ color, borderColor: `${color}55`, background: `${color}11` }}>
              {categoryLabel(entry.category).toUpperCase()}
            </span>
            {entry.fictional && (
              <span className="mono text-[9px] tracking-[0.24em] px-2 py-1 rounded-full border border-amber-300/50 text-amber-300 bg-amber-300/10 animate-pulse">
                SIMULATED
              </span>
            )}
          </div>
          <h2 className="font-display text-[26px] font-semibold text-starlight leading-tight pr-8">{entry.name}</h2>
          <div className="mono text-[10.5px] text-slate-400 mt-1 tracking-wide">{entry.type}</div>
          {parent && (
            <button
              onClick={() => getEngine()?.travelTo(parent.id)}
              className="mt-2 inline-flex items-center gap-1 mono text-[10px] text-cyan-300/80 hover:text-cyan-200 transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> orbits {parent.name}
            </button>
          )}
        </div>
        <div className="glow-line shrink-0" />

        <div ref={panelRef} className="flex-1 overflow-y-auto cosmos-scroll px-5 py-4">
          <p className="text-[13px] leading-relaxed text-slate-300/90 font-light">{entry.description}</p>

          <div className="mt-4">
            <div className="mono text-[9.5px] tracking-[0.3em] text-cyan-300/60 mb-1 flex items-center gap-2">
              <BadgeCheck className="h-3 w-3" /> OBSERVATIONAL DATA {entry.fictional && "— INVENTED"}
            </div>
            {entry.distance && <Row icon={MapPin} label="Distance from Earth" value={entry.distance} />}
            {liveDist && <Row icon={Navigation} label="Your camera distance now" value={`${liveDist} (live)`} />}
            <Row icon={Ruler} label="Diameter / Size" value={entry.diameter} />
            <Row icon={Weight} label="Mass" value={entry.mass} />
            <Row icon={Clock} label="Estimated Age" value={entry.age} />
            <Row icon={Thermometer} label="Temperature" value={entry.temp} />
            <Row icon={FlaskConical} label="Composition" value={entry.composition} />
            <Row icon={RotateCw} label="Orbital Period" value={entry.period} />
            <Row icon={RefreshCcw} label="Rotation" value={entry.rotation} />
          </div>

          {entry.discovered && (
            <div className="mt-5">
              <div className="mono text-[9.5px] tracking-[0.3em] text-cyan-300/60 mb-2">DISCOVERY</div>
              <p className="text-[12px] leading-relaxed text-slate-400">{entry.discovered}</p>
            </div>
          )}

          <div className="mt-5 pb-2">
            <div className="mono text-[9.5px] tracking-[0.3em] text-cyan-300/60 mb-2.5 flex items-center gap-2">
              <Sparkles className="h-3 w-3" /> {entry.fictional ? "NOTES" : "SCIENTIFIC FACTS"}
            </div>
            <ul className="space-y-2.5">
              {entry.facts.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-slate-300/85">
                  <span className="mono text-cyan-300/60 mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-4 shrink-0 border-t border-white/[0.06]">
          <button
            onClick={() => getEngine()?.travelTo(entry.id, false)}
            className="w-full rounded-xl border border-cyan-300/30 bg-cyan-400/10 py-2.5 text-[12px] font-medium tracking-[0.18em] text-cyan-100 hover:bg-cyan-300/20 hover:border-cyan-200/60 transition-all"
          >
            FLY TO {entry.name.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
