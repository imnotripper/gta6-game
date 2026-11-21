// world.js — builds Solace City itself: the ground plan (painted once onto a
// big canvas texture), the tower blocks with lit windows, palms, lamps, neon
// signs, billboards, the harbour water around the island, and the collision
// boxes every other system tests against.

import { CITY, COLORS, blockCenter, roadCenter } from './config.js';
import { rng } from './random.js';

export const colliders = [];   // { minX, maxX, minZ, maxZ, height }
export const cityGroup = new THREE.Group();

const facadeCache = new Map();

function facadeTexture(baseColor, litRatio, seed) {
  const key = `${baseColor}-${litRatio}-${seed}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const local = { s: seed };
  const rand = () => {
    local.s = (local.s * 16807) % 2147483647;
    return local.s / 2147483647;
  };
  const cols = 6;
  const rows = 14;
  const winW = size / cols;
  const winH = (size * 2) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rand() < litRatio;
      const warm = rand() < 0.75;
      g.fillStyle = lit
        ? (warm ? 'rgba(255,196,110,0.95)' : 'rgba(150,225,255,0.95)')
        : 'rgba(12,14,24,0.9)';
      g.fillRect(x * winW + 2, y * winH + 3, winW - 4, winH - 6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  facadeCache.set(key, texture);
  return texture;
}

function groundTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const worldSize = CITY.halfExtent * 2;
  const toPx = (v) => ((v + CITY.halfExtent) / worldSize) * size;
  const scale = size / worldSize;

  g.fillStyle = '#454250';
  g.fillRect(0, 0, size, size);

  // Block interiors (plazas and parking lots under the towers).
  g.fillStyle = '#504c5c';
  for (let i = 0; i < CITY.blocksPerSide; i++) {
    for (let j = 0; j < CITY.blocksPerSide; j++) {
      const x = toPx(blockCenter(i) - CITY.blockSize / 2);
      const z = toPx(blockCenter(j) - CITY.blockSize / 2);
      g.fillRect(x, z, CITY.blockSize * scale, CITY.blockSize * scale);
    }
  }
  // Sidewalk aprons.
  g.fillStyle = '#655f70';
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    const c = toPx(roadCenter(i));
    const w = (CITY.roadWidth + 6) * scale;
    g.fillRect(c - w / 2, 0, w, size);
    g.fillRect(0, c - w / 2, size, w);
  }
  // Asphalt.
  g.fillStyle = '#2e2f38';
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    const c = toPx(roadCenter(i));
    const w = CITY.roadWidth * scale;
    g.fillRect(c - w / 2, 0, w, size);
    g.fillRect(0, c - w / 2, size, w);
  }
  // Lane dashes.
  g.strokeStyle = 'rgba(255,209,102,0.75)';
  g.lineWidth = 2;
  g.setLineDash([18, 22]);
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    const c = toPx(roadCenter(i));
    g.beginPath(); g.moveTo(c, 0); g.lineTo(c, size); g.stroke();
    g.beginPath(); g.moveTo(0, c); g.lineTo(size, c); g.stroke();
  }
  g.setLineDash([]);
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(230,230,235,0.5)';
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    for (let j = 0; j <= CITY.blocksPerSide; j++) {
      const cx = toPx(roadCenter(i));
      const cz = toPx(roadCenter(j));
      const w = CITY.roadWidth * scale;
      for (let s = -3; s <= 3; s++) {
        g.fillRect(cx - w / 2 + 2, cz + s * 6 - 2, 10, 4);
        g.fillRect(cx + w / 2 - 12, cz + s * 6 - 2, 10, 4);
        g.fillRect(cx + s * 6 - 2, cz - w / 2 + 2, 4, 10);
        g.fillRect(cx + s * 6 - 2, cz + w / 2 - 12, 4, 10);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

const BUILDING_TONES = ['#5b4a68', '#4a5a75', '#6b5570', '#3f4a63', '#715f52', '#54606e', '#63455e'];
const NEON_SIGNS = [
  { text: 'SOLACE', color: '#ff2e88' },
  { text: 'HOTEL MARINA', color: '#22d3ee' },
  { text: 'NEON HARBOR', color: '#ffb02e' },
  { text: 'CLUB VELVET', color: '#c084fc' },
  { text: 'DINER 24H', color: '#4ade80' },
  { text: 'PALMS CASINO', color: '#ff5d5d' },
];

function signTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(8,6,16,0.92)';
  g.fillRect(0, 0, 512, 96);
  g.font = 'bold 54px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 256, 52);
  g.shadowBlur = 8;
  g.fillText(text, 256, 52);
  return new THREE.CanvasTexture(canvas);
}

function buildBuildings() {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let signIndex = 0;
  for (let i = 0; i < CITY.blocksPerSide; i++) {
    for (let j = 0; j < CITY.blocksPerSide; j++) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const downtown = Math.hypot(i - 4, j - 4) < 2.6;
      const towers = rng.int(2, downtown ? 4 : 3);
      for (let t = 0; t < towers; t++) {
        const w = rng.range(13, 24);
        const d = rng.range(13, 24);
        const h = downtown ? rng.range(38, 95) : rng.range(12, 42);
        const x = cx + rng.range(-1, 1) * (CITY.blockSize / 2 - w / 2 - 3);
        const z = cz + rng.range(-1, 1) * (CITY.blockSize / 2 - d / 2 - 3);
        const tone = rng.pick(BUILDING_TONES);
        const baseTexture = facadeTexture(tone, downtown ? 0.5 : 0.34, rng.int(1, 99999));
        // Repeat the window grid so windows stay window-sized on any tower.
        const texture = baseTexture.clone();
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(Math.max(1, Math.round(w / 15)), Math.max(1, Math.round(h / 30)));
        texture.needsUpdate = true;
        const material = new THREE.MeshLambertMaterial({
          map: texture,
          emissive: 0xd99a55,
          emissiveMap: texture,
          emissiveIntensity: 0.38,
        });
        const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2c2833 });
        const mesh = new THREE.Mesh(boxGeo, [material, material, roofMaterial, roofMaterial, material, material]);
        mesh.position.set(x, h / 2, z);
        mesh.scale.set(w, h, d);
        cityGroup.add(mesh);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });

        // Rooftop water tower or antenna on the taller towers.
        if (h > 55 && rng.chance(0.6)) {
          const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.3, 9, 5),
            new THREE.MeshLambertMaterial({ color: 0x888899 }),
          );
          antenna.position.set(x, h + 4.5, z);
          cityGroup.add(antenna);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xff3344 }),
          );
          beacon.position.set(x, h + 9.2, z);
          beacon.name = 'beacon';
          cityGroup.add(beacon);
        }

        // A neon sign on street-facing towers near the middle of town.
        if (downtown && rng.chance(0.4) && signIndex < NEON_SIGNS.length * 3) {
          const sign = NEON_SIGNS[signIndex % NEON_SIGNS.length];
          signIndex++;
          const signMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 3),
            new THREE.MeshBasicMaterial({ map: signTexture(sign.text, sign.color), transparent: true }),
          );
          const faceSouth = rng.chance(0.5);
          if (faceSouth) {
            signMesh.position.set(x, Math.min(h - 4, 16), z + d / 2 + 0.15);
          } else {
            signMesh.rotation.y = Math.PI / 2;
            signMesh.position.set(x + w / 2 + 0.15, Math.min(h - 4, 16), z);
          }
          cityGroup.add(signMesh);
        }
      }
    }
  }
}

function buildPalmsAndLamps() {
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6);
  const frondGeo = new THREE.ConeGeometry(1.7, 0.65, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3da35f });
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const bulbGeo = new THREE.SphereGeometry(0.32, 6, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

  const spots = [];
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    for (let s = -CITY.halfExtent + 20; s < CITY.halfExtent; s += 40) {
      spots.push({ x: roadCenter(i) + CITY.roadWidth / 2 + 2.4, z: s, lamp: true });
      spots.push({ x: s, z: roadCenter(i) - CITY.roadWidth / 2 - 2.4, lamp: true });
      if (rng.chance(0.55)) spots.push({ x: roadCenter(i) - CITY.roadWidth / 2 - 2.6, z: s + 17, palm: true });
      if (rng.chance(0.55)) spots.push({ x: s + 23, z: roadCenter(i) + CITY.roadWidth / 2 + 2.6, palm: true });
    }
  }
  for (const spot of spots) {
    if (spot.lamp) {
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(spot.x, 2.8, spot.z);
      cityGroup.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(spot.x, 5.7, spot.z);
      cityGroup.add(bulb);
    } else {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(spot.x, 2.7, spot.z);
      trunk.rotation.z = rng.range(-0.06, 0.06);
      cityGroup.add(trunk);
      const fronds = new THREE.Mesh(frondGeo, frondMat);
      fronds.position.set(spot.x, 5.75, spot.z);
      fronds.rotation.x = Math.PI;
      cityGroup.add(fronds);
      const frondsTop = new THREE.Mesh(frondGeo, frondMat);
      frondsTop.position.set(spot.x, 6.15, spot.z);
      frondsTop.rotation.x = Math.PI;
      frondsTop.rotation.y = 0.6;
      frondsTop.scale.setScalar(0.7);
      cityGroup.add(frondsTop);
      colliders.push({ minX: spot.x - 0.4, maxX: spot.x + 0.4, minZ: spot.z - 0.4, maxZ: spot.z + 0.4, height: 5 });
    }
  }
}

function buildHarbor() {
  // The island sits in a bay: open water on every side, a boardwalk rim.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshLambertMaterial({ color: 0x14425e }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  water.name = 'water';
  cityGroup.add(water);

  // The rim's top sits 0.2 m below the street plane: coplanar faces would
  // z-fight and the sand would swallow the road markings from some angles.
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(CITY.halfExtent * 2 + 26, 1.1, CITY.halfExtent * 2 + 26),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5e }),
  );
  rim.position.y = -0.75;
  cityGroup.add(rim);

  // A small marina of moored boats on the south shore.
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  const accentMats = [0xff2e88, 0x22d3ee, 0xffb02e, 0x4ade80].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  for (let b = 0; b < 12; b++) {
    const x = -286 + b * 52 + rng.range(-8, 8);
    const z = CITY.halfExtent + 34 + rng.range(-4, 6);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 11), hullMat);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 4), rng.pick(accentMats));
    cabin.position.set(0, 1.6, -1);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8, 5), hullMat);
    mast.position.set(0, 4.6, 1.5);
    boat.add(mast);
    boat.position.set(x, 0, z);
    boat.rotation.y = rng.range(-0.2, 0.2);
    cityGroup.add(boat);
  }
}

// True when the point is on asphalt (used by traffic and spawning).
export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2;
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    const c = roadCenter(i);
    if (Math.abs(x - c) <= half || Math.abs(z - c) <= half) return true;
  }
  return false;
}

// Push a circle (x, z, radius) out of every building box it overlaps.
export function collideCircle(x, z, radius) {
  for (const box of colliders) {
    const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - nearestX;
    const dz = z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        x = nearestX + (dx / dist) * radius;
        z = nearestZ + (dz / dist) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = x - box.minX;
        const right = box.maxX - x;
        const top = z - box.minZ;
        const bottom = box.maxZ - z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) x = box.minX - radius;
        else if (min === right) x = box.maxX + radius;
        else if (min === top) z = box.minZ - radius;
        else z = box.maxZ + radius;
      }
    }
  }
  const limit = CITY.halfExtent + 10;
  x = Math.max(-limit, Math.min(x, limit));
  z = Math.max(-limit, Math.min(z, limit));
  return { x, z };
}

export function buildWorld(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfExtent * 2, CITY.halfExtent * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  cityGroup.add(ground);

  buildBuildings();
  buildPalmsAndLamps();
  buildHarbor();
  scene.add(cityGroup);
  return cityGroup;
}
