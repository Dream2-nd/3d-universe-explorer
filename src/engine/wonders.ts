import * as THREE from "three";
import { mulberry32 } from "./utils";
import { getGlowTexture, getNebulaTexture } from "./textures";
import { makeGalaxyMaterial } from "./galaxy";

export interface Wonder { group: THREE.Group; update: (dt: number, t: number) => void; }

// ------------------------------------------------------------------
// BLACK HOLE — warped accretion disk, photon ring, event horizon
// ------------------------------------------------------------------

const DISK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISK_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;               // 0 center → 1 outer edge of square
  float ang = atan(p.y, p.x);
  // swirling streaks
  float swirl = noise(vec2(ang * 3.0 + r * 14.0 - uTime * 2.2, r * 20.0 - uTime * 0.7));
  float streak = noise(vec2(ang * 8.0 - uTime * 3.0 + r * 30.0, r * 8.0));
  float denom = 1.0 - (r - 0.32) * 0.55;
  float heat = clamp(1.0 - (r - 0.34) / 0.66, 0.0, 1.0);
  heat = pow(heat, 1.7);
  vec3 cold = vec3(0.22, 0.05, 0.01);
  vec3 mid = vec3(1.0, 0.38, 0.08);
  vec3 hot = vec3(1.0, 0.95, 0.82);
  vec3 col = mix(cold, mid, smoothstep(0.0, 0.55, heat));
  col = mix(col, hot, smoothstep(0.55, 0.95, heat));
  float alpha = smoothstep(1.0, 0.86, r) * smoothstep(0.30, 0.40, r);
  alpha *= 0.35 + 0.65 * (swirl * 0.7 + streak * 0.3);
  gl_FragColor = vec4(col * (0.7 + heat * 1.8), alpha);
}
`;

export function buildBlackHole(size: number, seed: number): Wonder {
  const group = new THREE.Group();
  const horizonR = size * 0.30;

  // Event horizon
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(horizonR, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(sphere);

  // Photon ring — thin glowing torus
  const ringGeo = new THREE.TorusGeometry(horizonR * 1.06, horizonR * 0.045, 16, 96);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff3da, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const photon = new THREE.Mesh(ringGeo, ringMat);
  photon.rotation.x = Math.PI / 2.25;
  group.add(photon);

  // Warped accretion disk (bend inner region upward for lensed look)
  const diskR = size * 1.5;
  const seg = 190;
  const diskGeo = new THREE.PlaneGeometry(diskR * 2, diskR * 2, seg, seg);
  const pos = diskGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const bend = Math.max(0, 1 - (r - horizonR * 1.1) / (size * 1.1));
    const warp = bend * bend * size * 0.42;
    pos.setZ(i, warp * (r < horizonR * 1.02 ? -0.2 : 1.0));
  }
  diskGeo.computeVertexNormals();
  const diskMat = new THREE.ShaderMaterial({
    vertexShader: DISK_VERT,
    fragmentShader: DISK_FRAG,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.rotation.x = -Math.PI / 2 + 0.42;
  group.add(disk);

  // Ambient glow
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: 0xffa54d, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(size * 5.2);
  group.add(glow);

  const rng = mulberry32(seed);
  void rng;

  return {
    group,
    update: (_dt, t) => {
      diskMat.uniforms.uTime.value = t;
      photon.rotation.z = t * 0.15;
    },
  };
}

// ------------------------------------------------------------------
// PULSAR — lighthouse beams + flicker
// ------------------------------------------------------------------
export function buildPulsar(size: number): Wonder {
  const group = new THREE.Group();
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(size, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff })
  );
  group.add(star);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(size * 6, size * 26, 24, 1, true);
  const beams = new THREE.Group();
  const b1 = new THREE.Mesh(beamGeo, beamMat);
  b1.position.y = size * 14;
  const b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.x = Math.PI;
  b2.position.y = -size * 14;
  beams.add(b1, b2);
  beams.rotation.z = 0.5;
  group.add(beams);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: 0xbfe4ff, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(size * 9);
  group.add(glow);

  return {
    group,
    update: (_dt, t) => {
      beams.rotation.y = t * 2.4;
      glow.material.opacity = 0.55 + Math.abs(Math.sin(t * 22)) * 0.4;
      star.scale.setScalar(1 + Math.abs(Math.sin(t * 22)) * 0.12);
    },
  };
}

// ------------------------------------------------------------------
// SUPERNOVA — expanding shell + flash (simulated, looped)
// ------------------------------------------------------------------
const NOVA_FRAG = /* glsl */ `
uniform float uPulse;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
  vec3 hot = vec3(1.0, 0.96, 0.85);
  vec3 ember = vec3(1.0, 0.45, 0.12);
  vec3 deep = vec3(0.45, 0.08, 0.02);
  vec3 col = mix(hot, ember, uPulse);
  col = mix(col, deep, uPulse * uPulse);
  float a = f * (1.0 - uPulse * 0.85);
  gl_FragColor = vec4(col * (1.3 - uPulse * 0.6), a);
}
`;
const NOVA_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export function buildSupernova(size: number): Wonder {
  const group = new THREE.Group();
  const shellMat = new THREE.ShaderMaterial({
    vertexShader: NOVA_VERT,
    fragmentShader: NOVA_FRAG,
    uniforms: { uPulse: { value: 0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(size, 48, 32), shellMat);
  group.add(shell);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color: 0xffd9a0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
  }));
  group.add(flash);

  const CYCLE = 9;
  return {
    group,
    update: (_dt, t) => {
      const p = (t % CYCLE) / CYCLE;
      shellMat.uniforms.uPulse.value = p;
      shell.scale.setScalar(0.35 + p * 2.6);
      const fl = Math.max(0, 1 - p * 5);
      flash.material.opacity = fl;
      flash.scale.setScalar(size * (2 + (1 - fl) * 14));
    },
  };
}

// ------------------------------------------------------------------
// NEBULA — soft additive point cloud with gentle breathing
// ------------------------------------------------------------------
const NEBULA_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aRand;
uniform float uTime;
uniform float uSizeScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.4 + aRand * 17.0) * 0.04 * length(position);
  p.y += cos(uTime * 0.3 + aRand * 23.0) * 0.03 * length(position);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uSizeScale * (160.0 / max(length(mv.xyz), 0.001));
  gl_PointSize = min(gl_PointSize, 220.0);
  vColor = aColor;
  vAlpha = 0.5 + 0.5 * sin(uTime * 0.6 + aRand * 40.0);
  gl_Position = projectionMatrix * mv;
}
`;
const NEBULA_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, tex.a) * tex * (0.32 + vAlpha * 0.28);
}
`;

export function buildNebula(size: number, seed: number, palette: string[], count = 260): Wonder {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);
  const tmp = new THREE.Color();

  // cluster blobs
  const blobs = 4 + Math.floor(rng() * 3);
  const blobCenters: THREE.Vector3[] = [];
  for (let b = 0; b < blobs; b++) {
    blobCenters.push(new THREE.Vector3(
      (rng() - 0.5) * size * 0.7,
      (rng() - 0.5) * size * 0.5,
      (rng() - 0.5) * size * 0.7
    ));
  }

  for (let i = 0; i < count; i++) {
    const blob = blobCenters[i % blobs];
    positions[i * 3] = blob.x + (rng() - 0.5) * size * 0.55;
    positions[i * 3 + 1] = blob.y + (rng() - 0.5) * size * 0.4;
    positions[i * 3 + 2] = blob.z + (rng() - 0.5) * size * 0.55;
    tmp.set(palette[Math.floor(rng() * palette.length)]);
    tmp.offsetHSL(0, 0, (rng() - 0.5) * 0.15);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    sizes[i] = size * (0.16 + rng() * 0.3);
    rands[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT, fragmentShader: NEBULA_FRAG,
    uniforms: { uTime: { value: 0 }, uSizeScale: { value: 1 }, uMap: { value: getNebulaTexture() } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);

  // bright inner stars for stellar-nursery feel
  const starPts = new THREE.Points(
    (() => {
      const n = 42;
      const g = new THREE.BufferGeometry();
      const pos2 = new Float32Array(n * 3);
      const col2 = new Float32Array(n * 3);
      const siz2 = new Float32Array(n);
      const rnd2 = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos2[i * 3] = (rng() - 0.5) * size * 0.5;
        pos2[i * 3 + 1] = (rng() - 0.5) * size * 0.35;
        pos2[i * 3 + 2] = (rng() - 0.5) * size * 0.5;
        const c = new THREE.Color(rng() > 0.5 ? "#dff1ff" : "#fff5e0");
        col2[i * 3] = c.r; col2[i * 3 + 1] = c.g; col2[i * 3 + 2] = c.b;
        siz2[i] = size * (0.02 + rng() * 0.035);
        rnd2[i] = rng();
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos2, 3));
      g.setAttribute("aColor", new THREE.BufferAttribute(col2, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(siz2, 1));
      g.setAttribute("aRand", new THREE.BufferAttribute(rnd2, 1));
      return g;
    })(),
    (() => { const m = makeGalaxyMaterial(1, 0); m.uniforms.uMap.value = getGlowTexture(); return m; })()
  );
  starPts.frustumCulled = false;
  group.add(starPts);

  return {
    group,
    update: (_dt, t) => {
      mat.uniforms.uTime.value = t;
      (starPts.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    },
  };
}

// ------------------------------------------------------------------
// METEOR SHOWER — looping bright streaks (simulated effect)
// ------------------------------------------------------------------
export function buildMeteorShower(count = 60, extent = 0.012, seed = 90210): Wonder {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);
  interface Meteor { base: THREE.Vector3; dir: THREE.Vector3; phase: number; speed: number; len: number }
  const meteors: Meteor[] = [];
  for (let i = 0; i < count; i++) {
    meteors.push({
      base: new THREE.Vector3((rng() - 0.5) * extent, (rng() - 0.2) * extent * 0.8, (rng() - 0.5) * extent),
      dir: new THREE.Vector3(rng() * 0.6 + 0.4, -(rng() * 0.5 + 0.5), rng() * 0.4).normalize(),
      phase: rng(), speed: 0.25 + rng() * 0.7, len: extent * (0.6 + rng() * 0.8),
    });
    const b = 0.75 + rng() * 0.25;
    colors[i * 3] = b * 0.8; colors[i * 3 + 1] = b * 0.9; colors[i * 3 + 2] = b;
    sizes[i] = 0.0022 + rng() * 0.0024;
    rands[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  const mat = makeGalaxyMaterial(1, 0);
  mat.uniforms.uMap.value = getGlowTexture();
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  group.add(pts);

  return {
    group,
    update: (_dt, t) => {
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const m = meteors[i];
        const p = ((t * m.speed + m.phase) % 1.4) / 1.4; // includes off period
        if (p > 0.85) { arr[i * 3 + 1] = 1e9; continue; } // hidden between fireballs
        const s = (p / 0.85 - 0.5) * m.len * 2;
        arr[i * 3] = m.base.x + m.dir.x * s;
        arr[i * 3 + 1] = m.base.y + m.dir.y * s;
        arr[i * 3 + 2] = m.base.z + m.dir.z * s;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------
// STAR CLUSTER — dense globular cluster point cloud
// ------------------------------------------------------------------
export function buildCluster(radius: number, seed: number, color = "#ffd9a8", count = 900): THREE.Points {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const rands = new Float32Array(count);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rng(), 2.4) * radius;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[i * 3 + 1] = r * Math.cos(ph);
    positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    tmp.set(color).offsetHSL((rng() - 0.5) * 0.06, 0, (rng() - 0.3) * 0.2);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    sizes[i] = 0.4 + rng() * 1.6;
    rands[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  const mat = makeGalaxyMaterial(1, 0.001);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
