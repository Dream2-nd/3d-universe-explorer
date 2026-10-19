import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { buildGalaxy, buildDeepField, buildDustField, makeBackgroundPointsMaterial } from "./galaxy";
import type { GalaxySpec } from "./galaxy";
import { buildSolarSystem, buildStarSystem } from "./planets";
import type { AnchorDef, BuiltPiece } from "./planets";
import { buildBlackHole, buildPulsar, buildSupernova, buildNebula, buildCluster, buildMeteorShower } from "./wonders";
import { AmbientAudio } from "./audio";
import { mulberry32, qualityTier, viewScaleLabel, easeInOutCubic, clamp, formatDistance } from "./utils";
import { getGlowTexture } from "./textures";
import type { CatalogEntry, Category } from "../data/catalog";

export interface EngineCallbacks {
  onSelect: (id: string | null) => void;
  onHover: (id: string | null, x?: number, y?: number) => void;
  onScale: (tier: string, dist: string) => void;
  onTour: (t: { active: boolean; index: number; total: number; caption: string; name: string }) => void;
  onTravelLabel: (s: string | null) => void;
  onExtraCatalog: (items: CatalogEntry[]) => void;
  onReady: () => void;
  onMode: (fly: boolean) => void;
}

interface Anchor {
  def: AnchorDef;
  category: Category;
  name: string;
  hitMesh?: THREE.Object3D;
  labelEl?: HTMLDivElement;
  wp: THREE.Vector3; // cached world position
}

interface TourStep { id: string; caption: string; name: string; }

const TOUR: TourStep[] = [
  { id: "milky-way", name: "The Milky Way", caption: "Our home — a barred spiral of 100–400 billion stars. The thin disk spans 105,000 light-years. Every star you see tonight lives in this whirlpool." },
  { id: "sgr-a", name: "Sagittarius A*", caption: "At the heart of the galaxy lurks a monster — a black hole of 4.3 million solar masses, photographed in 2022 by a telescope the size of Earth." },
  { id: "sun", name: "The Solar System", caption: "One unremarkable G-type star, 27,000 light-years from the center. Around it, eight planets, five dwarfs and uncounted comets ride gravity's rails." },
  { id: "earth", name: "Earth", caption: "The pale blue dot. The only world where the universe is known to have woken up and looked back at itself." },
  { id: "saturn", name: "Saturn", caption: "Rings of ancient water ice, 282,000 km wide and barely ten meters thick — gossamer and immense, the most beautiful geometry in nature." },
  { id: "jupiter", name: "Jupiter", caption: "The heavyweight. Its Great Red Spot storm is wider than Earth and has burned for at least three centuries. Ninety-five moons answer to it." },
  { id: "orion-nebula", name: "Orion Nebula", caption: "A stellar nursery 1,344 light-years away. Right now, ultraviolet light from newborn giants is sculpting this cloud — and igniting roughly 700 infant stars." },
  { id: "cygnus-x1", name: "Cygnus X-1", caption: "The first black hole humanity ever confirmed — 21 solar masses stealing fire from a blue supergiant companion. It spins at 95% of the cosmic speed limit." },
  { id: "omega-centauri", name: "Omega Centauri", caption: "Ten million ancient suns packed into a sphere 150 light-years wide — likely the stripped heart of a galaxy the Milky Way devoured long ago." },
  { id: "andromeda", name: "Andromeda", caption: "A trillion stars, 2.5 million light-years away — and falling toward us at 110 km/s. In 4.5 billion years, this view will fill our sky." },
];

const MW_POS = new THREE.Vector3(0, 0, 0);
export const SUN_POS = new THREE.Vector3(24, 0.35, 10);

export class UniverseEngine {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(999, 999);
  private pointerPixel = { x: 0, y: 0 };
  private anchors = new Map<string, Anchor>();
  private pickables: THREE.Object3D[] = [];
  private updaters: ((dt: number, t: number) => void)[] = [];
  private labelLayer: HTMLDivElement;
  private cb: EngineCallbacks;
  private quality: number;
  private audio = new AmbientAudio();
  private disposed = false;

  // travel state
  private travel: {
    active: boolean; t: number; dur: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3; mid: THREE.Vector3;
    fromTgt: THREE.Vector3; toTgt: THREE.Vector3; id: string | null;
  } | null = null;
  private lockedId: string | null = null;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;

  // tour
  private tour: { active: boolean; index: number; phase: "travel" | "dwell"; dwellT: number } =
    { active: false, index: 0, phase: "travel", dwellT: 0 };

  // fly mode
  private fly = false;
  private flyYaw = 0; private flyPitch = 0;
  private flyVel = new THREE.Vector3();
  private flySpeedMul = 1;
  private keys = new Set<string>();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  private selectionRing: THREE.Group;
  private dustWrap: ((v: THREE.Vector3) => void) | null = null;
  private dustBox = 90;
  private deepField: THREE.Points | null = null;
  private farField: THREE.Points | null = null;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private scaleTimer = 0;
  private hoverTimer = 0;
  private idleT = 0;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.container = container;
    this.cb = cb;
    this.quality = qualityTier();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 0 ? 1.5 : 2));
    this.renderer.setClearColor(0x020409);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.001, 30000);
    this.camera.position.set(0, 420, 1250);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 1.05;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 0.0004;
    this.controls.maxDistance = 9000;
    this.controls.enablePan = true;
    this.controls.target.copy(MW_POS);

    // selection gyroscope
    this.selectionRing = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), ringMat);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), ringMat);
    r2.rotation.x = Math.PI / 2;
    this.selectionRing.add(r1, r2);
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.labelLayer = document.createElement("div");
    Object.assign(this.labelLayer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "20", overflow: "hidden" });
    document.body.appendChild(this.labelLayer);

    this.buildWorld();
    this.initComposer();
    this.bindEvents();
    this.resize();
    this.renderer.setAnimationLoop(this.loop);
  }

  // ------------------------------------------------------------------ world

  private register(id: string, def: AnchorDef, category: Category, name: string, pickScale = 2.2, label = true) {
    const a: Anchor = { def, category, name, wp: new THREE.Vector3() };
    // invisible enlarged hit sphere
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(def.radius * pickScale, def.radius + 0.001), 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.userData.anchorId = id;
    hit.raycast = THREE.Mesh.prototype.raycast;
    def.object.add(hit);
    a.hitMesh = hit;
    this.pickables.push(hit);

    if (label && def.labelMaxDist !== 0) {
      const el = document.createElement("div");
      el.className = "hud-label";
      el.textContent = name;
      el.style.setProperty("--dot", this.catColor(category));
      el.style.opacity = "0";
      el.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); this.onPick(id, ev.clientX, ev.clientY); });
      this.labelLayer.appendChild(el);
      a.labelEl = el;
    }
    this.anchors.set(id, a);
  }

  private catColor(c: Category): string {
    return ({ galaxy: "#a78bfa", star: "#ffd27d", planet: "#7dd3fc", moon: "#cbd5e1", dwarf: "#d8b4fe", comet: "#bae6fd", belt: "#a8a29e", blackhole: "#fb7185", nebula: "#f0abfc", pulsar: "#5eead4", supernova: "#fdba74", cluster: "#fde68a", system: "#93c5fd" } as Record<Category, string>)[c];
  }

  private addPiece(piece: BuiltPiece, cats: Record<string, Category>, names: Record<string, string>) {
    this.scene.add(piece.group);
    this.updaters.push(piece.update);
    for (const def of piece.anchors) {
      if (!def.id) continue;
      const cat = cats[def.id] ?? "planet";
      const name = names[def.id] ?? def.id;
      this.register(def.id, def, cat, name);
    }
  }

  private galaxy(spec: GalaxySpec, count: number, category: Category = "galaxy") {
    const g = buildGalaxy(spec, Math.round(count * (this.quality === 0 ? 0.45 : this.quality === 1 ? 0.8 : 1)));
    this.scene.add(g.group);
    this.updaters.push((_d, t) => g.update(t));
    // center anchor
    const anchorObj = new THREE.Object3D();
    anchorObj.position.copy(spec.position);
    this.scene.add(anchorObj);
    const labelMaxDist = spec.id.startsWith("galgen-") ? spec.radius * 5 : Math.max(spec.radius * 20, 240);
    this.register(spec.id, { object: anchorObj, radius: spec.radius * 0.55, viewDistance: spec.radius * 2.9, labelMaxDist }, category, spec.name, 1.0);
    return g;
  }

  private buildWorld() {
    const q = this.quality;

    // lighting
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.35));
    const hemi = new THREE.HemisphereLight(0x8899ff, 0x0a0a18, 0.25);
    this.scene.add(hemi);

    // deep starfield + distant galaxy shell
    this.deepField = buildDeepField(q === 0 ? 9000 : q === 1 ? 14000 : 20000, 11000, 24601);
    this.scene.add(this.deepField);
    const dfUpdate = (this.deepField.userData as { update?: (t: number) => void }).update;
    if (dfUpdate) this.updaters.push((_d, t) => dfUpdate(t));
    this.farField = this.buildFarGalaxies(q === 0 ? 1600 : 3000);
    this.scene.add(this.farField);

    const dust = buildDustField(q === 0 ? 700 : 1500, this.dustBox);
    this.scene.add(dust.points);
    this.dustWrap = dust.wrap;

    // ---------------- famous galaxies
    const starMul = q === 0 ? 0.5 : 1;
    this.galaxy({ id: "milky-way", name: "Milky Way", type: "spiral", radius: 34, position: MW_POS, seed: 1, arms: 4, spin: 3.6, thickness: 2.4, bar: true,
      colorCore: new THREE.Color("#ffe9c4"), colorMid: new THREE.Color("#f2b46e"), colorEdge: new THREE.Color("#7aa8ff") }, 26000 * starMul);

    this.galaxy({ id: "andromeda", name: "Andromeda (M31)", type: "spiral", radius: 46, position: new THREE.Vector3(240, 70, -190), seed: 2, arms: 2, spin: 2.6, tiltX: 1.05, tiltZ: 0.2, thickness: 3.4, bar: true,
      colorCore: new THREE.Color("#fff0d8"), colorMid: new THREE.Color("#e8c48e"), colorEdge: new THREE.Color("#8fb8ff") }, 17000 * starMul);

    this.galaxy({ id: "triangulum", name: "Triangulum (M33)", type: "spiral", radius: 22, position: new THREE.Vector3(-260, -50, -150), seed: 3, arms: 3, spin: 3.2, tiltX: 0.35, colorEdge: new THREE.Color("#9db8ff") }, 7000 * starMul);
    this.galaxy({ id: "whirlpool", name: "Whirlpool (M51)", type: "spiral", radius: 26, position: new THREE.Vector3(360, -110, 150), seed: 4, arms: 2, spin: 4.2, tiltX: 0.9, colorMid: new THREE.Color("#e8a87c") }, 8000 * starMul);
    this.galaxy({ id: "sombrero", name: "Sombrero (M104)", type: "spiral", radius: 30, position: new THREE.Vector3(-390, 60, 210), seed: 5, arms: 1, spin: 0.4, tiltX: 1.52, thickness: 1.6, colorMid: new THREE.Color("#dcb186"), colorEdge: new THREE.Color("#a88a68") }, 9000 * starMul);
    this.galaxy({ id: "pinwheel", name: "Pinwheel (M101)", type: "spiral", radius: 30, position: new THREE.Vector3(150, -220, 390), seed: 6, arms: 4, spin: 2.2, tiltX: 0.08, colorEdge: new THREE.Color("#8fb0ff") }, 8000 * starMul);
    this.galaxy({ id: "lmc", name: "Large Magellanic Cloud", type: "irregular", radius: 9, position: new THREE.Vector3(85, 40, 60), seed: 7, colorCore: new THREE.Color("#eaf2ff"), colorMid: new THREE.Color("#ffd9b0"), colorEdge: new THREE.Color("#ff9ec7") }, 3500 * starMul);
    this.galaxy({ id: "smc", name: "Small Magellanic Cloud", type: "irregular", radius: 6, position: new THREE.Vector3(120, -25, 95), seed: 8, colorMid: new THREE.Color("#f0c9a0") }, 2200 * starMul);
    this.galaxy({ id: "centaurus-a", name: "Centaurus A", type: "elliptical", radius: 28, position: new THREE.Vector3(-520, -140, -260), seed: 9, colorEdge: new THREE.Color("#e8b878") }, 9000 * starMul);
    this.galaxy({ id: "m87", name: "Messier 87", type: "elliptical", radius: 42, position: new THREE.Vector3(680, 260, -610), seed: 10, colorEdge: new THREE.Color("#f0cf9a") }, 11000 * starMul);
    this.galaxy({ id: "blackeye", name: "Black Eye (M64)", type: "spiral", radius: 22, position: new THREE.Vector3(-610, 230, 330), seed: 11, arms: 2, spin: 1.4, tiltX: 1.1, colorMid: new THREE.Color("#caa07a"), colorEdge: new THREE.Color("#6f5b46") }, 6000 * starMul);
    this.galaxy({ id: "cartwheel", name: "Cartwheel Galaxy", type: "ring", radius: 24, position: new THREE.Vector3(880, -190, 520), seed: 12, tiltX: 0.5, colorEdge: new THREE.Color("#7ac8ff") }, 5000 * starMul);

    // ---------------- procedural supercluster of distant galaxies
    const extras: CatalogEntry[] = [];
    const rng = mulberry32(909);
    const clusterCenters = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(700, 200, -500), new THREE.Vector3(-650, -150, 500),
      new THREE.Vector3(400, -350, 900), new THREE.Vector3(-900, 300, -700), new THREE.Vector3(1100, 80, 200),
      new THREE.Vector3(-300, 450, 300),
    ];
    let gi = 0;
    for (let i = 0; i < 96; i++) {
      const center = clusterCenters[i % clusterCenters.length];
      const type = rng() < 0.55 ? "spiral" : rng() < 0.68 ? "elliptical" : "irregular";
      const pos = new THREE.Vector3(
        center.x + (rng() - 0.5) * 700,
        center.y + (rng() - 0.5) * 300,
        center.z + (rng() - 0.5) * 700
      );
      const radius = 8 + rng() * 22;
      const name = `PGC ${10000 + Math.floor(rng() * 89999)}`;
      const id = `galgen-${i}`;
      const hue: [string, string, string] = rng() < 0.3
        ? ["#ffe9c4", "#f2b46e", "#7aa8ff"]
        : rng() < 0.5 ? ["#fff4e2", "#e5c292", "#9f7ae8"] : ["#fff8ea", "#e8cba0", "#8fd0ff"];
      this.galaxy({ id, name, type, radius, position: pos, seed: 100 + i, arms: 2 + Math.floor(rng() * 4), spin: 1.5 + rng() * 3,
        tiltX: rng() * Math.PI, tiltZ: (rng() - 0.5) * 0.8,
        colorCore: new THREE.Color(hue[0]), colorMid: new THREE.Color(hue[1]), colorEdge: new THREE.Color(hue[2]) }, 2600 * starMul);
      extras.push({
        id, name, type: `${type === "spiral" ? "Spiral" : type === "elliptical" ? "Elliptical" : "Irregular"} Galaxy`,
        category: "galaxy", fictional: true,
        description: `SIMULATED — procedurally generated ${type} galaxy (seed ${(100 + i).toString(16)}). Part of this explorer's synthetic deep field, illustrating the ~2 trillion galaxies estimated in the observable universe.`,
        distance: "Simulated object", diameter: `~${Math.round(radius * 3100).toLocaleString()} ly (simulated)`,
        age: "8–12 billion years (simulated)", composition: "Procedural star, dust & gas distribution",
        discovered: "Synthetic object — generated at runtime",
        facts: ["SIMULATED object — not from any sky survey", "Real catalogs: PGC, NGC, 2MASS, SDSS name millions of galaxies", "Generated with a deterministic seed — same galaxy every visit"],
      });
      gi++;
    }
    void gi;
    this.cb.onExtraCatalog(extras);

    // ---------------- solar system
    const solar = buildSolarSystem(q);
    solar.group.position.copy(SUN_POS);
    this.addPiece(solar, {
      sun: "star", mercury: "planet", venus: "planet", earth: "planet", moon: "moon", mars: "planet",
      jupiter: "planet", io: "moon", europa: "moon", ganymede: "moon", callisto: "moon",
      saturn: "planet", titan: "moon", enceladus: "moon", uranus: "planet", titania: "moon",
      neptune: "planet", triton: "moon", pluto: "dwarf", ceres: "dwarf", eris: "dwarf", halley: "comet",
    }, {
      sun: "Sun", mercury: "Mercury", venus: "Venus", earth: "Earth", moon: "Moon", mars: "Mars",
      jupiter: "Jupiter", io: "Io", europa: "Europa", ganymede: "Ganymede", callisto: "Callisto",
      saturn: "Saturn", titan: "Titan", enceladus: "Enceladus", uranus: "Uranus", titania: "Titania",
      neptune: "Neptune", triton: "Triton", pluto: "Pluto", ceres: "Ceres", eris: "Eris", halley: "Halley's Comet",
    });
    // Perseid meteor shower — simulated effect near Earth, seasonal in reality
    const earthA = this.anchors.get("earth");
    if (earthA) {
      const meteor = buildMeteorShower(60, 0.014, 90210);
      meteor.group.position.set(0.011, 0.0045, 0.002);
      earthA.def.object.add(meteor.group);
      this.updaters.push(meteor.update);
      this.register("meteors", { object: meteor.group, radius: 0.003, viewDistance: 0.045, labelMaxDist: 0.35 }, "comet", "Perseid Meteors", 3.2);
    }

    // belt anchors (billboard points at belt centers)
    const beltAnchor = new THREE.Object3D(); beltAnchor.position.set(SUN_POS.x + 0.083, SUN_POS.y, SUN_POS.z + 0.083);
    this.scene.add(beltAnchor);
    this.register("asteroid-belt", { object: beltAnchor, radius: 0.05, viewDistance: 0.45, labelMaxDist: 1.2 }, "belt", "Asteroid Belt", 3);
    const kuiperAnchor = new THREE.Object3D(); kuiperAnchor.position.set(SUN_POS.x - 1.1, SUN_POS.y + 0.05, SUN_POS.z - 0.6);
    this.scene.add(kuiperAnchor);
    this.register("kuiper-belt", { object: kuiperAnchor, radius: 0.08, viewDistance: 1.4, labelMaxDist: 4 }, "belt", "Kuiper Belt", 3);

    // ---------------- exoplanet systems (visual scale compressed)
    const proxima = buildStarSystem({
      id: "proxima", starRadius: 0.016, starColor: 0xff9a5c,
      planets: [
        { id: "proxima-b", kind: "earth", seed: 313, radius: 0.004, orbit: 0.055, period: 6, tilt: 0 },
        { id: "proxima-c", kind: "ice", seed: 314, radius: 0.003, orbit: 0.11, period: 13, tilt: 12 },
      ],
    }, q);
    proxima.group.position.copy(SUN_POS).add(new THREE.Vector3(0.007, 0.003, 0.005));
    this.addPiece(proxima, { proxima: "system", "proxima-b": "planet", "proxima-c": "planet" },
      { proxima: "Proxima Centauri", "proxima-b": "Proxima b", "proxima-c": "Proxima c" });

    const trappist = buildStarSystem({
      id: "trappist", starRadius: 0.012, starColor: 0xff8a66,
      planets: [
        { id: "trappist-1b", kind: "lava", seed: 401, radius: 0.0028, orbit: 0.018, period: 2.4 },
        { id: "trappist-1c", kind: "rocky", seed: 402, radius: 0.003, orbit: 0.024, period: 3.2 },
        { id: "trappist-1d", kind: "desert", seed: 403, radius: 0.0026, orbit: 0.030, period: 4 },
        { id: "trappist-1e", kind: "earth", seed: 404, radius: 0.0032, orbit: 0.038, period: 5 },
        { id: "trappist-1f", kind: "earth", seed: 405, radius: 0.0031, orbit: 0.047, period: 6.2 },
        { id: "trappist-1g", kind: "ice", seed: 406, radius: 0.0033, orbit: 0.058, period: 7.6 },
        { id: "trappist-1h", kind: "ice", seed: 407, radius: 0.0024, orbit: 0.072, period: 9.4 },
      ],
    }, q);
    trappist.group.position.copy(SUN_POS).add(new THREE.Vector3(-0.02, 0.005, -0.013));
    this.addPiece(trappist, { trappist: "system", "trappist-1e": "planet", "trappist-1b": "planet", "trappist-1c": "planet", "trappist-1d": "planet", "trappist-1f": "planet", "trappist-1g": "planet", "trappist-1h": "planet" },
      { trappist: "TRAPPIST-1", "trappist-1e": "TRAPPIST-1e", "trappist-1b": "b", "trappist-1c": "c", "trappist-1d": "d", "trappist-1f": "f", "trappist-1g": "g", "trappist-1h": "h" });

    const kepler = buildStarSystem({
      id: "kepler186", starRadius: 0.019, starColor: 0xffc27d,
      planets: [
        { id: "kepler-186b", kind: "rocky", seed: 501, radius: 0.0028, orbit: 0.035, period: 2.6 },
        { id: "kepler-186f", kind: "earth", seed: 506, radius: 0.0042, orbit: 0.085, period: 8, tilt: 18 },
      ],
    }, q);
    kepler.group.position.copy(SUN_POS).add(new THREE.Vector3(0.2, 0.04, -0.13));
    this.addPiece(kepler, { kepler186: "system", "kepler-186f": "planet", "kepler-186b": "planet" },
      { kepler186: "Kepler-186", "kepler-186f": "Kepler-186f", "kepler-186b": "Kepler-186b" });

    // ---------------- fictional systems (clearly SIMULATED)
    const aurelia = buildStarSystem({
      id: "aurelia", starRadius: 0.022, starColor: 0xffb35c,
      planets: [
        { id: "aurelia-ignis", kind: "lava", seed: 601, radius: 0.0032, orbit: 0.045, period: 2.2 },
        { id: "aurelia-thalassa", kind: "ocean", seed: 602, radius: 0.0068, orbit: 0.1, period: 5.6, tilt: 12, clouds: true },
        { id: "aurelia-kaon", kind: "desert", seed: 603, radius: 0.005, orbit: 0.16, period: 8.5 },
        { id: "aurelia-rex", kind: "gasgiant", seed: 604, radius: 0.012, orbit: 0.32, period: 16, tilt: 8, rings: { inner: 1.4, outer: 2.1, opacity: 0.7 } },
        { id: "aurelia-glacis", kind: "ice", seed: 605, radius: 0.0048, orbit: 0.55, period: 26 },
      ],
    }, q);
    aurelia.group.position.set(-18, -0.5, 12);
    this.addPiece(aurelia, { aurelia: "system", "aurelia-thalassa": "planet", "aurelia-ignis": "planet", "aurelia-kaon": "planet", "aurelia-rex": "planet", "aurelia-glacis": "planet" },
      { aurelia: "Aurelia (Sim)", "aurelia-thalassa": "Thalassa", "aurelia-ignis": "Ignis", "aurelia-kaon": "Kaon", "aurelia-rex": "Rex", "aurelia-glacis": "Glacis" });

    const nexus = buildStarSystem({
      id: "nexus7", starRadius: 0.024, starColor: 0xded8ff,
      planets: [
        { id: "nexus7-ember", kind: "lava", seed: 701, radius: 0.0036, orbit: 0.05, period: 2.6 },
        { id: "nexus7-verdant", kind: "earth", seed: 702, radius: 0.0066, orbit: 0.12, period: 6.4, tilt: 21, clouds: true },
        { id: "nexus7-frost", kind: "ice", seed: 703, radius: 0.0052, orbit: 0.24, period: 12 },
      ],
    }, q);
    nexus.group.position.set(4, -2.4, 22);
    this.addPiece(nexus, { nexus7: "system", "nexus7-verdant": "planet", "nexus7-ember": "planet", "nexus7-frost": "planet" },
      { nexus7: "Nexus-7 (Sim)", "nexus7-verdant": "Verdant Prime", "nexus7-ember": "Ember", "nexus7-frost": "Frost" });

    // ---------------- wonders inside the Milky Way
    this.placeWonder(buildBlackHole(0.5, 77), new THREE.Vector3(0, 0, 0), "sgr-a", "Sagittarius A*", "blackhole", 0.5, 2.4, 30);
    this.placeWonder(buildBlackHole(0.06, 78), new THREE.Vector3(12, 0.7, -8), "cygnus-x1", "Cygnus X-1", "blackhole", 0.12, 0.75, 12);
    this.placeWonder(buildPulsar(0.012), new THREE.Vector3(-6, 0.5, 14), "vela-pulsar", "Vela Pulsar", "pulsar", 0.1, 0.5, 10);
    this.placeWonder(buildNebula(0.9, 81, ["#ff8a5c", "#ff5c8a", "#c77dff", "#5cc8ff"], 220), new THREE.Vector3(9, -0.6, -12), "crab-nebula", "Crab Nebula", "nebula", 0.55, 2.2, 22);
    this.placeWonder(buildNebula(1.2, 82, ["#ff6b9d", "#c77dff", "#4dd0e1", "#ffb35c"], 320), new THREE.Vector3(20, -0.7, 5), "orion-nebula", "Orion Nebula", "nebula", 0.7, 2.8, 26);
    this.placeWonder(buildNebula(0.7, 83, ["#4dd0e1", "#ff9f68", "#ffd9a0", "#a78bfa"], 240), new THREE.Vector3(13, -0.4, 10), "pillars", "Pillars of Creation", "nebula", 0.42, 1.7, 16);
    this.placeWonder(buildNebula(0.5, 84, ["#5eead4", "#f0abfc", "#a5f3fc"], 200), new THREE.Vector3(-9, 1.3, -6), "ring-nebula", "Ring Nebula", "nebula", 0.3, 1.2, 14);
    this.placeWonder(buildNebula(0.45, 85, ["#a5b4fc", "#f0abfc", "#7dd3fc"], 180), new THREE.Vector3(-14, 1.7, 8), "cats-eye", "Cat's Eye Nebula", "nebula", 0.28, 1.1, 14);
    this.placeWonder(buildSupernova(0.35), new THREE.Vector3(7, 0.9, -16), "kepler-snr", "Kepler's SNR (Sim)", "supernova", 0.5, 1.9, 18);

    const cluster = buildCluster(0.9, 86, "#ffd9a8", q === 0 ? 500 : 900);
    cluster.position.set(8, 14, -6);
    this.scene.add(cluster);
    const clusterAnchor = new THREE.Object3D();
    clusterAnchor.position.set(8, 14, -6);
    this.scene.add(clusterAnchor);
    this.updaters.push((_d, t) => { const m = cluster.material as THREE.ShaderMaterial; m.uniforms.uTime.value = t; });
    this.register("omega-centauri", { object: clusterAnchor, radius: 0.9, viewDistance: 3.6, labelMaxDist: 40 }, "cluster", "Omega Centauri", 1.6);

    this.cb.onReady();
  }

  private buildFarGalaxies(count: number): THREE.Points {
    // thousands of distant galaxies — each rendered as a soft faint point
    const rng = mulberry32(5150);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const rands = new Float32Array(count);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
      const r = 3200 + rng() * 5200;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = s * Math.cos(th) * r;
      positions[i * 3 + 1] = u * r * 0.55; // flatter supercluster sheet
      positions[i * 3 + 2] = s * Math.sin(th) * r;
      if (rng() < 0.3) tmp.setHSL(0.08, 0.6, 0.55 + rng() * 0.2);
      else if (rng() < 0.6) tmp.setHSL(0.6, 0.5, 0.55 + rng() * 0.25);
      else tmp.setHSL(0.75, 0.4, 0.6);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      sizes[i] = 1.2 + rng() * 3.4;
      rands[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
    const mat = makeBackgroundPointsMaterial(1.7, false);
    mat.uniforms.uMap.value = getGlowTexture();
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  private placeWonder(w: { group: THREE.Group; update: (dt: number, t: number) => void }, pos: THREE.Vector3, id: string, name: string, cat: Category, radius: number, viewDistance: number, labelMaxDist: number) {
    w.group.position.copy(pos);
    this.scene.add(w.group);
    this.updaters.push(w.update);
    this.register(id, { object: w.group, radius, viewDistance, labelMaxDist }, cat, name, 2.4);
  }

  // ------------------------------------------------------------------ events

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  };

  private bindEvents() {
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", () => {
      if (this.dragging) { this.dragging = false; this.processClick(); }
    });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
    this.controls.addEventListener("start", () => {
      this.idleT = 0;
      this.controls.autoRotate = false;
      if (!this.tour.active && this.fly === false) this.cancelTravel();
    });
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerPixel = { x: e.clientX, y: e.clientY };
    if (this.fly && this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.flyYaw -= dx * 0.0024;
      this.flyPitch -= dy * 0.0024;
      this.flyPitch = clamp(this.flyPitch, -1.45, 1.45);
    }
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private downAt = { x: 0, y: 0, t: 0 };
  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.idleT = 0;
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.idleT = 0;
    this.keys.add(k);
    if (k === "escape") {
      if (this.tour.active) this.endTour();
      else if (this.fly) this.setFly(false);
      else this.select(null);
    }
    if (this.tour.active && (k === "arrowright" || k === " ")) this.tourNext();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private onWheel = (e: WheelEvent) => {
    this.idleT = 0;
    if (this.fly) {
      this.flySpeedMul = clamp(this.flySpeedMul * (e.deltaY > 0 ? 0.9 : 1.12), 0.05, 40);
    } else if (!this.tour.active) {
      this.cancelTravel();
    }
  };

  // ------------------------------------------------------------------ picking

  private processClick() {
    if (performance.now() - this.downAt.t > 320) return; // was a drag
    const moved = Math.hypot(this.pointerPixel.x - this.downAt.x, this.pointerPixel.y - this.downAt.y);
    if (moved > 6) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    if (hits.length > 0) {
      const id = this.preferredHit(hits);
      if (id) this.onPick(id, this.pointerPixel.x, this.pointerPixel.y);
    }
  }

  private onPick(id: string, x: number, y: number) {
    void x; void y;
    this.select(id);
    this.travelTo(id, false);
  }

  /** When nested hit-spheres overlap (e.g. a planet inside the Milky Way's sphere), the smallest anchor wins. */
  private preferredHit(hits: { object: THREE.Object3D }[]): string | null {
    let best: string | null = null;
    let bestR = Infinity;
    for (const h of hits) {
      const id = h.object.userData.anchorId as string;
      const a = this.anchors.get(id);
      if (!a) continue;
      if (a.def.radius < bestR) { bestR = a.def.radius; best = id; }
    }
    return best;
  }

  private processHover(dt: number) {
    this.hoverTimer -= dt;
    if (this.hoverTimer > 0) return;
    this.hoverTimer = 0.12;
    if (this.fly || this.tour.active) { if (this.hoveredId) { this.hoveredId = null; this.cb.onHover(null); } this.canvas.style.cursor = this.fly ? "crosshair" : "default"; return; }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const id = this.preferredHit(hits);
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.canvas.style.cursor = id ? "pointer" : "grab";
    }
    this.cb.onHover(id, this.pointerPixel.x, this.pointerPixel.y);
  }

  // ------------------------------------------------------------------ selection & travel

  select(id: string | null) {
    this.selectedId = id;
    if (!id) this.lockedId = null;
    this.cb.onSelect(id);
    this.selectionRing.visible = !!id;
  }

  private cancelTravel() {
    if (this.travel?.active) {
      this.travel = null;
      this.cb.onTravelLabel(null);
      if (!this.fly) this.controls.enabled = true;
    }
  }

  travelTo(id: string, selectToo = true) {
    const a = this.anchors.get(id);
    if (!a) return;
    if (this.fly) this.setFly(false);
    a.def.object.getWorldPosition(this.tmpV);
    const targetPos = this.tmpV.clone();
    const vd = a.def.viewDistance;

    const dir = this.tmpV2.copy(this.camera.position).sub(targetPos);
    if (dir.lengthSq() < 1e-8) dir.set(0.3, 0.5, 0.8);
    dir.normalize();
    const endPos = targetPos.clone().add(dir.multiplyScalar(vd));
    endPos.y += vd * 0.28; // slight elevation for cinematic framing

    const dist = this.camera.position.distanceTo(endPos);
    const dur = clamp(1.7 + Math.log10(1 + dist / Math.max(vd, 0.01)) * 1.1, 1.8, 5.2);

    // arc midpoint
    const mid = this.camera.position.clone().add(endPos).multiplyScalar(0.5);
    const perp = new THREE.Vector3().subVectors(endPos, this.camera.position).cross(new THREE.Vector3(0, 1, 0));
    if (perp.lengthSq() > 1e-9) {
      perp.normalize().multiplyScalar(Math.min(dist * 0.16, 120));
      mid.add(perp);
    }
    mid.y += Math.min(dist * 0.08, 60);

    this.travel = {
      active: true, t: 0, dur,
      fromPos: this.camera.position.clone(), toPos: endPos, mid,
      fromTgt: this.controls.target.clone(), toTgt: targetPos, id,
    };
    this.controls.enabled = false;
    if (selectToo) this.select(id);
    this.cb.onTravelLabel(`Approaching ${a.name}`);
  }

  home() {
    this.endTour();
    this.select(null);
    const a = this.anchors.get("milky-way");
    if (a) {
      this.travel = {
        active: true, t: 0, dur: 3.2,
        fromPos: this.camera.position.clone(), toPos: new THREE.Vector3(0, 95, 235),
        mid: this.camera.position.clone().add(new THREE.Vector3(0, 95, 235)).multiplyScalar(0.5).add(new THREE.Vector3(0, 80, 0)),
        fromTgt: this.controls.target.clone(), toTgt: MW_POS.clone(), id: "milky-way",
      };
      this.controls.enabled = false;
      this.cb.onTravelLabel("Returning home");
    }
  }

  zoomBy(factor: number) {
    const dir = this.tmpV.copy(this.camera.position).sub(this.controls.target);
    const len = dir.length();
    const newLen = clamp(len * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(dir.normalize().multiplyScalar(newLen));
  }

  // ------------------------------------------------------------------ tour

  startTour() {
    this.tour = { active: true, index: 0, phase: "travel", dwellT: 0 };
    const step = TOUR[0];
    this.cb.onTour({ active: true, index: 0, total: TOUR.length, caption: step.caption, name: step.name });
    this.select(step.id);
    this.travelTo(step.id, false);
  }

  tourNext() {
    if (!this.tour.active) return;
    const next = this.tour.index + 1;
    if (next >= TOUR.length) { this.endTour(); return; }
    this.tour.index = next;
    this.tour.phase = "travel";
    this.tour.dwellT = 0;
    const step = TOUR[next];
    this.cb.onTour({ active: true, index: next, total: TOUR.length, caption: step.caption, name: step.name });
    this.select(step.id);
    this.travelTo(step.id, false);
  }

  tourPrev() {
    if (!this.tour.active || this.tour.index === 0) return;
    this.tour.index--;
    this.tour.phase = "travel";
    const step = TOUR[this.tour.index];
    this.cb.onTour({ active: true, index: this.tour.index, total: TOUR.length, caption: step.caption, name: step.name });
    this.select(step.id);
    this.travelTo(step.id, false);
  }

  endTour() {
    if (!this.tour.active) return;
    this.tour.active = false;
    this.travel = null;
    this.cb.onTour({ active: false, index: 0, total: TOUR.length, caption: "", name: "" });
    this.controls.enabled = !this.fly;
    this.cb.onTravelLabel(null);
  }

  // ------------------------------------------------------------------ modes & toggles

  setFly(on: boolean) {
    if (this.fly === on) return;
    this.fly = on;
    this.cb.onMode(on);
    this.controls.enabled = !on && !this.tour.active;
    if (on) {
      this.cancelTravel();
      const d = this.camera.getWorldDirection(this.tmpV);
      this.flyYaw = Math.atan2(-d.x, -d.z);
      this.flyPitch = Math.asin(clamp(d.y, -1, 1));
      this.flyVel.set(0, 0, 0);
    } else {
      // keep continuity: put orbit target ahead of camera
      const d = this.camera.getWorldDirection(this.tmpV);
      const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 0.01);
      this.controls.target.copy(this.camera.position).addScaledVector(d, dist);
    }
  }

  setMuted(m: boolean) { this.audio.setMuted(m); }
  startAudio() { this.audio.start(); }

  setFx(on: boolean) { this.fxOn = on && !!this.composer; }
  isFxEnabled() { return this.fxOn; }
  private fxOn = true;

  // ------------------------------------------------------------------ helpers for UI

  getBearing(): number {
    const d = this.tmpV.copy(this.controls.target).sub(this.camera.position);
    return (180 - (Math.atan2(d.x, d.z) * 180) / Math.PI + 360) % 360;
  }

  getSelectedDistance(): string | null {
    if (!this.selectedId) return null;
    const a = this.anchors.get(this.selectedId);
    if (!a) return null;
    a.def.object.getWorldPosition(this.tmpV);
    return formatDistance(this.camera.position.distanceTo(this.tmpV));
  }

  hasAnchor(id: string) { return this.anchors.has(id); }

  getMapPoints(): { id: string; name: string; cat: Category; x: number; z: number }[] {
    const out: { id: string; name: string; cat: Category; x: number; z: number }[] = [];
    this.anchors.forEach((a, id) => {
      if (a.category === "moon" || a.category === "belt" || a.category === "comet") return;
      a.def.object.getWorldPosition(this.tmpV);
      out.push({ id, name: a.name, cat: a.category, x: this.tmpV.x, z: this.tmpV.z });
    });
    return out;
  }

  // ------------------------------------------------------------------ composer

  private initComposer() {
    if (this.quality === 0) { this.composer = null; this.fxOn = false; return; }
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.55, 0.85, 0.18);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null;
    }
  }

  // ------------------------------------------------------------------ main loop

  private loop = () => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // travel tween
    if (this.travel?.active) {
      const tr = this.travel;
      tr.t += dt / tr.dur;
      const k = easeInOutCubic(clamp(tr.t, 0, 1));
      // quadratic bezier for the camera path
      const a = this.tmpV.copy(tr.fromPos).lerp(tr.mid, k);
      const b = this.tmpV2.copy(tr.mid).lerp(tr.toPos, k);
      this.camera.position.copy(a.lerp(b, k));
      this.controls.target.lerpVectors(tr.fromTgt, tr.toTgt, k);
      // keep the target tracking a moving object
      if (tr.id) {
        const anch = this.anchors.get(tr.id);
        if (anch) {
          anch.def.object.getWorldPosition(tr.toTgt);
        }
      }
      if (tr.t >= 1) {
        this.travel = null;
        this.cb.onTravelLabel(null);
        if (!this.tour.active) this.controls.enabled = true;
        if (tr.id) this.lockedId = tr.id;
        if (this.tour.active) { this.tour.phase = "dwell"; this.tour.dwellT = 0; }
      }
    }

    // tour auto-advance
    if (this.tour.active && this.tour.phase === "dwell") {
      this.tour.dwellT += dt;
      if (this.tour.dwellT > 7.5) this.tourNext();
    }

    // follow locked (orbiting) target
    if (this.lockedId && !this.travel) {
      const a = this.anchors.get(this.lockedId);
      if (a) {
        a.def.object.getWorldPosition(this.tmpV);
        this.controls.target.lerp(this.tmpV, 1 - Math.pow(0.001, dt));
      }
    }

    // fly controls
    if (this.fly) this.updateFly(dt);
    else this.controls.update();

    // idle cinematic drift
    this.idleT += dt;
    const idle = this.idleT > 16 && !this.selectedId && !this.travel && !this.tour.active && !this.fly;
    this.controls.autoRotate = idle;
    this.controls.autoRotateSpeed = 0.32;

    // near/far planes adapt to scale
    const dist = this.camera.position.distanceTo(this.controls.target);
    const near = clamp(dist * 0.02, 0.00008, 5);
    if (Math.abs(this.camera.near - near) / this.camera.near > 0.25) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    // world updates
    for (const u of this.updaters) u(dt, t);

    // camera-bound fields
    if (this.deepField) this.deepField.position.copy(this.camera.position);
    if (this.farField) this.farField.position.copy(this.camera.position).multiplyScalar(0.02);
    this.dustWrap?.(this.camera.position);

    // selection gyroscope
    if (this.selectedId) {
      const a = this.anchors.get(this.selectedId);
      if (a) {
        a.def.object.getWorldPosition(this.tmpV);
        this.selectionRing.position.copy(this.tmpV);
        const s = a.def.radius * 2.4 * (1 + Math.sin(t * 2.2) * 0.05);
        this.selectionRing.scale.setScalar(Math.max(s, a.def.radius * 1.4));
        this.selectionRing.rotation.y += dt * 0.5;
        this.selectionRing.rotation.x += dt * 0.23;
      }
    }

    // labels
    this.updateLabels();

    // hover + scale
    this.processHover(dt);
    this.scaleTimer -= dt;
    if (this.scaleTimer <= 0) {
      this.scaleTimer = 0.4;
      const { tier, dist: dLabel } = viewScaleLabel(dist);
      this.cb.onScale(tier, dLabel);
    }

    if (this.fxOn && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  private updateFly(dt: number) {
    const dist = Math.max(this.camera.position.distanceTo(this.controls.target), 0.003);
    const base = clamp(dist * 0.55, 0.0015, 160) * this.flySpeedMul;
    const accel = base * 3.2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.flyPitch, this.flyYaw, 0, "YXZ"));
    this.camera.quaternion.slerp(q, 1 - Math.pow(0.0001, dt));

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    const wish = new THREE.Vector3();
    if (this.keys.has("w") || this.keys.has("arrowup")) wish.add(fwd);
    if (this.keys.has("s") || this.keys.has("arrowdown")) wish.sub(fwd);
    if (this.keys.has("d") || this.keys.has("arrowright") && !this.tour.active) wish.add(right);
    if (this.keys.has("a") || this.keys.has("arrowleft")) wish.sub(right);
    if (this.keys.has("e") || this.keys.has(" ")) wish.add(up);
    if (this.keys.has("q") || this.keys.has("shift")) wish.sub(up);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(accel * dt);
    this.flyVel.lerp(wish, 1 - Math.pow(0.01, dt));
    this.camera.position.addScaledVector(this.flyVel, dt);
    // keep orbit target roughly ahead so zooming back works
    this.controls.target.copy(this.camera.position).addScaledVector(fwd, dist);
  }

  private updateLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.anchors.forEach((a, id) => {
      const el = a.labelEl;
      if (!el) return;
      a.def.object.getWorldPosition(a.wp);
      const d = this.camera.position.distanceTo(a.wp);
      const maxD = a.def.labelMaxDist ?? 1e9;
      if (d > maxD || d < a.def.viewDistance * 0.28) { el.style.opacity = "0"; el.style.pointerEvents = "none"; return; }
      this.tmpV.copy(a.wp).project(this.camera);
      if (this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1.15 || Math.abs(this.tmpV.y) > 1.15) { el.style.opacity = "0"; el.style.pointerEvents = "none"; return; }
      const x = (this.tmpV.x * 0.5 + 0.5) * w;
      const y = (-this.tmpV.y * 0.5 + 0.5) * h;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -140%)`;
      const nearFade = a.def.viewDistance * 0.5;
      const opacity = clamp((d - nearFade) / (nearFade * 3), 0.25, 1) * clamp((maxD - d) / (maxD * 0.15), 0, 1);
      el.style.opacity = opacity.toFixed(2);
      el.style.pointerEvents = opacity > 0.25 ? "auto" : "none";
      if (id === this.hoveredId) { } // css hover handles visuals
    });
  }

  // synthetic click handling (pointerup based, to distinguish from drags)
  armClick() {
    this.processClick();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.audio.dispose();
    this.labelLayer.remove();
    this.scene.traverse((o) => {
      const obj = o as THREE.Mesh;
      if ((obj as any).geometry) (obj as any).geometry.dispose?.();
      const m = (obj as any).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else (m as any)?.dispose?.();
    });
    this.renderer.dispose();
  }
}
