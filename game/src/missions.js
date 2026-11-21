// missions.js — the story of Neon Harbor: five missions for Rico Vane, told
// through Sol Reyes at the Marina Diner, plus the repeatable odd jobs that
// keep paying after the credits. A mission is a list of steps (go somewhere,
// take a specific car, fight, escape, beat the clock); this module runs the
// steps, moves the gold beacon, spawns what each step needs, and reports
// everything to the game through its hooks.

import { roadCenter } from './config.js';
import { clamp, distance2d, rng } from './random.js';
import { player, playerPosition, isDriving, hurtPlayer } from './player.js';
import { spawnCar, CAR_MODELS } from './vehicles.js';
import { spawnPedestrian, hurtPedestrian } from './pedestrians.js';
import { addHeat, police } from './police.js';
import { sfx } from './audio.js';

// Named places, all on street corners so cars and feet can reach them.
export const PLACES = {
  apartment: { name: "Vane's Apartment", x: roadCenter(8) - 6, z: roadCenter(8) - 6 },
  diner: { name: 'Marina Diner', x: roadCenter(5), z: roadCenter(9) - 4 },
  warehouse: { name: 'Harbor Warehouse', x: roadCenter(1), z: roadCenter(8) },
  casino: { name: 'Palms Casino', x: roadCenter(5) + 6, z: roadCenter(4) },
  hotel: { name: 'Solace Grand Hotel', x: roadCenter(4), z: roadCenter(3) + 4 },
  club: { name: 'Club Velvet', x: roadCenter(7), z: roadCenter(2) - 4 },
  pier: { name: 'Ferry Pier', x: roadCenter(6) - 8, z: 366 },
  overlook: { name: 'Harbor Overlook', x: roadCenter(2), z: roadCenter(9) - 4 },
};

export const STORY = [
  {
    title: 'Homecoming',
    giver: 'Sol Reyes',
    startAt: 'apartment',
    reward: 150,
    intro: [
      { who: 'Sol Reyes', text: 'Rico Vane, back in Solace City. Five years and you still owe me a dinner.' },
      { who: 'Rico Vane', text: 'Put it on my tab, Sol. I hear the Velvet Circle is squeezing your diner.' },
      { who: 'Sol Reyes', text: 'Dario Venn sends collectors on Friday. Take my cousin’s Marlin, the blue one by the diner, and park it at your place. I need it off my street tonight.' },
    ],
    steps: [
      { type: 'goto', place: 'diner', label: 'Go to the Marina Diner', radius: 7 },
      { type: 'takecar', place: 'diner', label: 'Get into the blue Marlin by the diner', carModel: 'Marlin Sedan', carColor: 0x2e4a6b },
      { type: 'goto', place: 'apartment', label: 'Drive the Marlin to Vane’s Apartment', radius: 9, needMissionCar: true },
    ],
    outro: [
      { who: 'Sol Reyes', text: 'Clean work. The city still suits you, Rico. Come by tomorrow — I may have paying work.' },
    ],
  },
  {
    title: 'Supper Run',
    giver: 'Sol Reyes',
    startAt: 'diner',
    reward: 300,
    intro: [
      { who: 'Sol Reyes', text: 'A crate walked off a boat at the Harbor Warehouse. Venn’s people are holding it for me.' },
      { who: 'Rico Vane', text: 'And you want it at Club Velvet before anyone notices it moved.' },
      { who: 'Sol Reyes', text: 'Before the kitchen rush. And Rico — the harbour patrol has been twitchy all week.' },
    ],
    steps: [
      { type: 'goto', place: 'warehouse', label: 'Pick up the crate at the Harbor Warehouse', radius: 8, onArrive: 'heat1' },
      { type: 'goto', place: 'club', label: 'Deliver the crate to Club Velvet', radius: 9, timer: 170 },
    ],
    outro: [
      { who: 'Sol Reyes', text: 'Venn got his crate, I got my cut, you got yours. This could become a habit.' },
    ],
  },
  {
    title: 'The Collector',
    giver: 'Sol Reyes',
    startAt: 'diner',
    reward: 250,
    intro: [
      { who: 'Sol Reyes', text: 'Three of Venn’s collectors came by with bats. My cook is in the clinic, Rico.' },
      { who: 'Rico Vane', text: 'Where do they drink?' },
      { who: 'Sol Reyes', text: 'The warehouse lot, most nights. Take this pistol. Send them home limping and the diner breathes again.' },
    ],
    steps: [
      { type: 'fight', place: 'warehouse', count: 3, label: 'Deal with Venn’s collectors at the warehouse lot', radius: 10 },
    ],
    outro: [
      { who: 'Sol Reyes', text: 'They’ll think twice before Friday. You’re a storm, Rico Vane.' },
    ],
    grantsPistol: true,
  },
  {
    title: 'Borrowed Wings',
    giver: 'Sol Reyes',
    startAt: 'diner',
    reward: 600,
    intro: [
      { who: 'Sol Reyes', text: 'Venn keeps a gold Kestrel GT at the Palms Casino — his prize toy, plates and all.' },
      { who: 'Rico Vane', text: 'You want me to borrow it.' },
      { who: 'Sol Reyes', text: 'Permanently. Lose the heat, then hide it at the warehouse. He’ll know exactly who to blame, and it won’t be us.' },
    ],
    steps: [
      { type: 'stealcar', place: 'casino', label: 'Steal the gold Kestrel GT at the Palms Casino', carModel: 'Kestrel GT', carColor: 0xffb02e, onTake: 'heat2' },
      { type: 'escape', label: 'Lose the police' },
      { type: 'goto', place: 'warehouse', label: 'Hide the Kestrel at the Harbor Warehouse', radius: 10, needMissionCar: true },
    ],
    outro: [
      { who: 'Sol Reyes', text: 'Venn is screaming into a phone somewhere. Beautiful. One more job, Rico — the big one.' },
    ],
  },
  {
    title: 'Neon Goodbye',
    giver: 'Sol Reyes',
    startAt: 'diner',
    reward: 1000,
    intro: [
      { who: 'Sol Reyes', text: 'I sold the diner’s lease to Venn’s rival. The money’s in a case, and the case leaves on the last ferry.' },
      { who: 'Rico Vane', text: 'And Venn knows.' },
      { who: 'Sol Reyes', text: 'Every cruiser in Solace City will know. Drive me through the harbour checkpoints to the Ferry Pier, Rico. Don’t stop for anyone.' },
    ],
    steps: [
      { type: 'goto', place: 'overlook', label: 'Checkpoint 1 — Harbor Overlook', radius: 11, timer: 300, onArrive: 'heat3' },
      { type: 'goto', place: 'hotel', label: 'Checkpoint 2 — Solace Grand Hotel', radius: 11 },
      { type: 'goto', place: 'casino', label: 'Checkpoint 3 — Palms Casino', radius: 11 },
      { type: 'goto', place: 'pier', label: 'Reach the Ferry Pier', radius: 12 },
    ],
    outro: [
      { who: 'Sol Reyes', text: 'That’s the ferry. Solace City is yours now, Rico — every neon mile of it.' },
      { who: 'Rico Vane', text: 'Then let’s see what trouble the city can find for me next.' },
    ],
  },
];

const missionState = {
  scene: null,
  hooks: null,
  status: 'idle',        // idle | offered | active | done
  index: 0,              // story mission on offer / in progress
  stepIndex: 0,
  missionCar: null,
  thugs: [],
  stepTimer: null,
  beacon: null,
  beaconRing: null,
  oddJob: null,          // active repeatable job after the story
  thugHitTimer: 0,
};

export function initMissions(scene, hooks) {
  missionState.scene = scene;
  missionState.hooks = hooks;
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffc233, transparent: true, opacity: 0.44, depthWrite: false, side: THREE.DoubleSide,
  });
  missionState.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 48, 18, 1, true), beaconMat);
  missionState.beacon.position.y = 24;
  missionState.beacon.visible = false;
  scene.add(missionState.beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  missionState.beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.5, 28), ringMat);
  missionState.beaconRing.rotation.x = -Math.PI / 2;
  missionState.beaconRing.position.y = 0.15;
  missionState.beaconRing.visible = false;
  scene.add(missionState.beaconRing);
}

export function offerMission(index) {
  missionState.index = index;
  missionState.status = 'offered';
  missionState.oddJob = null;
  const mission = STORY[index];
  if (!mission) {
    offerOddJob();
    return;
  }
  const place = PLACES[mission.startAt];
  setBeacon(place.x, place.z);
  missionState.hooks.onObjective(`Meet ${mission.giver} — ${mission.title}`, place.name);
}

function offerOddJob() {
  missionState.status = 'offered';
  const placeNames = Object.keys(PLACES);
  const from = PLACES[rng.pick(placeNames)];
  missionState.oddJob = { from };
  setBeacon(from.x, from.z);
  missionState.hooks.onObjective('Odd job: pick up a fare', from.name);
}

function setBeacon(x, z) {
  missionState.beacon.position.x = x;
  missionState.beacon.position.z = z;
  missionState.beacon.visible = true;
  missionState.beaconRing.position.x = x;
  missionState.beaconRing.position.z = z;
  missionState.beaconRing.visible = true;
}

function hideBeacon() {
  missionState.beacon.visible = false;
  missionState.beaconRing.visible = false;
}

// Staging helper for the game's own screenshot modes: point the gold
// objective beacon at a chosen spot on the road ahead of the player car,
// so a staged chase shot can show the mission objective in frame without
// changing any mission state.
export function placeShotBeacon(x, z) {
  setBeacon(x, z);
}

export function currentMarker() {
  if (!missionState.beacon.visible) return null;
  return { x: missionState.beacon.position.x, z: missionState.beacon.position.z };
}

function currentStep() {
  const mission = STORY[missionState.index];
  if (!mission) return null;
  return mission.steps[missionState.stepIndex] || null;
}

function placeOf(step) {
  return step.place ? PLACES[step.place] : { x: step.x, z: step.z, name: step.label };
}

function startStep() {
  const step = currentStep();
  if (!step) {
    completeMission();
    return;
  }
  missionState.stepTimer = step.timer || null;
  const hooks = missionState.hooks;

  if (step.type === 'goto' || step.type === 'pickup') {
    const place = placeOf(step);
    setBeacon(place.x, place.z);
    hooks.onObjective(step.label, place.name);
  }
  if (step.type === 'takecar' || step.type === 'stealcar') {
    const place = placeOf(step);
    const model = CAR_MODELS.find((m) => m.name === step.carModel) || CAR_MODELS[0];
    const car = spawnCar(missionState.scene, {
      x: place.x + 4,
      z: place.z + 3,
      heading: Math.PI / 2,
      model,
      mode: 'parked',
    });
    if (step.carColor !== undefined) {
      car.mesh.children.forEach((child) => {
        if (child.material && child.material.color && child.geometry && child.geometry.parameters && child.geometry.parameters.height === 0.55) {
          child.material = new THREE.MeshLambertMaterial({ color: step.carColor });
        }
      });
    }
    missionState.missionCar = car;
    setBeacon(car.mesh.position.x, car.mesh.position.z);
    hooks.onObjective(step.label, place.name);
  }
  if (step.type === 'fight') {
    const place = placeOf(step);
    missionState.thugs = [];
    for (let i = 0; i < step.count; i++) {
      const thug = spawnPedestrian(missionState.scene, {
        x: place.x + rng.range(-6, 6),
        z: place.z + rng.range(-6, 6),
        heading: rng.range(0, Math.PI * 2),
        outfit: { shirt: 0x23232e, pants: 0x181a20, hat: 0x0c0c10 },
        stationary: true,
        name: 'Collector',
      });
      thug.thug = true;
      thug.health = 90;
      missionState.thugs.push(thug);
    }
    setBeacon(place.x, place.z);
    hooks.onObjective(step.label, `${step.count} collectors`);
  }
  if (step.type === 'escape') {
    hideBeacon();
    hooks.onObjective(step.label, 'Break line of sight and let the heat cool');
  }
}

function applyStepEvent(eventName) {
  if (eventName === 'heat1') addHeat(1.1);
  if (eventName === 'heat2') addHeat(2.1);
  if (eventName === 'heat3') addHeat(3.1);
}

function completeMission() {
  const mission = STORY[missionState.index];
  missionState.status = 'idle';
  hideBeacon();
  if (mission) {
    missionState.hooks.onDialogue(mission.outro, () => {});
    missionState.hooks.onReward(mission.reward, mission.title);
    if (mission.grantsPistol) missionState.hooks.onGrantPistol();
    missionState.hooks.onMissionComplete(missionState.index);
  }
  missionState.missionCar = null;
  missionState.thugs = [];
}

export function failMission(reason) {
  if (missionState.status !== 'active') return;
  missionState.status = 'idle';
  hideBeacon();
  for (const thug of missionState.thugs) thug.thug = false;
  missionState.thugs = [];
  missionState.missionCar = null;
  missionState.hooks.onMissionFailed(reason);
}

function beginMission() {
  const mission = STORY[missionState.index];
  missionState.status = 'active';
  missionState.stepIndex = 0;
  missionState.hooks.onBanner(mission.title);
  missionState.hooks.onDialogue(mission.intro, () => startStep());
  hideBeacon();
}

function beginOddJob() {
  const placeNames = Object.keys(PLACES).filter((name) => PLACES[name] !== missionState.oddJob.from);
  const to = PLACES[rng.pick(placeNames)];
  const from = missionState.oddJob.from;
  const dist = distance2d(from.x, from.z, to.x, to.z);
  const job = {
    to,
    reward: Math.round(60 + dist * 0.35),
    timer: Math.round(50 + dist / 9),
  };
  missionState.oddJob = { ...job, phase: 'deliver' };
  missionState.status = 'active';
  setBeacon(to.x, to.z);
  missionState.stepTimer = job.timer;
  missionState.hooks.onObjective(`Odd job: drive to ${to.name}`, `$${job.reward} fare — beat the clock`);
  sfx.cash();
}

export function updateMissions(dt) {
  const pos = playerPosition();
  // Pulse the beacon ring.
  if (missionState.beaconRing.visible) {
    const s = 1 + Math.sin(performance.now() * 0.006) * 0.24;
    missionState.beaconRing.scale.set(s, s, s);
  }

  if (missionState.status === 'offered') {
    const marker = currentMarker();
    if (marker && distance2d(pos.x, pos.z, marker.x, marker.z) < 6 && !isDriving()) {
      if (STORY[missionState.index]) beginMission();
      else beginOddJob();
    }
    return;
  }
  if (missionState.status !== 'active') return;

  // Odd-job delivery.
  if (missionState.oddJob && missionState.oddJob.phase === 'deliver') {
    missionState.stepTimer -= dt;
    if (missionState.stepTimer <= 0) {
      missionState.status = 'idle';
      missionState.oddJob = null;
      hideBeacon();
      missionState.hooks.onMissionFailed('The fare gave up waiting.');
      return;
    }
    missionState.hooks.onTimer(missionState.stepTimer);
    const to = missionState.oddJob.to;
    if (distance2d(pos.x, pos.z, to.x, to.z) < 10) {
      const reward = missionState.oddJob.reward;
      missionState.status = 'idle';
      missionState.oddJob = null;
      hideBeacon();
      missionState.hooks.onReward(reward, 'Odd job');
      offerOddJob();
    }
    return;
  }

  const step = currentStep();
  if (!step) return;
  const hooks = missionState.hooks;

  if (step.timer) {
    missionState.stepTimer -= dt;
    hooks.onTimer(missionState.stepTimer);
    if (missionState.stepTimer <= 0) {
      failMission('Out of time.');
      return;
    }
  }

  if (step.type === 'goto') {
    const place = placeOf(step);
    const arrived = distance2d(pos.x, pos.z, place.x, place.z) < (step.radius || 8);
    const carOk = !step.needMissionCar || player.car === missionState.missionCar;
    if (arrived && carOk) {
      if (step.onArrive) applyStepEvent(step.onArrive);
      missionState.stepIndex++;
      startStep();
    } else if (arrived && step.needMissionCar) {
      hooks.onObjective(step.label, 'You need the mission car');
    }
  }

  if (step.type === 'takecar' || step.type === 'stealcar') {
    if (player.car === missionState.missionCar && missionState.missionCar) {
      if (step.onTake) applyStepEvent(step.onTake);
      missionState.stepIndex++;
      startStep();
    }
  }

  if (step.type === 'escape') {
    if (police.stars === 0) {
      missionState.stepIndex++;
      startStep();
    }
  }

  if (step.type === 'fight') {
    updateThugs(dt, pos);
    const remaining = missionState.thugs.filter((t) => t.state !== 'down').length;
    hooks.onObjective(step.label, `${remaining} collectors still standing`);
    if (remaining === 0) {
      for (const thug of missionState.thugs) thug.thug = false;
      missionState.thugs = [];
      missionState.stepIndex++;
      startStep();
    }
  }
}

function updateThugs(dt, playerPos) {
  missionState.thugHitTimer -= dt;
  for (const thug of missionState.thugs) {
    if (thug.state === 'down') {
      thug.downTimer = 30;   // collectors stay down for the count
      continue;
    }
    thug.state = 'stand';
    const pos = thug.mesh.position;
    const dist = distance2d(pos.x, pos.z, playerPos.x, playerPos.z);
    if (dist > 55) continue;
    const desired = Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z);
    thug.heading = desired;
    thug.mesh.rotation.y = desired;
    if (dist > 1.7 && !isDriving()) {
      pos.x += Math.sin(desired) * 3.4 * dt;
      pos.z += Math.cos(desired) * 3.4 * dt;
      thug.walkPhase = (thug.walkPhase || 0) + dt * 8;
      const parts = thug.mesh.userData.parts;
      if (parts) {
        const swing = Math.sin(thug.walkPhase) * 0.55;
        parts.legs[0].rotation.x = swing;
        parts.legs[1].rotation.x = -swing;
      }
    } else if (dist <= 1.9 && missionState.thugHitTimer <= 0 && !player.dead) {
      missionState.thugHitTimer = 0.9;
      hurtPlayer(rng.range(4, 9), 'punch');
      sfx.punch();
    }
    if (isDriving() && dist < 2.6) {
      hurtPedestrianFromCar(thug);
    }
  }
}

function hurtPedestrianFromCar(thug) {
  // Running a collector down ends the argument quickly.
  thug.health = 0;
  thug.state = 'down';
  thug.downTimer = 30;
  thug.mesh.rotation.x = -Math.PI / 2;
  thug.mesh.position.y = 0.25;
}

// --- Street pickups: cash, health and armour scattered over the city. ---

const pickups = [];

export function initPickups(scene) {
  const defs = [
    { kind: 'cash', x: roadCenter(2) + 6, z: roadCenter(2) - 6 },
    { kind: 'cash', x: roadCenter(6) - 6, z: roadCenter(6) + 6 },
    { kind: 'cash', x: roadCenter(3) + 6, z: roadCenter(7) - 6 },
    { kind: 'cash', x: roadCenter(7) - 6, z: roadCenter(3) + 6 },
    { kind: 'health', x: PLACES.diner.x + 5, z: PLACES.diner.z - 5 },
    { kind: 'health', x: PLACES.hotel.x - 5, z: PLACES.hotel.z + 5 },
    { kind: 'armor', x: PLACES.warehouse.x + 6, z: PLACES.warehouse.z + 6 },
    { kind: 'armor', x: PLACES.casino.x - 6, z: PLACES.casino.z - 6 },
  ];
  const colors = { cash: 0x4ade80, health: 0xff5d5d, armor: 0x60a5fa };
  for (const def of defs) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: colors[def.kind] }),
    );
    mesh.position.set(def.x, 1.4, def.z);
    scene.add(mesh);
    pickups.push({ ...def, mesh, active: true, respawn: 0 });
  }
}

export function updatePickups(dt, onPickup) {
  const pos = playerPosition();
  for (const pickup of pickups) {
    if (!pickup.active) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) {
        pickup.active = true;
        pickup.mesh.visible = true;
      }
      continue;
    }
    pickup.mesh.rotation.y += dt * 2.4;
    pickup.mesh.position.y = 1.4 + Math.sin(performance.now() * 0.004 + pickup.x) * 0.22;
    if (distance2d(pos.x, pos.z, pickup.x, pickup.z) < 2.6) {
      pickup.active = false;
      pickup.mesh.visible = false;
      pickup.respawn = 45;
      onPickup(pickup.kind);
    }
  }
}

export function missionStatus() {
  return {
    status: missionState.status,
    index: missionState.index,
    stepIndex: missionState.stepIndex,
    activeTitle: missionState.status === 'active' && STORY[missionState.index] ? STORY[missionState.index].title : null,
  };
}
