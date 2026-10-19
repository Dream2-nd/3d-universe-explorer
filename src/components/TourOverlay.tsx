import { useEffect, useState } from "react";
import { SkipBack, SkipForward, X, AudioLines } from "lucide-react";
import { useUniverse, getEngine } from "../store";

export default function TourOverlay() {
  const tour = useUniverse((s) => s.tour);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    setTyped(0);
    if (!tour.active) return;
    const iv = setInterval(() => {
      setTyped((v) => (v >= tour.caption.length ? v : v + 3));
    }, 24);
    return () => clearInterval(iv);
  }, [tour.active, tour.index, tour.caption]);

  if (!tour.active) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(640px,calc(100vw-32px))] pointer-events-auto">
      <div className="glass-strong rounded-2xl px-6 py-5 anim-fade-up relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 glow-line" />
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="mono text-[9px] tracking-[0.34em] text-cyan-300/70 mb-1.5 flex items-center gap-2">
              <AudioLines className="h-3 w-3" /> GUIDED TOUR · STOP {tour.index + 1} / {tour.total}
            </div>
            <h3 className="font-display text-xl font-semibold text-starlight">{tour.name}</h3>
          </div>
          <button onClick={() => getEngine()?.endTour()} className="text-slate-400 hover:text-white transition-colors shrink-0 mt-1" title="End tour (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13.5px] leading-relaxed text-slate-300/90 min-h-[42px] font-light"
          style={{ borderRight: typed < tour.caption.length ? "2px solid rgba(103,232,249,.7)" : "none", paddingRight: 2 }}>
          {tour.caption.slice(0, typed)}
        </p>
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {Array.from({ length: tour.total }, (_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all duration-500"
                style={{
                  width: i === tour.index ? 22 : 8,
                  background: i <= tour.index ? "#67e8f9" : "rgba(148,163,184,0.3)",
                  boxShadow: i === tour.index ? "0 0 8px rgba(103,232,249,.7)" : "none",
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="hud-btn !w-8 !h-8" onClick={() => getEngine()?.tourPrev()} disabled={tour.index === 0} title="Previous">
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button className="hud-btn !w-8 !h-8" onClick={() => getEngine()?.tourNext()} title="Next stop">
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
