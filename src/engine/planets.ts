import * as THREE from "three";
import { mulberry32, gauss } from "./utils";
import { makePlanetTexture, makeCloudTexture, makeRingTexture, getGlowTexture } from "./textures";
import type { PlanetKind } from "./textures";

export interface AnchorDef {
  id?: string;
  object: THREE.Object3D;
  radius: number;        // visual radius (for markers / pick sphere)
  viewDistance: number;  // ideal camera distance
  labelMaxDist?: number; // hide label beyond this
}

export interface BuiltPiece {
  group: THREE.Group;
  anchors: AnchorDef[];
  update: (dt: number, t: number) => void;
  sunPosition?: THREE.Object3D;
}

export interface PlanetSpec {
  id: string;
  kind: PlanetKind;
  seed: number;
  radius: number;       // world units
  orbit: number;        // world units from star
  period: number;       // seconds per orbit (visual)
  tilt?: number;        // axial tilt deg
  rings?: { inner: number; outer: number; opacity: number };
  color?: number;       // flat color (used when no texture desired)
  clouds?: boolean;
  moons?: MoonSpec[];
  startPhase?: number;
}

export interface MoonSpec {
  id: string;
  orbitR: number; // x parent radius
  radius: number;
  period: number;
  seed: number;
  kind: PlanetKind;
}

export interface StarSystemSpec {
  id: string;
  starRadius: number;
  starColor: number;
  starTempColor?: number;
  planets: PlanetSpec[];
  belts?: { inner: number; outer: number; count: number; color: number; size: number; seed: number }[];
}

// ---------------------------------------------------------------------------

function makeOrbitLine(radius: number, color = 0x4a6a9a, opacity = 0.16): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  const n = 128;
  for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function makeStarMesh(radius: number, color: number): { mesh: THREE.Mesh; glow: THREE.Sprite } {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  // hot rim shading via vertex colors approximation — use emissive-ish basic + glow sprite
  (mesh.material as THREE.MeshBasicMaterial).color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(radius * 9);
  return { mesh, glow };
}

function buildMoon(spec: MoonSpec, parentR: number): { pivot: THREE.Object3D; anchor: AnchorDef; spin: number } {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 20, 14),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(spec.kind, spec.seed), roughness: 0.95, metalness: 0 })
  );
  mesh.position.set(spec.orbitR * parentR, 0, 0);
  pivot.add(mesh);
  return {
    pivot,
    anchor: { id: spec.id, object: mesh, radius: spec.radius, viewDistance: spec.radius * 9, labelMaxDist: 1.4 },
    spin: (Math.PI * 2) / spec.period,
  };
}

function buildPlanet(spec: PlanetSpec, opts: { quality?: number } = {}): {
  pivot: THREE.Object3D; anchors: AnchorDef[]; updater: (dt: number, t: number) => void;
  mesh: THREE.Mesh;
} {
  void opts;
  const anchors: AnchorDef[] = [];
  const updaters: ((dt: number, t: number) => void)[] = [];
  const orbitPivot = new THREE.Group();
  orbitPivot.rotation.y = spec.startPhase ?? 0;

  const mat = spec.color !== undefined
    ? new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ map: makePlanetTexture(spec.kind, spec.seed), roughness: 0.92, metalness: 0.02 });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 36, 24), mat);
  mesh.position.set(spec.orbit, 0, 0);
  mesh.rotation.z = THREE.MathUtils.degToRad(spec.tilt ?? 0);
  orbitPivot.add(mesh);
  anchors.push({ id: spec.id, object: mesh, radius: spec.radius, viewDistance: Math.max(spec.radius * 8, 0.012), labelMaxDist: 3.2 });

  if (spec.clouds) {
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius * 1.02, 32, 20),
      new THREE.MeshStandardMaterial({
        map: makeCloudTexture(spec.seed), transparent: true, opacity: 0.8,
        depthWrite: false, roughness: 1,
      })
    );
    mesh.add(clouds);
    updaters.push((dt) => { clouds.rotation.y += dt * 0.06; });
  }

  if (spec.rings) {
    const ringGeo = new THREE.RingGeometry(spec.radius * spec.rings.inner, spec.radius * spec.rings.outer, 96, 1);
    // remap UVs radially so the banding texture follows the rings
    const rpos = ringGeo.attributes.position as THREE.BufferAttribute;
    const ruv = ringGeo.attributes.uv as THREE.BufferAttribute;
    const ri = spec.radius * spec.rings.inner, ro = spec.radius * spec.rings.outer;
    for (let i = 0; i < rpos.count; i++) {
      const rr = Math.hypot(rpos.getX(i), rpos.getY(i));
      ruv.setXY(i, (rr - ri) / (ro - ri), 0.5);
    }
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(spec.seed + 5), transparent: true, opacity: spec.rings.opacity,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2 - 0.12;
    mesh.add(ring);
  }

  for (const m of spec.moons ?? []) {
    const built = buildMoon(m, spec.radius);
    mesh.add(built.pivot);
    anchors.push(built.anchor);
    updaters.push((dt) => { built.pivot.rotation.y += built.spin * dt; });
  }

  const orbitSpeed = (Math.PI * 2) / spec.period;
  const spinSpeed = orbitSpeed * 24; // roughly day-length scaled, aesthetics first
  updaters.push((dt) => {
    orbitPivot.rotation.y += orbitSpeed * dt;
    mesh.rotation.y += spinSpeed * 0.31 * dt;
  });

  return { pivot: orbitPivot, anchors, updater: (dt, t) => updaters.forEach((u) => u(dt, t)), mesh };
}

function buildBelt(spec: NonNullable<StarSystemSpec["belts"]>[number], quality: number): THREE.InstancedMesh {
  const count = Math.round(spec.count * (quality === 0 ? 0.4 : quality === 1 ? 0.75 : 1));
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 1 });
  const inst = new THREE.InstancedMesh(geo, material, count);
  const rng = mulberry32(spec.seed);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const r = spec.inner + rng() * (spec.outer - spec.inner);
    const a = rng() * Math.PI * 2;
    const y = gauss(rng) * (spec.outer - spec.inner) * 0.06;
    dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = spec.size * (0.4 + rng() * rng() * 1.8);
    dummy.scale.set(s, s * (0.7 + rng() * 0.6), s * (0.7 + rng() * 0.6));
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/** Generic star system builder (used for solar system, exoplanet systems, fictional systems). */
export function buildStarSystem(spec: StarSystemSpec, quality: number): BuiltPiece {
  const group = new THREE.Group();
  const anchors: AnchorDef[] = [];
  const updaters: ((dt: number, t: number) => void)[] = [];

  const { mesh: star, glow } = makeStarMesh(spec.starRadius, spec.starColor);
  group.add(star, glow);
  anchors.push({ id: spec.id, object: star, radius: spec.starRadius, viewDistance: spec.starRadius * 10, labelMaxDist: 2.5 });

  const light = new THREE.PointLight(0xfff2dd, 1.6, 0, 0);
  group.add(light);

  for (const p of spec.planets) {
    const built = buildPlanet(p, { quality });
    group.add(built.pivot);
    group.add(makeOrbitLine(p.orbit));
    anchors.push(...built.anchors);
    updaters.push(built.updater);
  }

  const beltGroups: THREE.Object3D[] = [];
  for (const b of spec.belts ?? []) {
    const belt = buildBelt(b, quality);
    beltGroups.push(belt);
    group.add(belt);
  }

  updaters.push((dt) => { star.rotation.y += dt * 0.12; });

  return {
    group, anchors,
    update: (dt, t) => updaters.forEach((u) => u(dt, t)),
    sunPosition: star,
  };
}

// ------------------------------------------------------------------
// Our Solar System (accelerated visual dynamics — labeled as such)
// ------------------------------------------------------------------

const AU = 0.03;
/** spread-out non-linear radius mapping so every planet stays visible */
const pr = (km: number) => 0.0042 + 0.0095 * Math.pow(km / 69911, 0.62);
const periodS = (days: number) => Math.max(days * 0.16, 2.2);

export function buildSolarSystem(quality: number): BuiltPiece {
  const spec: StarSystemSpec = {
    id: "sun",
    starRadius: 0.055,
    starColor: 0xffd27d,
    planets: [
      { id: "mercury", kind: "rocky", seed: 11, radius: pr(2439), orbit: 0.387 * AU, period: periodS(88), tilt: 0.03 },
      { id: "venus", kind: "venus", seed: 12, radius: pr(6052), orbit: 0.723 * AU, period: periodS(224.7), tilt: 177.4 },
      {
        id: "earth", kind: "earth", seed: 13, radius: pr(6371), orbit: 1 * AU, period: periodS(365.25), tilt: 23.4, clouds: true,
        moons: [{ id: "moon", orbitR: 3.2, radius: 0.0017, period: 4.9, seed: 31, kind: "moon" }],
      },
      { id: "mars", kind: "mars", seed: 14, radius: pr(3389), orbit: 1.524 * AU, period: periodS(687), tilt: 25.2 },
      {
        id: "jupiter", kind: "gasgiant", seed: 15, radius: pr(69911), orbit: 5.204 * AU, period: periodS(4332), tilt: 3.1,
        moons: [
          { id: "io", orbitR: 1.7, radius: 0.0011, period: 1.9, seed: 41, kind: "lava" },
          { id: "europa", orbitR: 2.1, radius: 0.00095, period: 2.6, seed: 42, kind: "ice" },
          { id: "ganymede", orbitR: 2.6, radius: 0.0015, period: 3.4, seed: 43, kind: "rocky" },
          { id: "callisto", orbitR: 3.1, radius: 0.0014, period: 4.4, seed: 44, kind: "moon" },
        ],
      },
      {
        id: "saturn", kind: "gasgiant", seed: 16, radius: pr(58232) * 0.96, orbit: 9.58 * AU, period: periodS(10759), tilt: 26.7,
        rings: { inner: 1.25, outer: 2.25, opacity: 0.9 },
        moons: [
          { id: "titan", orbitR: 3.4, radius: 0.0015, period: 3.8, seed: 51, kind: "desert" },
          { id: "enceladus", orbitR: 2.7, radius: 0.0006, period: 2.2, seed: 52, kind: "ice" },
        ],
      },
      {
        id: "uranus", kind: "ice", seed: 17, radius: pr(25362), orbit: 19.2 * AU, period: periodS(30687), tilt: 97.8,
        rings: { inner: 1.6, outer: 1.95, opacity: 0.35 },
        moons: [{ id: "titania", orbitR: 2.6, radius: 0.0008, period: 3.1, seed: 61, kind: "moon" }],
      },
      {
        id: "neptune", kind: "ice", seed: 18, radius: pr(24622), orbit: 30.05 * AU, period: periodS(60190), tilt: 28.3,
        moons: [{ id: "triton", orbitR: 2.4, radius: 0.0011, period: 2.9, seed: 71, kind: "ice" }],
      },
      {
        id: "pluto", kind: "rocky", seed: 19, radius: pr(1188) * 0.85, orbit: 39.48 * AU, period: periodS(90560), tilt: 122.5,
        moons: [],
      },
      { id: "ceres", kind: "rocky", seed: 20, radius: pr(470) * 0.9, orbit: 2.77 * AU, period: periodS(1682), tilt: 4 },
      { id: "eris", kind: "ice", seed: 21, radius: pr(1163) * 0.85, orbit: 67.8 * AU, period: periodS(203830), tilt: 78 },
    ],
    belts: [
      { inner: 2.2 * AU, outer: 3.3 * AU, count: 1500, color: 0x8a7f70, size: 0.00045, seed: 101 },
      { inner: 31 * AU, outer: 50 * AU, count: 900, color: 0x7f95a8, size: 0.0006, seed: 102 },
    ],
  };

  const piece = buildStarSystem(spec, quality);

  // Halley's Comet — real ellipse (a ≈ 17.83 AU, e ≈ 0.967), 30× accelerated
  const a = 17.83 * AU, e = 0.967;
  const cometGroup = new THREE.Group();
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.0016, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xcfe9ff })
  );
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: 0xa8d8ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  headGlow.scale.setScalar(0.02);
  const head = new THREE.Group();
  head.add(headMesh, headGlow);
  cometGroup.add(head);

  const TRAIL = 42;
  const tailGeo = new THREE.BufferGeometry();
  const tailPos = new Float32Array(TRAIL * 3);
  const tailCol = new Float32Array(TRAIL * 3);
  const tailSize = new Float32Array(TRAIL);
  const tailRand = new Float32Array(TRAIL);
  for (let i = 0; i < TRAIL; i++) {
    const f = i / TRAIL;
    tailCol[i * 3] = 0.62 * (1 - f); tailCol[i * 3 + 1] = 0.8 * (1 - f); tailCol[i * 3 + 2] = 1.0 * (1 - f);
    tailSize[i] = 2.4 * (1 - f) + 0.3;
    tailRand[i] = f;
  }
  tailGeo.setAttribute("position", new THREE.BufferAttribute(tailPos, 3));
  tailGeo.setAttribute("aColor", new THREE.BufferAttribute(tailCol, 3));
  tailGeo.setAttribute("aSize", new THREE.BufferAttribute(tailSize, 1));
  tailGeo.setAttribute("aRand", new THREE.BufferAttribute(tailRand, 1));
  const tailMat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aSize; attribute vec3 aColor;
      uniform float uTime; varying vec3 vColor;
      void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * (120.0 / max(length(mv.xyz), 0.0001)); gl_PointSize = min(gl_PointSize, 40.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec3 vColor;
      void main(){ vec4 tex = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor, tex.a) * tex; }`,
    uniforms: { uTime: { value: 0 }, uMap: { value: getGlowTexture() } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tail = new THREE.Points(tailGeo, tailMat);
  tail.frustumCulled = false;
  cometGroup.add(tail);
  piece.group.add(cometGroup);
  piece.anchors.push({ id: "halley", object: head, radius: 0.004, viewDistance: 0.05, labelMaxDist: 2.2 });

  // Keplerian-ish orbit line for the comet
  const b = a * Math.sqrt(1 - e * e);
  const orbitPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const th = (i / 128) * Math.PI * 2;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
    orbitPts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
  }
  const cometLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPts),
    new THREE.LineBasicMaterial({ color: 0x67c8e8, transparent: true, opacity: 0.28 })
  );
  cometGroup.add(cometLine);
  void b;

  let cometAngle = 0;
  const trail: THREE.Vector3[] = [];
  const prevUpdate = piece.update;
  piece.update = (dt, t) => {
    prevUpdate(dt, t);
    // mean-anomaly approximation with 30× visual acceleration
    cometAngle += dt * (2 * Math.PI / (75.3 * 365 * 0.16)) * 30;
    const E = cometAngle;
    const r = a * (1 - e * Math.cos(E)) / 1; // param form approx (uses cos E like eccentric anomaly)
    const x = a * (Math.cos(E) - e) / 1;
    const z = a * Math.sqrt(1 - e * e) * Math.sin(E);
    void r;
    head.position.set(x, 0.15 * z, z); // slight inclination
    trail.unshift(head.position.clone());
    if (trail.length > TRAIL) trail.pop();
    const arr = tailGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < TRAIL; i++) {
      const p = trail[Math.min(i, trail.length - 1)] ?? head.position;
      // tail falls slightly away from sun
      const f = i / TRAIL;
      arr[i * 3] = p.x * (1 + f * 0.02);
      arr[i * 3 + 1] = p.y + f * 0.003;
      arr[i * 3 + 2] = p.z * (1 + f * 0.02);
    }
    tailGeo.attributes.position.needsUpdate = true;
  };
  return piece;
}
