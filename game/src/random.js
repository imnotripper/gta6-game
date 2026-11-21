// random.js — a small seeded random number generator (mulberry32) plus the
// picking helpers the city builder uses. Seeding keeps Solace City identical
// on every load, which keeps screenshots and playtests reproducible.

export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    spread: (center, amount) => center + (next() * 2 - 1) * amount,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// The one city-wide generator, seeded from the URL (?seed=) or a fixed value.
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
export const rng = makeRng(Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : 20261124);

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-path angle interpolation, for steering and camera work.
export function angleLerp(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function distance2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}
