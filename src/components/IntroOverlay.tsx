import { useMemo, useState } from "react";
import { Telescope, Rocket, MousePointer2, Move, ZoomIn, LoaderCircle } from "lucide-react";
import { useUniverse, getEngine } from "../store";

const TIPS = [
  { icon: MousePointer2, text: "Click any object to inspect & fly there" },
  { icon: Move, text: "Drag to orbit · right-drag to pan · pinch/scroll to zoom" },
  { icon: ZoomIn, text: "Zoom from galaxies down to a planet's surface" },
  { icon: Telescope, text: "Search 100+ cataloged & simulated objects" },
];

export default function IntroOverlay() {
  const setEntered = useUniverse((s) => s.setEntered);
  const engineReady = useUniverse((s) => s.engineReady);
  const [leaving, setLeaving] = useState(false);
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 2 + 0.6,
        d: Math.random() * 6,
      })),
    []
  );

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    const engine = getEngine();
    engine?.startAudio();
    setTimeout(() => {
      setEntered(true);
      engine?.home();
    }, 700);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden transition-opacity duration-700 ${leaving ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      style={{ background: "radial-gradient(ellipse at 50% 120%, #0b1c33 0%, #050b18 45%, #020409 100%)" }}
    >
      {/* twinkling star backdrop */}
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s,
            animation: `twinkle ${3 + s.d}s ease-in-out ${s.d}s infinite`,
            opacity: 0.4,
          }}
        />
      ))}
      {/* orbit rings décor */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.13]">
        {[260, 420, 610].map((r) => (
          <div key={r} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40"
            style={{ width: r * 2, height: r * 2, animation: `orbit-ring ${r / 6}s linear infinite` }}>
            <span className="absolute -top-1 left-1/2 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />
          </div>
        ))}
      </div>

      <div className="relative max-w-3xl mx-6 text-center" style={{ animation: "float-slow 9s ease-in-out infinite" }}>
        <div className="mono text-[11px] tracking-[0.5em] text-cyan-300/70 mb-5 anim-fade-up">INTERACTIVE 3D UNIVERSE EXPLORER</div>
        <h1 className="title-shimmer font-display text-7xl md:text-8xl font-bold tracking-[0.08em] leading-none anim-fade-up" style={{ animationDelay: "0.1s" }}>
          COSMOS
        </h1>
        <p className="mt-6 text-slate-300/85 text-base md:text-lg font-light max-w-xl mx-auto leading-relaxed anim-fade-up" style={{ animationDelay: "0.2s" }}>
          Fly through <span className="text-cyan-300">100+ procedurally generated galaxies</span>, orbit Saturn, stand
          at the edge of a black hole, and ride a comet — from your browser.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-9 mb-9 anim-fade-up" style={{ animationDelay: "0.3s" }}>
          {TIPS.map((t, i) => (
            <div key={i} className="glass rounded-xl px-3 py-3 text-left">
              <t.icon className="h-4 w-4 text-cyan-300/80 mb-1.5" />
              <div className="text-[10.5px] leading-snug text-slate-300/80">{t.text}</div>
            </div>
          ))}
        </div>

        <button
          onClick={enter}
          disabled={!engineReady}
          className="group relative inline-flex items-center gap-3 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-10 py-4 text-sm font-medium tracking-[0.25em] text-cyan-100 transition-all duration-300 hover:bg-cyan-300/20 hover:border-cyan-200/80 hover:shadow-[0_0_50px_rgba(34,211,238,0.35)] hover:tracking-[0.32em] anim-fade-up disabled:opacity-60 disabled:hover:tracking-[0.25em] disabled:cursor-wait"
          style={{ animationDelay: "0.4s" }}
        >
          {leaving || !engineReady ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
          {engineReady ? "ENTER THE UNIVERSE" : "IGNITING PROCEDURAL ENGINES…"}
        </button>

        <div className="mono mt-8 text-[10px] tracking-[0.2em] text-slate-500 anim-fade-up" style={{ animationDelay: "0.5s" }}>
          REAL ASTRONOMICAL DATA · SIMULATED OBJECTS CLEARLY LABELED · VISUAL SCALE COMPRESSED
        </div>
      </div>
    </div>
  );
}
