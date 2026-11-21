// pedestrians.js — the people of Solace City. Low-poly walkers who stroll the
// sidewalks, cross at corners, run from gunfire and fast cars, and fall when
// they are hit. Mission characters are spawned through the same factory.

import { CITY, roadCenter } from './config.js';
import { angleLerp, clamp, distance2d, rng } from './random.js';
import { collideCircle } from './world.js';

export const pedestrians = [];

const SKIN_TONES = [0xe8b98d, 0xc68863, 0x8d5524, 0xf1c27d, 0x6b4423];
const SHIRT_COLORS = [0xff5d5d, 0x4ade80, 0x60a5fa, 0xfacc15, 0xf472b6, 0xe8e4da, 0x2dd4bf, 0xfb923c, 0x94a3b8, 0x818cf8];
const PANTS_COLORS = [0x2b3446, 0x4a3b2c, 0x1f2937, 0x5b4a68, 0x374151, 0x715f52];

export function makePersonMesh({ shirt, pants, skin, hat = null } = {}) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt ?? rng.pick(SHIRT_COLORS) });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants ?? rng.pick(PANTS_COLORS) });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin ?? rng.pick(SKIN_TONES) });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), shirtMat);
  torso.position.y = 1.08;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 7), skinMat);
  head.position.y = 1.66;
  group.add(head);
  if (hat) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.12, 8), new THREE.MeshLambertMaterial({ color: hat }));
    cap.position.y = 1.82;
    group.add(cap);
  }
  const legs = [];
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.74, 0.22), pantsMat);
    leg.geometry.translate(0, -0.37, 0);
    leg.position.set(sx, 0.74, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-0.35, 0.35]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.18), shirtMat);
    arm.geometry.translate(0, -0.28, 0);
    arm.position.set(sx, 1.36, 0);
    group.add(arm);
    arms.push(arm);
  }
  group.userData.parts = { legs, arms, torso, head };
  return group;
}

export function spawnPedestrian(scene, { x, z, heading = 0, outfit = {}, stationary = false, name = null } = {}) {
  const mesh = makePersonMesh(outfit);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const ped = {
    mesh,
    heading,
    speed: 0,
    state: stationary ? 'stand' : 'walk',   // walk | flee | down | stand
    target: null,
    health: 60,
    name,
    walkPhase: rng.range(0, Math.PI * 2),
    downTimer: 0,
    fleeFrom: null,
    fleeTimer: 0,
    panic: 0,
  };
  pedestrians.push(ped);
  return ped;
}

// A point on a sidewalk: beside a road, somewhere along it.
function sidewalkPoint() {
  const alongX = rng.chance(0.5);
  const roadIndex = rng.int(0, CITY.blocksPerSide);
  const t = rng.range(-CITY.halfExtent + 12, CITY.halfExtent - 12);
  const offset = (CITY.roadWidth / 2 + 2.2) * rng.sign();
  if (alongX) return { x: t, z: roadCenter(roadIndex) + offset };
  return { x: roadCenter(roadIndex) + offset, z: t };
}

export function seedPedestrians(scene, count) {
  const made = [];
  for (let n = 0; n < count; n++) {
    const point = sidewalkPoint();
    const ped = spawnPedestrian(scene, { x: point.x, z: point.z, heading: rng.range(0, Math.PI * 2) });
    made.push(ped);
  }
  return made;
}

export function scarePedestrians(x, z, radius) {
  for (const ped of pedestrians) {
    if (ped.state === 'down') continue;
    if (distance2d(ped.mesh.position.x, ped.mesh.position.z, x, z) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, z };
      ped.fleeTimer = rng.range(2.2, 4.5);
      ped.panic = 1;
    }
  }
}

export function hurtPedestrian(ped, amount, fromX, fromZ) {
  ped.health -= amount;
  if (ped.health <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.downTimer = rng.range(6, 11);
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  } else if (ped.state !== 'down') {
    ped.state = 'flee';
    ped.fleeFrom = { x: fromX, z: fromZ };
    ped.fleeTimer = 3.5;
    ped.panic = 1;
  }
}

function animatePed(ped, dt) {
  const { legs, arms } = ped.mesh.userData.parts;
  const swing = Math.sin(ped.walkPhase) * clamp(Math.abs(ped.speed) * 0.16, 0, 0.75);
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.8;
  arms[1].rotation.x = swing * 0.8;
  ped.mesh.position.y = ped.state === 'down' ? 0.25 : Math.abs(Math.sin(ped.walkPhase)) * 0.05;
}

export function updatePedestrian(ped, dt) {
  const pos = ped.mesh.position;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'flee';
      ped.fleeTimer = 2;
      ped.health = 40;
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = 0;
    }
    return;
  }
  if (ped.state === 'stand') {
    ped.speed = 0;
    animatePed(ped, dt);
    return;
  }

  let wantSpeed = 1.5;
  if (ped.state === 'flee') {
    wantSpeed = 5.6;
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0 || !ped.fleeFrom) {
      ped.state = 'walk';
      ped.target = null;
      ped.panic = 0;
    } else {
      const away = Math.atan2(pos.x - ped.fleeFrom.x, pos.z - ped.fleeFrom.z);
      ped.heading = angleLerp(ped.heading, away, clamp(dt * 5, 0, 1));
    }
  }
  if (ped.state === 'walk') {
    if (!ped.target || distance2d(pos.x, pos.z, ped.target.x, ped.target.z) < 1.6) {
      ped.target = sidewalkPoint();
    }
    const desired = Math.atan2(ped.target.x - pos.x, ped.target.z - pos.z);
    ped.heading = angleLerp(ped.heading, desired, clamp(dt * 3, 0, 1));
  }

  ped.speed += clamp(wantSpeed - ped.speed, -8 * dt, 4 * dt);
  pos.x += Math.sin(ped.heading) * ped.speed * dt;
  pos.z += Math.cos(ped.heading) * ped.speed * dt;
  const fixed = collideCircle(pos.x, pos.z, 0.45);
  pos.x = fixed.x;
  pos.z = fixed.z;
  ped.mesh.rotation.y = ped.heading;
  ped.walkPhase += dt * (2 + Math.abs(ped.speed) * 1.6);
  animatePed(ped, dt);
}

export function updatePedestrians(dt) {
  for (const ped of pedestrians) updatePedestrian(ped, dt);
}

export function nearestPedestrian(x, z, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const ped of pedestrians) {
    if (ped.state === 'down') continue;
    const d = distance2d(x, z, ped.mesh.position.x, ped.mesh.position.z);
    if (d < bestDist) {
      bestDist = d;
      best = ped;
    }
  }
  return best;
}
