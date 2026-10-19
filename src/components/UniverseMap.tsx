import { useEffect, useMemo, useState } from "react";
import { X, Locate } from "lucide-react";
import { categoryColor, categoryLabel, type Category } from "../data/catalog";
import { useUniverse, getEngine } from "../store";

const LEGEND: Category[] = ["galaxy", "blackhole", "nebula", "system", "star", "cluster", "supernova", "pulsar"];

interface Pt { id: string; name: string; cat: Category; x: number; z: number }

export default function UniverseMap() {
  const open = useUniverse((s) => s.mapOpen);
  const setOpen = useUniverse((s) => s.setMapOpen);
  const selectedId = useUniverse((s) => s.selectedId);
  const [pts, setPts] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);

  useEffect(() => {
    if (open) setPts(getEngine()?.getMapPoints() ?? []);
  }, [open]);

  const { scale, ext } = useMemo(() => {
    let m = 40;
    for (const p of pts) m = Math.max(m, Math.abs(p.x), Math.abs(p.z));
    return { scale: 440 / m, ext: m };
  }, [pts]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm anim-fade-up" style={{ animationDuration: "0.25s" }} onClick={() => setOpen(false)}>
      <div className="glass-strong rounded-2xl w-[min(860px,calc(100vw-32px))] max-h-[86vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div>
            <div className="mono text-[9px] tracking-[0.3em] text-cyan-300/60 mb-1">NAVIGATION · TOP-DOWN PROJECTION</div>
            <h3 className="font-display text-lg font-semibold text-starlight flex items-center gap-2">
              <Locate className="h-4 w-4 text-cyan-300/80" /> Known Universe Map
            </h3>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="glow-line" />
        <div className="relative p-4 overflow-auto cosmos-scroll">
          <svg viewBox="-470 -470 940 940" className="w-full h-auto select-none">
            {/* grid */}
            {[-420, -280, -140, 0, 140, 280, 420].map((v) => (
              <g key={v}>
                <line x1={v} y1={-460} x2={v} y2={460} stroke="rgba(103,232,249,0.06)" strokeWidth="1" />
                <line x1={-460} y1={v} x2={460} y2={v} stroke="rgba(103,232,249,0.06)" strokeWidth="1" />
              </g>
            ))}
            <circle cx="0" cy="0" r={428 * (60 / Math.max(ext, 60))} fill="none" stroke="rgba(167,139,250,0.18)" strokeWidth="1" strokeDasharray="3 6" />
            {/* milky way marker ellipse */}
            <ellipse cx="0" cy="0" rx={34 * scale} ry={10 * scale} fill="rgba(167,139,250,0.05)" stroke="rgba(167,139,250,0.3)" strokeWidth="0.8" />
            <text x="0" y={-34 * scale - 8} textAnchor="middle" fill="rgba(196,181,253,0.7)" fontSize="10" fontFamily="IBM Plex Mono" letterSpacing="2">MILKY WAY</text>

            {pts.map((p) => {
              const c = categoryColor(p.cat);
              const isSel = p.id === selectedId;
              const r = p.cat === "galaxy" ? 5 : 3;
              return (
                <g
                  key={p.id}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { setOpen(false); getEngine()?.travelTo(p.id); }}
                >
                  <circle cx={p.x * scale} cy={p.z * scale} r={isSel ? r + 5 : r + 8} fill="transparent" />
                  {isSel && <circle cx={p.x * scale} cy={p.z * scale} r={r + 5} fill="none" stroke={c} strokeWidth="1" opacity="0.8" />}
                  <circle cx={p.x * scale} cy={p.z * scale} r={isSel ? r + 1.5 : r} fill={c} opacity={p.cat === "galaxy" ? 0.95 : 0.85} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
                  {["galaxy", "blackhole", "system", "star"].includes(p.cat) && (
                    <text x={p.x * scale + 8} y={p.z * scale + 3} fill="rgba(226,240,255,0.65)" fontSize="8.5" fontFamily="IBM Plex Mono">{p.name}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-1.5 pointer-events-none">
              <span className="mono text-[10px] text-starlight">{hover.name}</span>
              <span className="mono text-[9px] text-slate-400 ml-2">{categoryLabel(hover.cat)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-3.5 border-t border-white/[0.06] shrink-0">
          {LEGEND.map((c) => (
            <span key={c} className="flex items-center gap-1.5 mono text-[9px] tracking-wider text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(c), boxShadow: `0 0 6px ${categoryColor(c)}` }} />
              {categoryLabel(c).toUpperCase()}
            </span>
          ))}
          <span className="ml-auto mono text-[9px] text-slate-500">CLICK ANY NODE TO TRAVEL</span>
        </div>
      </div>
    </div>
  );
}
