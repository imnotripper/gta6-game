// player.js — Rico Vane, the player character: third-person walking and
// sprinting, climbing into any car in the city and driving it, fists and a
// pistol, health and armour. The game loop in main.js feeds this module the
// camera yaw and reads back where the action is.

import { PLAYER } from './config.js';
import { angleLerp, clamp, distance2d } from './random.js';
import { collideCircle } from './world.js';
import { makePersonMesh, nearestPedestrian, hurtPedestrian, scarePedestrians, pedestrians } from './pedestrians.js';
import { allCars, driveCar } from './vehicles.js';
import { sfx } from './audio.js';
import { keys } from './input.js';

export const player = {
  mesh: null,
  heading: Math.PI,
  speed: 0,
  health: PLAYER.maxHealth,
  armor: 0,
  cash: PLAYER.startCash,
  car: null,              // the car being driven, or null on foot
  hasPistol: false,
  fireCooldown: 0,
  punchCooldown: 0,
  walkPhase: 0,
  dead: false,
  // Set by the crime witnesses in main.js: (type) => void
  onCrime: null,
  // Set by main.js to spawn the muzzle flash / tracer visuals.
  onShoot: null,
};

export function buildPlayer(scene) {
  player.mesh = makePersonMesh({ shirt: 0xff2e88, pants: 0x23232e, skin: 0xc68863, hat: 0x181a20 });
  player.mesh.position.set(PLAYER.start.x, 0, PLAYER.start.z);
  player.heading = PLAYER.start.heading;
  scene.add(player.mesh);
  return player;
}

export function playerPosition() {
  if (player.car) return player.car.mesh.position;
  return player.mesh.position;
}

export function isDriving() {
  return player.car !== null;
}

export function nearestCar(x, z, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of allCars) {
    const d = distance2d(x, z, car.mesh.position.x, car.mesh.position.z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(car) {
  const wasParkedOrTraffic = car.mode === 'parked' || car.mode === 'traffic';
  player.car = car;
  car.mode = 'player';
  car.speed = car.speed || 0;
  player.mesh.visible = false;
  sfx.door();
  // Taking a car that is not yours is the city's most common first crime.
  if (player.onCrime && wasParkedOrTraffic) player.onCrime('stealCar');
}

export function exitCar() {
  const car = player.car;
  if (!car) return;
  const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  const pos = car.mesh.position;
  player.mesh.position.set(pos.x + side.x * 2.4, 0, pos.z + side.z * 2.4);
  const fixed = collideCircle(player.mesh.position.x, player.mesh.position.z, PLAYER.radius);
  player.mesh.position.x = fixed.x;
  player.mesh.position.z = fixed.z;
  player.heading = car.heading;
  player.mesh.visible = true;
  car.mode = Math.abs(car.speed) > 0.5 ? 'traffic' : 'parked';
  car.target = null;
  player.car = null;
  sfx.door();
}

function crime(type) {
  if (player.onCrime) player.onCrime(type);
}

export function updatePlayerOnFoot(dt, cameraYaw, firing) {
  const pos = player.mesh.position;
  const forward = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
  const right = { x: -Math.cos(cameraYaw), z: Math.sin(cameraYaw) };
  let mx = 0;
  let mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += forward.x; mz += forward.z; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= forward.x; mz -= forward.z; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += right.x; mz += right.z; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= right.x; mz -= right.z; }
  const moving = Math.hypot(mx, mz) > 0.01;
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const wantSpeed = moving ? (sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    player.heading = angleLerp(player.heading, targetHeading, clamp(dt * 11, 0, 1));
  }
  player.speed += clamp(wantSpeed - player.speed, -30 * dt, 18 * dt);
  pos.x += Math.sin(player.heading) * player.speed * dt * (moving ? 1 : 0.2);
  pos.z += Math.cos(player.heading) * player.speed * dt * (moving ? 1 : 0.2);
  const fixed = collideCircle(pos.x, pos.z, PLAYER.radius);
  pos.x = fixed.x;
  pos.z = fixed.z;
  player.mesh.rotation.y = player.heading;
  player.walkPhase += dt * (2 + Math.abs(player.speed) * 1.7);
  animateBody(dt);

  // Fists: a short-range swing on click or F.
  player.punchCooldown -= dt;
  if ((firing || keys.has('KeyF')) && player.punchCooldown <= 0 && !player.hasPistol) {
    player.punchCooldown = 0.38;
    sfx.punch();
    swingArm();
    const target = nearestPedestrian(pos.x + Math.sin(player.heading) * 1.1, pos.z + Math.cos(player.heading) * 1.1, 1.7);
    if (target) {
      hurtPedestrian(target, 26, pos.x, pos.z);
      sfx.hit();
      crime('hitPed');
    }
  }

  // Pistol: hitscan along the camera aim.
  player.fireCooldown -= dt;
  if (firing && player.hasPistol && player.fireCooldown <= 0) {
    player.fireCooldown = 0.24;
    firePistol(cameraYaw);
  }
}

function animateBody(dt) {
  const parts = player.mesh.userData.parts;
  if (!parts) return;
  const swing = Math.sin(player.walkPhase) * clamp(Math.abs(player.speed) * 0.15, 0, 0.7);
  parts.legs[0].rotation.x = swing;
  parts.legs[1].rotation.x = -swing;
  parts.arms[0].rotation.x = -swing * 0.8;
  parts.arms[1].rotation.x = swing * 0.8;
  player.mesh.position.y = Math.abs(Math.sin(player.walkPhase)) * 0.04;
}

function swingArm() {
  const parts = player.mesh.userData.parts;
  if (parts) parts.arms[1].rotation.x = -1.9;
}

function firePistol(cameraYaw) {
  const pos = player.mesh.position;
  sfx.gunshot();
  scarePedestrians(pos.x, pos.z, 26);
  crime('shoot');
  player.heading = cameraYaw;
  player.mesh.rotation.y = cameraYaw;
  const dirX = Math.sin(cameraYaw);
  const dirZ = Math.cos(cameraYaw);
  if (player.onShoot) player.onShoot(pos.x, pos.z, cameraYaw);

  // Nearest pedestrian within a narrow cone up to 42 m takes the hit.
  let bestPed = null;
  let bestAlong = 42;
  for (const ped of pedestrians) {
    if (ped.state === 'down') continue;
    const px = ped.mesh.position.x - pos.x;
    const pz = ped.mesh.position.z - pos.z;
    const along = px * dirX + pz * dirZ;
    const across = Math.abs(px * dirZ - pz * dirX);
    if (along > 0 && along < bestAlong && across < 1.1) {
      bestPed = ped;
      bestAlong = along;
    }
  }
  if (bestPed) {
    hurtPedestrian(bestPed, 55, pos.x, pos.z);
    sfx.hit();
    crime('hitPed');
    return;
  }
  // Otherwise the shot may strike a car.
  for (const car of allCars) {
    const cx = car.mesh.position.x - pos.x;
    const cz = car.mesh.position.z - pos.z;
    const along = cx * dirX + cz * dirZ;
    const across = Math.abs(cx * dirZ - cz * dirX);
    if (along > 0 && along < 42 && across < 2.2) {
      car.health -= 18;
      sfx.hit();
      crime('shootCar');
      scarePedestrians(car.mesh.position.x, car.mesh.position.z, 18);
      return;
    }
  }
}

export function updatePlayerDriving(dt) {
  const car = player.car;
  const input = {
    throttle: 0,
    steer: 0,
    brake: false,
  };
  if (keys.has('KeyW') || keys.has('ArrowUp')) input.throttle = 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) input.throttle = -1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) input.steer = 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) input.steer = -1;
  input.brake = keys.has('Space');
  const impact = driveCar(car, input, dt);
  if (impact > 9) {
    sfx.crash(Math.min(1, impact / 26));
    if (impact > 16) hurtPlayer(6, 'crash');
  }
  return input;
}

export function hurtPlayer(amount, cause = 'hit') {
  if (player.dead) return;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * 0.7);
    player.armor -= absorbed;
    amount -= absorbed;
  }
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
  }
}

export function healPlayer(amount) {
  player.health = clamp(player.health + amount, 0, PLAYER.maxHealth);
}

export function respawnPlayer(x, z) {
  if (player.car) {
    player.car.mode = 'parked';
    player.car = null;
  }
  player.mesh.visible = true;
  player.mesh.position.set(x, 0, z);
  player.health = PLAYER.maxHealth;
  player.dead = false;
  player.speed = 0;
}
