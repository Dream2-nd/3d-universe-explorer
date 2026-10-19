import { useEffect, useRef } from "react";
import { UniverseEngine } from "./engine/UniverseEngine";
import { useUniverse, setEngine } from "./store";
import IntroOverlay from "./components/IntroOverlay";
import TopBar from "./components/TopBar";
import InfoPanel from "./components/InfoPanel";
import CatalogPanel from "./components/CatalogPanel";
import TourOverlay from "./components/TourOverlay";
import UniverseMap from "./components/UniverseMap";
import { CompassWidget, ScalePill, TravelToast, HoverTooltip, ControlCluster } from "./components/HUD";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const entered = useUniverse((s) => s.entered);
  const catalogOpen = useUniverse((s) => s.catalogOpen);
  const tourOn = useUniverse((s) => s.tour.active);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const u = useUniverse;
    const engine = new UniverseEngine(canvasRef.current, containerRef.current, {
      onSelect: (id) => { if (id) u.getState().setSelected(id); else u.getState().setSelected(null); },
      onHover: (id, x, y) => u.getState().setHover(id, x, y),
      onScale: (tier, dist) => u.getState().setScale(tier, dist),
      onTour: (t) => u.getState().setTour(t),
      onTravelLabel: (s) => u.getState().setTravelLabel(s),
      onExtraCatalog: (items) => u.getState().setSearchExtra(items),
      onReady: () => u.getState().setEngineReady(true),
      onMode: (fly) => u.getState().setNavMode(fly ? "fly" : "orbit"),
    });
    setEngine(engine);
    useUniverse.getState().setFx(engine.isFxEnabled());
    return () => {
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full" style={{ cursor: "grab", touchAction: "none" }} />
      </div>

      {entered && (
        <>
          <TopBar />
          <TravelToast />
          <HoverTooltip />
          <CatalogPanel />
          <InfoPanel />
          <TourOverlay />
          <UniverseMap />

          {/* bottom-left compass */}
          <div
            className="absolute left-4 bottom-4 z-40 hidden sm:block transition-transform duration-500 ease-out"
            style={{ transform: catalogOpen ? "translateX(min(308px, 100vw - 36px))" : "none" }}
          >
            <CompassWidget />
          </div>

          {/* bottom-center scale */}
          <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-40 hidden md:block transition-opacity duration-500 ${tourOn ? "opacity-0" : "opacity-100"}`}>
            <ScalePill />
          </div>

          {/* bottom-right controls */}
          <div className="absolute right-4 bottom-4 z-40">
            <ControlCluster />
          </div>

          {/* corner frame marks */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none hidden lg:block">
            <div className="mono text-[8.5px] tracking-[0.4em] text-slate-500/70">LOCAL GROUP · COMPRESSED VISUAL SCALE · LIVE</div>
          </div>
        </>
      )}

      <div className="vignette" />
      <div className="grain" />
      {!entered && <IntroOverlay />}
    </div>
  );
}
