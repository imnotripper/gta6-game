// police.js — the Solace City PD: a heat-based wanted level, cruisers that
// hunt the player across the grid, officers who shoot at higher stars, and
// the bust meter that fills when the law corners you.

import { CITY, WANTED } from './config.js';
import { clamp, distance2d, rng } from './random.js';
import { spawnCar, driveCar, allCars } from './vehicles.js';
import { hurtPlayer, playerPosition, isDriving, player } from './player.js';
import { sfx, setSiren } from './audio.js';

export const police = {
  heat: 0,               // 0..5.x, stars are ceil(heat)
  stars: 0,
  units: [],             // police car objects
  bustMeter: 0,          // 0..1
  timeSinceCrime: 99,
  scene: null,
  onBusted: null,        // set by main.js
  shootTimer: 0,
  flashTimer: 0,
};

export function initPolice(scene) {
  police.scene = scene;
}

export function addCrime(type) {
  const amount = WANTED.crimes[type] || 0.3;
  const before = police.stars;
  police.heat = clamp(police.heat + amount, 0, 5.6);
  police.timeSinceCrime = 0;
  updateStars();
  if (police.stars > before) sfx.wantedUp();
}

export function addHeat(amount) {
  police.heat = clamp(police.heat + amount, 0, 5.6);
  police.timeSinceCrime = 0;
  updateStars();
}

export function clearWanted() {
  police.heat = 0;
  police.stars = 0;
  police.bustMeter = 0;
  for (const unit of police.units) {
    unit.mode = 'traffic';
    unit.police = false;
    unit.target = null;
  }
  police.units = [];
  setSiren(false);
}

function updateStars() {
  police.stars = police.heat <= 0.05 ? 0 : Math.min(WANTED.maxStars, Math.ceil(police.heat));
}

function spawnPointNear(x, z) {
  // Cruisers roll in from a road a few blocks away, never on top of the player.
  for (let tries = 0; tries < 12; tries++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(85, 130);
    const sx = clamp(x + Math.sin(angle) * dist, -CITY.halfExtent + 16, CITY.halfExtent - 16);
    const sz = clamp(z + Math.cos(angle) * dist, -CITY.halfExtent + 16, CITY.halfExtent - 16);
    if (distance2d(sx, sz, x, z) > 60) return { x: sx, z: sz };
  }
  return { x: clamp(x + 100, -340, 340), z: clamp(z + 100, -340, 340) };
}

function maintainUnits(playerPos) {
  const wanted = WANTED.policeByStars[police.stars] || 0;
  while (police.units.length < wanted) {
    const point = spawnPointNear(playerPos.x, playerPos.z);
    const unit = spawnCar(police.scene, {
      x: point.x,
      z: point.z,
      heading: Math.atan2(playerPos.x - point.x, playerPos.z - point.z),
      police: true,
      mode: 'police',
    });
    unit.speed = 8;
    police.units.push(unit);
  }
  while (police.units.length > wanted) {
    const unit = police.units.pop();
    unit.mode = 'traffic';
    unit.police = false;
    unit.target = null;
    // Strip the light bar's police behaviour by leaving the mesh as a plain
    // cruiser that now just drives in traffic.
    const idx = allCars.indexOf(unit);
    if (idx >= 0) allCars.splice(idx, 1);
    police.scene.remove(unit.mesh);
  }
}

export function updatePolice(dt) {
  const pos = playerPosition();
  police.timeSinceCrime += dt;

  // Heat cools when the player keeps their head down and no cruiser is near.
  if (police.stars > 0) {
    let seen = false;
    for (const unit of police.units) {
      if (distance2d(unit.mesh.position.x, unit.mesh.position.z, pos.x, pos.z) < 46) seen = true;
    }
    if (!seen && police.timeSinceCrime > 4) {
      police.heat = Math.max(0, police.heat - WANTED.decayPerSecond * dt * (police.timeSinceCrime > 12 ? 2.2 : 1));
      updateStars();
    }
  }

  maintainUnits(pos);
  let nearestDist = Infinity;

  for (const unit of police.units) {
    const upos = unit.mesh.position;
    const dist = distance2d(upos.x, upos.z, pos.x, pos.z);
    nearestDist = Math.min(nearestDist, dist);

    // Aim a little ahead of a moving player so chases cut corners.
    const lead = isDriving() ? clamp(player.car.speed * 0.35, -8, 14) : 0;
    const aimX = pos.x + (isDriving() ? Math.sin(player.car.heading) * lead : 0);
    const aimZ = pos.z + (isDriving() ? Math.cos(player.car.heading) * lead : 0);
    const desired = Math.atan2(aimX - upos.x, aimZ - upos.z);
    let diff = desired - unit.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.4, -1, 1);
    let throttle = 1;
    if (dist < 7 && !isDriving()) throttle = 0.2;         // pull up beside a runner
    if (dist < 4 && isDriving() && Math.abs(player.car.speed) < 2) throttle = 0;
    driveCar(unit, { throttle, steer, brake: dist < 3 && isDriving() }, dt);

    // Flash the light bar.
    const bar = unit.mesh.userData.lightBar;
    if (bar) {
      police.flashTimer += dt;
      const phase = Math.sin(police.flashTimer * 19 + unit.mesh.position.x) > 0;
      bar.red.material.color.setHex(phase ? 0xff2244 : 0x55101c);
      bar.blue.material.color.setHex(phase ? 0x11255c : 0x2266ff);
    }
  }

  // Siren volume follows the closest cruiser.
  if (police.units.length > 0) {
    setSiren(true, clamp(1 - nearestDist / 70, 0, 1) * 0.14);
  } else {
    setSiren(false);
  }

  // Officers open fire at three stars and up.
  police.shootTimer -= dt;
  if (police.stars >= 3 && nearestDist < 30 && police.shootTimer <= 0) {
    police.shootTimer = rng.range(0.5, 1.1);
    sfx.gunshot();
    const hitChance = isDriving() ? 0.34 : 0.5;
    if (rng.chance(hitChance)) hurtPlayer(rng.range(3, 8), 'shot');
  }

  // The bust meter: cornered on foot, or pinned in a car, and it fills.
  let cornered = false;
  if (police.stars > 0) {
    if (!isDriving() && nearestDist < 4.2) cornered = true;
    if (isDriving() && Math.abs(player.car.speed) < 1.6 && nearestDist < 8) cornered = true;
  }
  police.bustMeter = clamp(police.bustMeter + (cornered ? dt / 2.4 : -dt / 1.6), 0, 1);
  if (police.bustMeter >= 1 && police.onBusted) {
    police.onBusted();
  }
}

export function policeBlips() {
  return police.units.map((unit) => ({
    x: unit.mesh.position.x,
    z: unit.mesh.position.z,
    heading: unit.heading,
    kind: 'police',
  }));
}
