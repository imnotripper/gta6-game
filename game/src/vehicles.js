// vehicles.js — the cars of Solace City: a low-poly car factory, the parked
// cars along the curbs, and the traffic system that drives the rest around
// the grid on right-hand lanes, turning at intersections and braking for
// whatever is in the way.

import { CAR, CITY, roadCenter } from './config.js';
import { angleLerp, clamp, distance2d, rng } from './random.js';
import { collideCircle } from './world.js';
import { sfx } from './audio.js';

export const allCars = [];

export const CAR_MODELS = [
  { name: 'Vireo Hatch', topSpeed: 34, colors: [0xc23b4e, 0x3b6ec2, 0xd8d8dc, 0x3f4652, 0x7ac74f] },
  { name: 'Kestrel GT', topSpeed: 47, colors: [0xffb02e, 0xff2e88, 0x22242c, 0xb8bfcc] },
  { name: 'Marlin Sedan', topSpeed: 38, colors: [0x5b8c5a, 0x8a93a6, 0x63393f, 0x2e4a6b] },
  { name: 'Bayside Wagon', topSpeed: 36, colors: [0xd97b2f, 0x4f7a8a, 0x9c8a70, 0x707880] },
  { name: 'Hauler Pickup', topSpeed: 33, colors: [0x946b4a, 0x596e57, 0xa33f2e, 0x445566] },
];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a3a });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x2a2c33 });

export function makeCarMesh(color, { police = false, sport = false } = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf2f3f5 : color });
  const darkPaint = new THREE.MeshLambertMaterial({ color: police ? 0x181a20 : color });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), paint);
  body.position.y = 0.55;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.34, 0.9), darkPaint);
  nose.position.set(0, 0.48, 2.35);
  group.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.52, sport ? 1.9 : 2.2), glassMat);
  cabin.position.set(0, 1.05, sport ? -0.25 : -0.1);
  group.add(cabin);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 0.7), darkPaint);
  trunk.position.set(0, 0.72, -2.05);
  group.add(trunk);
  if (sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.42), trimMat);
    spoiler.position.set(0, 1.12, -2.25);
    group.add(spoiler);
  }
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  for (const sx of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
    head.position.set(sx, 0.62, 2.82);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.06), tailMat);
    tail.position.set(sx, 0.72, -2.42);
    group.add(tail);
  }
  const wheelPositions = [
    [-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45],
  ];
  const wheels = [];
  for (const [wx, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  if (police) {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), trimMat);
    base.position.y = 0.06;
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    red.position.set(-0.33, 0.2, 0);
    bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.44), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.33, 0.2, 0);
    bar.add(blue);
    bar.position.set(0, 1.36, -0.1);
    group.add(bar);
    group.userData.lightBar = { red, blue };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.2, 4.32), new THREE.MeshLambertMaterial({ color: 0x2456a8 }));
    stripe.position.y = 0.42;
    group.add(stripe);
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(scene, { x, z, heading, model = null, police = false, mode = 'traffic' }) {
  const chosen = model || rng.pick(CAR_MODELS);
  const color = rng.pick(chosen.colors);
  const mesh = makeCarMesh(color, { police, sport: chosen.name === 'Kestrel GT' });
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = {
    mesh,
    model: chosen,
    heading,
    speed: 0,
    mode,
    police,
    health: 100,
    target: null,
    waitTimer: 0,
    honkTimer: rng.range(2, 9),
    steerVis: 0,
  };
  allCars.push(car);
  return car;
}

// The point a driver aims for: the next intersection along their heading,
// shifted onto their own side of the road.
function nextTarget(car) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const px = car.mesh.position.x;
  const pz = car.mesh.position.z;
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    for (let j = 0; j <= CITY.blocksPerSide; j++) {
      const ix = roadCenter(i);
      const iz = roadCenter(j);
      const dx = ix - px;
      const dz = iz - pz;
      const along = dx * fx + dz * fz;
      const across = Math.abs(dx * fz - dz * fx);
      if (along > 12 && across < 14 && along < bestDist) {
        bestDist = along;
        best = { x: ix, z: iz };
      }
    }
  }
  if (!best) {
    // At the map edge: turn around by aiming back at the city centre.
    best = { x: 0, z: 0 };
  }
  // Aim through the intersection and out the other side, on the right lane.
  const rx = -Math.cos(car.heading);
  const rz = Math.sin(car.heading);
  return {
    x: best.x + fx * CITY.pitch * 0.5 + rx * 3.4,
    z: best.z + fz * CITY.pitch * 0.5 + rz * 3.4,
    intersection: best,
  };
}

function chooseHeadingAtIntersection(car) {
  const roll = rng.next();
  if (roll < 0.45) return car.heading;                       // straight on
  if (roll < 0.72) return car.heading + Math.PI / 2;         // one way
  return car.heading - Math.PI / 2;                          // the other way
}

export function updateTrafficCar(car, dt, playerPos) {
  if (!car.target) car.target = nextTarget(car);
  const pos = car.mesh.position;
  const dx = car.target.x - pos.x;
  const dz = car.target.z - pos.z;
  const distToTarget = Math.hypot(dx, dz);
  if (distToTarget < 9) {
    car.heading = chooseHeadingAtIntersection(car);
    car.target = nextTarget(car);
  }
  const desired = Math.atan2(car.target.x - pos.x, car.target.z - pos.z);
  car.heading = angleLerp(car.heading, desired, clamp(dt * 1.6, 0, 1));

  // Slow for the car ahead, a crossing pedestrian, or the player.
  let wantSpeed = 11.5;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of allCars) {
    if (other === car || other.mode === 'parked') continue;
    const ox = other.mesh.position.x - pos.x;
    const oz = other.mesh.position.z - pos.z;
    const ahead = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    if (ahead > 0 && ahead < 13 && side < 2.6) wantSpeed = Math.min(wantSpeed, other.speed * 0.9);
    if (ahead > 0 && ahead < 6 && side < 2.6) wantSpeed = 0;
  }
  if (playerPos) {
    const ox = playerPos.x - pos.x;
    const oz = playerPos.z - pos.z;
    const ahead = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    if (ahead > 0 && ahead < 8 && side < 2.2) {
      wantSpeed = 0;
      car.honkTimer -= dt;
      if (car.honkTimer <= 0) {
        car.honkTimer = rng.range(3, 8);
        if (distance2d(pos.x, pos.z, playerPos.x, playerPos.z) < 26) sfx.horn();
      }
    }
  }
  car.speed += clamp(wantSpeed - car.speed, -22 * dt, 7 * dt);
  pos.x += fx * car.speed * dt;
  pos.z += fz * car.speed * dt;
  const fixed = collideCircle(pos.x, pos.z, CAR.radius);
  pos.x = fixed.x;
  pos.z = fixed.z;
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

export function spinWheels(car, dt) {
  const wheels = car.mesh.userData.wheels || [];
  for (const wheel of wheels) wheel.rotation.x += (car.speed * dt) / 0.36;
}

// Shared arcade physics for any car a human (or the police AI) is driving.
// input: { throttle: -1..1, steer: -1..1, brake: bool }
export function driveCar(car, input, dt) {
  const topSpeed = car.police ? 49 : car.model.topSpeed;
  const pos = car.mesh.position;
  if (input.throttle > 0) {
    car.speed += CAR.accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (input.throttle < 0) {
    car.speed += (car.speed > 0.5 ? -CAR.brake : CAR.reverseAccel * input.throttle) * dt;
  }
  car.speed -= car.speed * CAR.drag * dt * 0.35;
  if (input.brake) car.speed -= Math.sign(car.speed) * CAR.brake * 1.4 * dt;
  car.speed = clamp(car.speed, -13, topSpeed);
  if (Math.abs(car.speed) < 0.12 && input.throttle === 0) car.speed = 0;

  const steerAuthority = clamp(Math.abs(car.speed) / 6, 0, 1) * Math.sign(car.speed);
  car.heading += input.steer * CAR.maxSteer * steerAuthority * dt * 1.9;
  car.steerVis = input.steer;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const beforeX = pos.x;
  const beforeZ = pos.z;
  pos.x += fx * car.speed * dt;
  pos.z += fz * car.speed * dt;
  const fixed = collideCircle(pos.x, pos.z, CAR.radius);
  if (fixed.x !== pos.x || fixed.z !== pos.z) {
    // Scraped or hit a building: bleed speed and report the impact.
    const impact = Math.abs(car.speed);
    pos.x = fixed.x;
    pos.z = fixed.z;
    car.speed *= 0.35;
    car.lastImpact = impact;
  } else {
    car.lastImpact = 0;
  }
  pos.x = beforeX + (pos.x - beforeX);
  pos.z = beforeZ + (pos.z - beforeZ);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
  return car.lastImpact;
}

// Simple circle repulsion between cars so traffic never overlaps.
export function separateCars() {
  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i];
      const b = allCars[j];
      const ax = a.mesh.position.x;
      const az = a.mesh.position.z;
      const bx = b.mesh.position.x;
      const bz = b.mesh.position.z;
      const dx = bx - ax;
      const dz = bz - az;
      const dist = Math.hypot(dx, dz);
      const minDist = 3.4;
      if (dist > 0.01 && dist < minDist) {
        const push = ((minDist - dist) / 2) * 0.8;
        const nx = dx / dist;
        const nz = dz / dist;
        if (a.mode !== 'parked') { a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push; }
        if (b.mode !== 'parked') { b.mesh.position.x += nx * push; b.mesh.position.z += nz * push; }
        if (a.mode === 'player' || b.mode === 'player') {
          const other = a.mode === 'player' ? b : a;
          other.lastBump = Math.max(other.lastBump || 0, Math.abs(a.speed - b.speed));
        }
      }
    }
  }
}

export function seedTraffic(scene, count) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const alongX = rng.chance(0.5);
    // The first few cars roll near the player's south-east spawn corner so
    // the opening street already has traffic on it.
    const nearSpawn = n < 6;
    const roadIndex = nearSpawn ? rng.int(7, CITY.blocksPerSide) : rng.int(0, CITY.blocksPerSide);
    const t = nearSpawn ? rng.range(150, CITY.halfExtent - 30) : rng.range(-CITY.halfExtent + 30, CITY.halfExtent - 30);
    const dir = rng.sign();
    let x;
    let z;
    let heading;
    if (alongX) {
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      x = t;
      // Right-hand lane: eastbound traffic rides the south side, westbound the north.
      z = roadCenter(roadIndex) + (heading === Math.PI / 2 ? 3.4 : -3.4);
    } else {
      heading = dir > 0 ? 0 : Math.PI;
      x = roadCenter(roadIndex) + (heading === 0 ? -3.4 : 3.4);
      z = t;
    }
    const car = spawnCar(scene, { x, z, heading, mode: 'traffic' });
    car.speed = rng.spread(8.5, 2.5);
    cars.push(car);
  }
  return cars;
}

export function seedParkedCars(scene, count) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const roadIndex = rng.int(0, CITY.blocksPerSide);
    const alongX = rng.chance(0.5);
    const t = rng.range(-CITY.halfExtent + 24, CITY.halfExtent - 24);
    const side = rng.sign();
    let x;
    let z;
    let heading;
    if (alongX) {
      z = roadCenter(roadIndex) + side * (CITY.roadWidth / 2 - 1.6);
      x = t;
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = roadCenter(roadIndex) + side * (CITY.roadWidth / 2 - 1.6);
      z = t;
      heading = side > 0 ? Math.PI : 0;
    }
    const car = spawnCar(scene, { x, z, heading, mode: 'parked' });
    cars.push(car);
  }
  return cars;
}
