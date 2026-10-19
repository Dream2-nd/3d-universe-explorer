import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Home, Volume2, VolumeX, Sparkles, Play, Navigation, Orbit, Map as MapIcon, Maximize, Minimize } from "lucide-react";
import { useUniverse, getEngine } from "../store";
import { categoryColor, categoryLabel } from "../data/catalog";
import { useEntryLookup } from "./TopBar";

// ------------------------------------------------ compass (bearing dial)
export function CompassWidget() {
  const needleRef = useRef<HTMLDivElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = getEngine()?.getBearing() ?? 0;
      if (needleRef.current) needleRef.current.style.transform = `rotate(${-b}deg)`;
      if (degRef.current) degRef.current.textContent = `${String(Math.round(b)).padStart(3, "0")}°`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1.5 select-none pointer-events-auto">
      <div className="relative h-16 w-16">
        <div ref={needleRef} className="absolute inset-0 will-change-transform">
          {["N", "E", "S", "W"].map((d, i) => (
            <span
              key={d}
              className="absolute left-1/2 top-1/2 mono text-[9px]"
              style={{
                color: d === "N" ? "#fca5a5" : "#94a3b8",
                transform: `rotate(${i * 90}deg) translateY(-27px) translate(-50%, -50%)`,
                transformOrigin: "0 0",
                fontWeight: d === "N" ? 700 : 400,
              }}
            >
              {d}
            </span>
          ))}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[14px] border-l-transparent border-r-transparent border-b-cyan-300 drop-shadow-[0_0_6px_rgba(103,232,249,0.8)] -translate-y-[9px]" />
          </div>
        </div>
        <div className="absolute inset-0 rounded-full border border-cyan-300/20" />
        <div className="absolute inset-[7px] rounded-full border border-cyan-300/10" />
      </div>
      <span ref={degRef} className="mono text-[9px] tracking-widest text-cyan-300/70">000°</span>
    </div>
  );
}

// ------------------------------------------------ scale pill
export function ScalePill() {
  const tier = useUniverse((s) => s.scaleTier);
  const dist = useUniverse((s) => s.scaleDist);
  return (
    <div className="glass rounded-full px-4 py-2 flex items-center gap-3 pointer-events-auto">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
      <span className="mono text-[9.5px] tracking-[0.24em] text-cyan-200/80">{tier}</span>
      <span className="mono text-[10px] text-slate-300">{dist}</span>
    </div>
  );
}

// ------------------------------------------------ travel toast
export function TravelToast() {
  const label = useUniverse((s) => s.travelLabel);
  if (!label) return null;
  return (
    <div className="absolute top-[70px] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="glass rounded-full px-5 py-2 flex items-center gap-3 anim-fade-up">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300" />
        </span>
        <span className="mono text-[10px] tracking-[0.22em] text-cyan-100">{label?.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------ hover tooltip
export function HoverTooltip() {
  const hoverId = useUniverse((s) => s.hoverId);
  const hoverPos = useUniverse((s) => s.hoverPos);
  const lookup = useEntryLookup();
  if (!hoverId || !hoverPos) return null;
  const entry = lookup[hoverId];
  if (!entry) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: hoverPos.x + 16, top: hoverPos.y + 14 }}
    >
      <div className="glass rounded-lg px-3 py-2 reticle relative">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: categoryColor(entry.category) }} />
          <span className="text-[12px] font-medium text-starlight">{entry.name}</span>
        </div>
        <div className="mono text-[9px] text-slate-400 mt-0.5">{categoryLabel(entry.category)} · click to inspect</div>
      </div>
    </div>
  );
}

// ------------------------------------------------ main controls cluster
export function ControlCluster() {
  const muted = useUniverse((s) => s.muted);
  const setMuted = useUniverse((s) => s.setMuted);
  const fx = useUniverse((s) => s.fx);
  const setFx = useUniverse((s) => s.setFx);
  const navMode = useUniverse((s) => s.navMode);
  const setNavMode = useUniverse((s) => s.setNavMode);
  const mapOpen = useUniverse((s) => s.mapOpen);
  const setMapOpen = useUniverse((s) => s.setMapOpen);
  const tourActive = useUniverse((s) => s.tour.active);
  const selectedId = useUniverse((s) => s.selectedId);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFly = () => {
    const next = navMode === "fly" ? "orbit" : "fly";
    setNavMode(next);
    getEngine()?.setFly(next === "fly");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "f") toggleFly();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    getEngine()?.setMuted(m);
  };

  return (
    <div
      className="flex flex-col items-end gap-2 pointer-events-auto transition-transform duration-500 ease-out"
      style={{
        transform: `translate(${selectedId ? "calc(-1 * min(402px, 100vw - 18px))" : "0"}, ${tourActive ? "-190px" : "0"})`,
      }}
    >
      {navMode === "fly" && (
        <div className="glass rounded-xl px-3.5 py-2.5 mb-1 anim-fade-up">
          <div className="mono text-[9px] tracking-[0.2em] text-cyan-300/80 mb-1">FLIGHT MODE</div>
          <div className="text-[10px] text-slate-400 leading-relaxed">Drag to look · <span className="text-slate-200">WASD</span> move · <span className="text-slate-200">Q/E</span> down/up · scroll = speed</div>
        </div>
      )}
      <div className="flex gap-2">
        <button className="hud-btn" onClick={() => getEngine()?.zoomBy(0.72)} title="Zoom in"><ZoomIn className="h-[17px] w-[17px]" /></button>
        <button className="hud-btn" onClick={() => getEngine()?.zoomBy(1.38)} title="Zoom out"><ZoomOut className="h-[17px] w-[17px]" /></button>
        <button className="hud-btn" onClick={() => getEngine()?.home()} title="Home view"><Home className="h-[17px] w-[17px]" /></button>
      </div>
      <div className="flex gap-2">
        <button className={`hud-btn ${mapOpen ? "active" : ""}`} onClick={() => setMapOpen(!mapOpen)} title="Universe map"><MapIcon className="h-[17px] w-[17px]" /></button>
        <button className={`hud-btn ${navMode === "fly" ? "active" : ""}`} onClick={toggleFly} title={navMode === "fly" ? "Switch to orbit mode" : "Free-flight mode (WASD)"}>
          {navMode === "fly" ? <Navigation className="h-[17px] w-[17px]" /> : <Orbit className="h-[17px] w-[17px]" />}
        </button>
        <button className={`hud-btn ${tourActive ? "active" : ""}`} onClick={() => { const e = getEngine(); if (!e) return; tourActive ? e.endTour() : e.startTour(); }} title="Guided tour"><Play className="h-[17px] w-[17px]" /></button>
      </div>
      <div className="flex gap-2">
        <button className={`hud-btn ${fx ? "active" : ""}`} onClick={() => { const e = getEngine(); e?.setFx(!fx); setFx(e?.isFxEnabled() ?? false); }} title="Toggle bloom effects"><Sparkles className="h-[17px] w-[17px]" /></button>
        <button className={`hud-btn ${!muted ? "active" : ""}`} onClick={toggleMute} title="Ambient sound">{muted ? <VolumeX className="h-[17px] w-[17px]" /> : <Volume2 className="h-[17px] w-[17px]" />}</button>
        <button className="hud-btn" onClick={() => { fs ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }} title="Fullscreen">
          {fs ? <Minimize className="h-[17px] w-[17px]" /> : <Maximize className="h-[17px] w-[17px]" />}
        </button>
      </div>
    </div>
  );
}
