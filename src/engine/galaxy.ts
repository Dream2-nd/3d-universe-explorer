import * as THREE from "three";
import { mulberry32, gauss } from "./utils";
import { getGlowTexture } from "./textures";

export interface GalaxySpec {
  id: string;
  name: string;
  type: "spiral" | "elliptical" | "irregular" | "ring";
  radius: number;
  position: THREE.Vector3;
  seed: number;
  tiltX?: number;
  tiltZ?: number;
  arms?: number;
  spin?: number;
  colorCore?: THREE.Color;
  colorMid?: THREE.Color;
  colorEdge?: THREE.Color;
  stars?: number;
  thickness?: number;
  bar?: boolean;
}

export interface BuiltGalaxy {
  group: THREE.Group;
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  update: (t: number) => void;
}

const GALAXY_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aRand;
uniform float uTime;
uniform float uSpin;
uniform float uSizeScale;
varying vec3 vColor;
varying float vFade;
void main() {
  vec3 p = position;
  float r = length(p.xz);
  // differential rotation — inner regions complete orbits faster
  float ang = uSpin * uTime / (1.0 + r * 0.55);
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = length(mv.xyz);
  gl_PointSize = aSize * uSizeScale * (140.0 / max(dist, 0.001));
  gl_PointSize = min(gl_PointSize, 64.0);
  vColor = aColor;
  vFade = 1.0 - smoothstep(3500.0, 5200.0, dist);
  gl_Position = projectionMatrix * mv;
}
`;

const GALAXY_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vFade;
void main() {
  if (vFade < 0.01) discard;
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, 1.0) * tex * vFade;
}
`;

export function makeGalaxyMaterial(sizeScale = 1, spin = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSpin: { value: spin },
      uSizeScale: { value: sizeScale },
      uMap: { value: getGlowTexture() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Fixed pixel-size point material for background starfields & distant galaxy shells (with optional twinkle). */
export function makeBackgroundPointsMaterial(pixelScale = 1, twinkle = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aRand;
      uniform float uTime;
      uniform float uPx;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx;
        vColor = aColor;
        vTw = ${twinkle ? "0.72 + 0.28 * sin(uTime * (0.6 + aRand * 2.2) + aRand * 40.0)" : "1.0"};
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * vTw, 1.0) * tex;
      }
    `,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: pixelScale },
      uMap: { value: getGlowTexture() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Build a procedural galaxy point-cloud. Returns [positions, colors, sizes, rands]. */
export function galaxyData(spec: GalaxySpec, rng: () => number, count: number) {
  const R = spec.radius;
  const arms = spec.arms ?? 4;
  const spin = spec.spin ?? 3.1;
  const rndness = 0.32;
  const thickness = spec.thickness ?? R * 0.075;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);

  const cCore = spec.colorCore ?? new THREE.Color("#ffe9c8");
  const cMid = spec.colorMid ?? new THREE.Color("#f7b267");
  const cEdge = spec.colorEdge ?? new THREE.Color("#6fa8ff");
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0, rt = 0;
    const isBulge = rng() < (spec.type === "spiral" ? 0.28 : 0.0);
    rands[i] = rng();

    if (spec.type === "spiral") {
      if (isBulge) {
        // spheroid bulge (bar-elongated)
        const br = R * 0.11;
        x = gauss(rng) * br * (spec.bar ? 2.1 : 1.3);
        y = gauss(rng) * br * 0.62;
        z = gauss(rng) * br * 0.9;
        rt = 0.04 + rng() * 0.1;
      } else {
        const rN = Math.pow(rng(), 0.72) * (spec.bar ? 0.42 : 0.62) + (spec.bar ? 0.22 : 0.1);
        const r = rN * R;
        const spinAngle = Math.pow(rN, 1.05) * spin;
        const branchAngle = ((i % arms) / arms) * Math.PI * 2;
        const scatter = rndness * (0.3 + 0.7 * (1 - rN)) * R * 0.55;
        x = Math.cos(branchAngle + spinAngle) * r + gauss(rng) * scatter * 0.35;
        z = Math.sin(branchAngle + spinAngle) * r + gauss(rng) * scatter * 0.35;
        y = gauss(rng) * thickness * (1.15 - rN) * (0.7 + rng() * 0.6);
        rt = rN;
      }
    } else if (spec.type === "elliptical") {
      // de Vaucouleurs-ish concentration
      const t = Math.pow(rng(), 1.9);
      const rad = t * R;
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      x = rad * Math.sin(ph) * Math.cos(th) * 1.0 + gauss(rng) * R * 0.02;
      y = rad * Math.cos(ph) * 0.55;
      z = rad * Math.sin(ph) * Math.sin(th) * 0.82;
      rt = 1 - t;
    } else if (spec.type === "ring") {
      const band = rng() < 0.75;
      const rr = band ? R * (0.55 + rng() * 0.4) : R * rng() * 0.28;
      const a = rng() * Math.PI * 2;
      x = Math.cos(a) * rr + gauss(rng) * R * 0.03;
      z = Math.sin(a) * rr + gauss(rng) * R * 0.03;
      y = gauss(rng) * thickness;
      rt = 0.5;
    } else {
      // irregular — several clumps
      const clumps = 4;
      const ci = Math.floor(rng() * clumps);
      const ca = ((ci + 0.5) / clumps) * Math.PI * 2 + rng();
      const cd = R * (0.25 + rng() * 0.5);
      x = Math.cos(ca) * cd + gauss(rng) * R * 0.16;
      z = Math.sin(ca) * cd + gauss(rng) * R * 0.16;
      y = gauss(rng) * R * 0.14;
      rt = 0.35 + rng() * 0.4;
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // color gradient core → edge with hot O/B flashes and red giants
    if (rt < 0.45) tmp.lerpColors(cCore, cMid, rt / 0.45);
    else tmp.lerpColors(cMid, cEdge, (rt - 0.45) / 0.55);
    const sparkle = rng();
    if (sparkle > 0.985) { tmp.set("#cfe6ff"); } // hot blue stars
    else if (sparkle < 0.02) { tmp.offsetHSL(0, 0, -0.12); }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;

    const s = rng();
    sizes[i] = (s > 0.98 ? 2.6 + rng() * 3.2 : 0.55 + rng() * 1.6);
  }
  return { positions, colors, sizes, rands };
}

export function buildGalaxy(spec: GalaxySpec, starCount: number): BuiltGalaxy {
  const rng = mulberry32(spec.seed);
  const group = new THREE.Group();
  group.position.copy(spec.position);
  group.rotation.x = spec.tiltX ?? 0;
  group.rotation.z = spec.tiltZ ?? 0;

  const { positions, colors, sizes, rands } = galaxyData(spec, rng, starCount);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));

  const mat = makeGalaxyMaterial(1, spec.type === "elliptical" ? 0.002 : 0.012);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // Diffuse halo glow
  const haloMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: spec.colorMid ?? new THREE.Color("#d9b98c"),
    transparent: true,
    opacity: spec.type === "elliptical" ? 0.16 : 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(spec.radius * (spec.type === "elliptical" ? 2.6 : 2.1));
  group.add(halo);

  return { group, points, material: mat, update: (t: number) => { mat.uniforms.uTime.value = t; } };
}

/** Deep-sky background: bound to camera so stars never fall behind. */
export function buildDeepField(count: number, radius: number, seed: number): THREE.Points {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const r = radius * (0.75 + rng() * 0.25);
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = s * Math.cos(th) * r;
    positions[i * 3 + 1] = u * r;
    positions[i * 3 + 2] = s * Math.sin(th) * r;
    const m = rng();
    if (m < 0.55) tmp.setHSL(0.6, 0.35, 0.62 + rng() * 0.3);
    else if (m < 0.8) tmp.setHSL(0.1, 0.5, 0.62 + rng() * 0.28);
    else if (m < 0.92) tmp.set("#ffffff");
    else tmp.setHSL(0.02, 0.7, 0.6);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    sizes[i] = rng() > 0.97 ? 2.4 + rng() * 2 : 0.5 + rng() * 1.3;
    rands[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  const mat = makeBackgroundPointsMaterial(1, true);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  (pts.userData as { update?: (t: number) => void }).update = (t: number) => { mat.uniforms.uTime.value = t; };
  return pts;
}

/** Nearby interstellar dust — wraps around the camera giving parallax while flying. */
export function buildDustField(count: number, box: number): { points: THREE.Points; wrap: (cam: THREE.Vector3) => void } {
  const rng = mulberry32(4242);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * box;
    positions[i * 3 + 1] = (rng() - 0.5) * box;
    positions[i * 3 + 2] = (rng() - 0.5) * box;
    const b = 0.35 + rng() * 0.3;
    colors[i * 3] = b * 0.85; colors[i * 3 + 1] = b * 0.9; colors[i * 3 + 2] = b;
    sizes[i] = 0.4 + rng() * 1.1;
    rands[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  const mat = makeGalaxyMaterial(0.55, 0);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const wrap = (cam: THREE.Vector3) => {
    const arr = geo.attributes.position.array as Float32Array;
    const half = box / 2;
    for (let i = 0; i < count; i++) {
      for (let a = 0; a < 3; a++) {
        const axis = a === 0 ? cam.x : a === 1 ? cam.y : cam.z;
        let v = arr[i * 3 + a];
        while (v < axis - half) v += box;
        while (v > axis + half) v -= box;
        arr[i * 3 + a] = v;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { points, wrap };
}
