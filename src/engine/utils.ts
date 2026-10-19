// Deterministic RNG + math helpers shared across the engine.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng: () => number) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export const isMobile = () =>
  typeof window !== "undefined" &&
  (window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

export const isCoarsePointer = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Quality tier: 0 low (mobile), 1 medium, 2 high */
export function qualityTier(): 0 | 1 | 2 {
  const mobile = isMobile();
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
  const mem = (typeof navigator !== "undefined" && (navigator as any).deviceMemory) || 4;
  if (mobile || cores <= 2 || mem <= 2) return 0;
  if (cores >= 8 && mem >= 8) return 2;
  return 1;
}

/** Simple seeded 2D value-noise field with fbm, used by canvas textures. */
export class ValueNoise {
  private perm: Uint8Array;
  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private hash(x: number, y: number) {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }
  noise(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const aa = this.hash(xi, yi), ab = this.hash(xi + 1, yi);
    const ba = this.hash(xi, yi + 1), bb = this.hash(xi + 1, yi + 1);
    return lerp(lerp(aa, ab, u), lerp(ba, bb, u), v);
  }
  fbm(x: number, y: number, octaves = 4, lac = 2.02, gain = 0.5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lac;
    }
    return sum / norm;
  }
}

export function formatDistance(worldUnits: number): string {
  // World scale reference: Milky Way radius 34 world units ≈ 52,850 ly → 1 unit ≈ 1554.4 ly
  // Solar scale reference: 1 AU = 0.03 units
  const ua = Math.abs(worldUnits);
  if (ua < 0.05) {
    const km = (ua / 0.03) * 1.496e8;
    if (km < 1e6) return `${Math.round(km).toLocaleString()} km`;
    return `${(km / 1e6).toFixed(2)} million km`;
  }
  if (ua < 2) return `${(ua / 0.03).toFixed(2)} AU`;
  const ly = ua * 1554.4;
  if (ly < 1000) return `${ly.toFixed(0)} ly`;
  if (ly < 1e6) return `${(ly / 1000).toFixed(1)}k ly`;
  return `${(ly / 1e6).toFixed(2)} Mly`;
}

export function viewScaleLabel(d: number): { tier: string; dist: string } {
  if (d < 0.06) return { tier: "SURFACE / INNER ORBIT", dist: formatDistance(d) };
  if (d < 2) return { tier: "SOLAR SYSTEM SCALE", dist: formatDistance(d) };
  if (d < 60) return { tier: "INTERSTELLAR SCALE", dist: formatDistance(d) };
  if (d < 500) return { tier: "GALACTIC SCALE", dist: formatDistance(d) };
  return { tier: "INTERGALACTIC SCALE", dist: formatDistance(d) };
}
