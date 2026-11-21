// main.js — Neon Harbor: Solace City. Boots the renderer and the city, owns
// the game states (title, playing, paused, wasted, busted), the cameras, the
// day cycle, crime witnessing, and every wire between the systems: player,
// traffic, pedestrians, police, missions, pickups, HUD and the save file.

import { CITY, WORLD, roadCenter } from './config.js';
import { clamp, lerp, distance2d } from './random.js';
import { initInput, keys, mouse, consumeMouseDelta, onPress, requestLock, releaseLock } from './input.js';
import { initAudio, sfx, setEngine, setMusic } from './audio.js';
import { buildWorld } from './world.js';
import { seedTraffic, seedParkedCars, updateTrafficCar, separateCars, allCars, spawnCar, CAR_MODELS } from './vehicles.js';
import { seedPedestrians, spawnPedestrian, updatePedestrians, pedestrians, scarePedestrians, hurtPedestrian } from './pedestrians.js';
import {
  buildPlayer, player, playerPosition, isDriving, nearestCar, enterCar, exitCar,
  updatePlayerOnFoot, updatePlayerDriving, respawnPlayer,
} from './player.js';
import { initPolice, updatePolice, addCrime, addHeat, clearWanted, police, policeBlips } from './police.js';
import {
  initMissions, offerMission, updateMissions, currentMarker, placeShotBeacon, failMission,
  initPickups, updatePickups, PLACES, STORY,
} from './missions.js';
import * as hud from './hud.js';
import { defaultSave, loadSave, storeSave, wipeSave } from './save.js';

// Surface script errors on the page itself: a broken build should say so.
addEventListener('error', (event) => {
  const box = document.getElementById('loadError');
  if (box) {
    box.style.display = 'block';
    box.textContent = `Error: ${event.message}`;
  }
});

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1e3f);
scene.fog = new THREE.Fog(0x3a2340, 120, 620);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(60, 30, 120);

const hemi = new THREE.HemisphereLight(0xbdd3ff, 0x33222e, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 1.1);
sun.position.set(120, 180, 60);
scene.add(sun);
const neonGlow = new THREE.PointLight(0xff2e88, 0.55, 190);
neonGlow.position.set(0, 26, 0);
scene.add(neonGlow);

buildWorld(scene);
buildPlayer(scene);
seedTraffic(scene, WORLD.trafficCars);
seedParkedCars(scene, WORLD.parkedCars);
seedPedestrians(scene, WORLD.pedestrians);
initPolice(scene);
initPickups(scene);

let save = defaultSave();
let state = 'title';            // title | playing | paused | ended
let cameraYaw = Math.PI;
let cameraPitch = 0.32;
let timeOfDay = WORLD.startTimeOfDay;
let autosaveTimer = 0;
let lastHurtAt = -99;
let elapsed = 0;
let framesRendered = 0;

const shotMode = new URLSearchParams(location.search).get('shot');

// --- Tracers: brief glowing streaks for gunfire. ---
const tracers = [];
{
  const geo = new THREE.BoxGeometry(0.05, 0.05, 30);
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0 }));
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
}
player.onShoot = (x, z, yaw) => {
  const tracer = tracers.find((t) => t.life <= 0) || tracers[0];
  tracer.mesh.position.set(x + Math.sin(yaw) * 15, 1.5, z + Math.cos(yaw) * 15);
  tracer.mesh.rotation.y = yaw;
  tracer.mesh.visible = true;
  tracer.mesh.material.opacity = 0.9;
  tracer.life = 0.06;
};

// --- Crime witnessing: quiet crimes need an audience, gunfire does not. ---
function witnessed(x, z, radius) {
  for (const ped of pedestrians) {
    if (ped.state !== 'down' && distance2d(x, z, ped.mesh.position.x, ped.mesh.position.z) < radius) return true;
  }
  return police.units.length > 0;
}
player.onCrime = (type) => {
  const pos = playerPosition();
  const loud = type === 'shoot';
  if (loud || witnessed(pos.x, pos.z, 34)) {
    addCrime(type);
    if (type === 'stealCar') save.stats.carsStolen++;
  }
};

// --- Missions wiring. ---
initMissions(scene, {
  onObjective: (title, sub) => { hud.setObjective(title, sub); hud.setTimer(null); },
  onDialogue: (lines, done) => hud.showDialogue(lines, done),
  onBanner: (title) => hud.showBanner(title),
  onTimer: (seconds) => hud.setTimer(seconds),
  onReward: (amount, label) => {
    player.cash += amount;
    save.cash = player.cash;
    hud.showToast(`${label} complete — +$${amount.toLocaleString('en-US')}`);
    sfx.missionDone();
    persistSave();
  },
  onGrantPistol: () => {
    player.hasPistol = true;
    save.hasPistol = true;
    hud.showToast('Pistol acquired — click to shoot', 4);
    persistSave();
  },
  onMissionComplete: (index) => {
    save.missionIndex = index + 1;
    save.stats.missionsDone++;
    if (index + 1 >= STORY.length) {
      save.storyDone = true;
      hud.showToast('STORY COMPLETE — Solace City is yours. Odd jobs pay at the gold markers.', 6);
    }
    persistSave();
    offerMission(save.missionIndex);
  },
  onMissionFailed: (reason) => {
    hud.showToast(`Mission failed — ${reason}`, 4);
    hud.setTimer(null);
    sfx.missionFail();
    offerMission(save.missionIndex);
  },
});

function persistSave() {
  const pos = playerPosition();
  save.cash = player.cash;
  save.hasPistol = player.hasPistol;
  save.position = { x: pos.x, z: pos.z, heading: player.heading };
  storeSave(save);
}

// --- Pickups. ---
function handlePickup(kind) {
  if (kind === 'cash') {
    player.cash += 50;
    sfx.cash();
    hud.showToast('+$50', 1.4);
  }
  if (kind === 'health') {
    player.health = clamp(player.health + 35, 0, 100);
    sfx.pickup();
    hud.showToast('Health +35', 1.6);
  }
  if (kind === 'armor') {
    player.armor = clamp(player.armor + 50, 0, 100);
    sfx.pickup();
    hud.showToast('Armour +50', 1.6);
  }
}

// --- Game flow. ---

function applySaveToWorld() {
  player.cash = save.cash;
  player.hasPistol = save.hasPistol;
  player.health = 100;
  player.armor = 0;
  player.mesh.position.set(save.position.x, 0, save.position.z);
  player.heading = save.position.heading;
  cameraYaw = player.heading;
}

function startGame(fresh) {
  if (fresh) {
    wipeSave();
    save = defaultSave();
  } else {
    save = loadSave() || defaultSave();
  }
  clearWanted();
  applySaveToWorld();
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  state = 'playing';
  setMusic(false);
  offerMission(save.missionIndex);
  hud.showControlsHint(9);
  hud.showToast(save.missionIndex > 0 || save.storyDone ? 'Welcome back to Solace City' : 'Follow the gold marker to meet Sol Reyes', 4.5);
}

function endRun(kind) {
  state = 'ended';
  releaseLock();
  setEngine(false);
  const title = document.getElementById('endTitle');
  const text = document.getElementById('endText');
  const fine = kind === 'busted' ? 150 : 100;
  player.cash = Math.max(0, player.cash - fine);
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    title.style.color = '#60a5fa';
    text.textContent = `The SCPD finally cornered Rico. $${fine} in fines and a night in the cells — the city keeps the change.`;
    save.stats.timesBusted++;
    sfx.busted();
  } else {
    title.textContent = 'WASTED';
    title.style.color = '#ff5d5d';
    text.textContent = `Rico wakes up outside the Solace Grand Hotel, patched up and $${fine} lighter. The city does not wait.`;
    save.stats.timesWasted++;
    sfx.wasted();
  }
  failMission(kind === 'busted' ? 'Busted.' : 'Wasted.');
  clearWanted();
  document.getElementById('endScreen').style.display = 'flex';
  persistSave();
}

function respawn() {
  document.getElementById('endScreen').style.display = 'none';
  respawnPlayer(PLACES.hotel.x + 4, PLACES.hotel.z + 6);
  cameraYaw = Math.PI;
  state = 'playing';
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  releaseLock();
  setEngine(false);
  const stats = save.stats;
  document.getElementById('pauseStats').innerHTML =
    `Cash <b>$${Math.floor(player.cash).toLocaleString('en-US')}</b> · Missions done <b>${stats.missionsDone}</b><br>` +
    `Cars stolen <b>${stats.carsStolen}</b> · Busted <b>${stats.timesBusted}</b> · Wasted <b>${stats.timesWasted}</b>`;
  document.getElementById('pauseMenu').style.display = 'flex';
}

function resumeGame() {
  document.getElementById('pauseMenu').style.display = 'none';
  state = 'playing';
}

function quitToTitle() {
  document.getElementById('pauseMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('startScreen').style.display = 'flex';
  state = 'title';
  refreshContinueButton();
  setMusic(true);
}

function refreshContinueButton() {
  document.getElementById('btnContinue').disabled = !loadSave();
}

// --- Buttons and keys. ---
document.getElementById('btnNew').addEventListener('click', () => { initAudio(); sfx.click(); startGame(true); });
document.getElementById('btnContinue').addEventListener('click', () => { initAudio(); sfx.click(); startGame(false); });
document.getElementById('btnResume').addEventListener('click', () => { sfx.click(); resumeGame(); });
document.getElementById('btnSave').addEventListener('click', () => { sfx.click(); persistSave(); hud.showToast('Game saved'); resumeGame(); });
document.getElementById('btnRestartMission').addEventListener('click', () => { sfx.click(); failMission('Abandoned.'); resumeGame(); });
document.getElementById('btnQuitToTitle').addEventListener('click', () => { sfx.click(); persistSave(); quitToTitle(); });
document.getElementById('btnRespawn').addEventListener('click', () => { sfx.click(); respawn(); });

onPress('KeyP', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
onPress('Enter', () => hud.advanceDialogue());
function toggleCar() {
  if (state !== 'playing' || hud.dialogueActive()) return;
  if (isDriving()) {
    exitCar();
    setEngine(false);
  } else {
    const pos = player.mesh.position;
    const car = nearestCar(pos.x, pos.z, 3.6);
    if (car) {
      enterCar(car);
      hud.showToast(car.model.name, 1.6);
    }
  }
}
onPress('KeyE', toggleCar);
onPress('KeyF', toggleCar);
onPress('KeyH', () => { if (isDriving()) sfx.horn(); });

canvas.addEventListener('click', () => {
  initAudio();
  if (state === 'playing') {
    if (hud.dialogueActive()) hud.advanceDialogue();
    else requestLock(canvas);
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!mouse.locked && state === 'playing' && !shotMode) pauseGame();
});

// --- Cameras. ---
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(60, 30, 120);

function updateCamera(dt) {
  if (state === 'title') {
    const t = performance.now() * 0.00005;
    camPos.set(Math.sin(t) * 150, 46 + Math.sin(t * 3.1) * 8, Math.cos(t) * 150);
    camera.position.lerp(camPos, clamp(dt * 2, 0, 1));
    camera.lookAt(0, 12, 0);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    return;
  }
  const delta = consumeMouseDelta();
  cameraYaw -= delta.dx * 0.0026;
  cameraPitch = clamp(cameraPitch + delta.dy * 0.0022, 0.04, 1.25);

  if (isDriving()) {
    const car = player.car;
    const pos = car.mesh.position;
    // Closer and lower than a survey camera: the car fills more of the
    // frame, so a chase reads at a glance even in a small screenshot.
    const back = 9.0 + Math.abs(car.speed) * 0.05;
    const desired = new THREE.Vector3(
      pos.x - Math.sin(car.heading) * back * Math.cos(cameraPitch * 0.4),
      2.85 + Math.sin(cameraPitch) * 3.2,
      pos.z - Math.cos(car.heading) * back * Math.cos(cameraPitch * 0.4),
    );
    // The chase camera eases toward the car's own heading.
    cameraYaw = cameraYaw + shortestAngle(car.heading - cameraYaw) * clamp(dt * 2.2, 0, 1);
    camPos.lerp(desired, clamp(dt * 5.5, 0, 1));
    camera.position.copy(camPos);
    camTarget.set(pos.x + Math.sin(car.heading) * 8, 1.5, pos.z + Math.cos(car.heading) * 8);
    camera.lookAt(camTarget);
    const speedRatio = Math.abs(car.speed) / car.model.topSpeed;
    camera.fov = lerp(camera.fov, 62 + speedRatio * 13, clamp(dt * 4, 0, 1));
    camera.updateProjectionMatrix();
  } else {
    const pos = player.mesh.position;
    const dist = 7.2;
    const desired = new THREE.Vector3(
      pos.x - Math.sin(cameraYaw) * dist * Math.cos(cameraPitch),
      1.7 + Math.sin(cameraPitch) * dist,
      pos.z - Math.cos(cameraYaw) * dist * Math.cos(cameraPitch),
    );
    camPos.lerp(desired, clamp(dt * 11, 0, 1));
    camera.position.copy(camPos);
    camTarget.set(pos.x + Math.sin(cameraYaw) * 4, 1.55, pos.z + Math.cos(cameraYaw) * 4);
    camera.lookAt(camTarget);
    camera.fov = lerp(camera.fov, 60, clamp(dt * 5, 0, 1));
    camera.updateProjectionMatrix();
  }
}

function shortestAngle(diff) {
  let d = diff % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// --- Day cycle: golden hour slides into neon night, then round again. ---
const SKY_KEYS = [
  { t: 0.0, sky: new THREE.Color(0x14102b), fog: new THREE.Color(0x1d1433), sun: 0.22, sunColor: new THREE.Color(0x8fa8ff), hemi: 0.34 },
  { t: 0.24, sky: new THREE.Color(0x3a2350), fog: new THREE.Color(0x452a4d), sun: 0.4, sunColor: new THREE.Color(0xff9d6b), hemi: 0.45 },
  { t: 0.32, sky: new THREE.Color(0x7fb0dd), fog: new THREE.Color(0x9db8cc), sun: 1.05, sunColor: new THREE.Color(0xfff1cf), hemi: 0.8 },
  { t: 0.55, sky: new THREE.Color(0x8fc3ee), fog: new THREE.Color(0xaac6d8), sun: 1.18, sunColor: new THREE.Color(0xfff6da), hemi: 0.88 },
  { t: 0.72, sky: new THREE.Color(0x7d9fd6), fog: new THREE.Color(0x9a9ec0), sun: 0.95, sunColor: new THREE.Color(0xffe3ae), hemi: 0.78 },
  { t: 0.8, sky: new THREE.Color(0xe2703a), fog: new THREE.Color(0xcf6a4a), sun: 0.62, sunColor: new THREE.Color(0xff8a4a), hemi: 0.6 },
  { t: 0.87, sky: new THREE.Color(0x472b5e), fog: new THREE.Color(0x40264d), sun: 0.3, sunColor: new THREE.Color(0xff7a9c), hemi: 0.42 },
  { t: 0.93, sky: new THREE.Color(0x171233), fog: new THREE.Color(0x1d1433), sun: 0.22, sunColor: new THREE.Color(0x8fa8ff), hemi: 0.34 },
  { t: 1.0, sky: new THREE.Color(0x14102b), fog: new THREE.Color(0x1d1433), sun: 0.22, sunColor: new THREE.Color(0x8fa8ff), hemi: 0.34 },
];

function updateDayCycle(dt) {
  timeOfDay = (timeOfDay + dt / WORLD.dayLengthSeconds) % 1;
  let a = SKY_KEYS[0];
  let b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (timeOfDay >= SKY_KEYS[i].t && timeOfDay <= SKY_KEYS[i + 1].t) {
      a = SKY_KEYS[i];
      b = SKY_KEYS[i + 1];
      break;
    }
  }
  const f = (timeOfDay - a.t) / Math.max(0.0001, b.t - a.t);
  scene.background.lerpColors(a.sky, b.sky, f);
  scene.fog.color.lerpColors(a.fog, b.fog, f);
  sun.intensity = lerp(a.sun, b.sun, f);
  sun.color.lerpColors(a.sunColor, b.sunColor, f);
  hemi.intensity = lerp(a.hemi, b.hemi, f);
  const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
  sun.position.set(Math.cos(sunAngle) * 220, Math.max(24, Math.sin(sunAngle) * 240), 90);
  const night = timeOfDay > 0.86 || timeOfDay < 0.22;
  neonGlow.intensity = night ? 0.85 : 0.4;
}

// --- Per-frame world simulation. ---
function simulate(dt) {
  const pos = playerPosition();

  // Traffic keeps flowing everywhere; only nearby cars get full attention.
  for (const car of allCars) {
    if (car.mode === 'traffic') {
      const d = distance2d(car.mesh.position.x, car.mesh.position.z, pos.x, pos.z);
      if (d < 260) updateTrafficCar(car, dt, isDriving() ? null : pos);
    }
  }

  if (isDriving()) {
    hud.showPrompt(null);
    const input = updatePlayerDriving(dt);
    const car = player.car;
    save.stats.distanceDriven += Math.abs(car.speed) * dt;
    setEngine(true, Math.abs(car.speed) / car.model.topSpeed, Math.abs(input.throttle));
    // Running someone down is loud, messy and very much a crime.
    if (Math.abs(car.speed) > 4) {
      for (const ped of pedestrians) {
        if (ped.state === 'down') continue;
        const d = distance2d(car.mesh.position.x, car.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < 2.1) {
          hurtPedestrian(ped, 80, car.mesh.position.x, car.mesh.position.z);
          sfx.crash(0.4);
          car.speed *= 0.72;
          addCrime('hitPed');
          lastHurtAt = elapsed;
        }
      }
    }
    if (car.lastBump && car.lastBump > 5) {
      sfx.crash(0.35);
      addCrimeWitnessed('hitCar');
      car.lastBump = 0;
    }
  } else {
    updatePlayerOnFoot(dt, cameraYaw, mouse.down);
    setEngine(false);
    // Prompt for the nearest ride.
    const car = nearestCar(pos.x, pos.z, 3.6);
    hud.showPrompt(car ? `E — Enter ${car.model.name}` : null);
  }

  updatePedestrians(dt);
  updatePolice(dt);
  updateMissions(dt);
  updatePickups(dt, handlePickup);
  separateCars();

  // Tracers fade.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
  }

  // HUD refresh.
  hud.setCash(player.cash);
  hud.setHealthArmor(player.health, player.armor);
  hud.setStars(police.stars);
  hud.setBust(police.bustMeter);
  if (isDriving()) {
    hud.setSpeedo(Math.abs(player.car.speed) * 3.6, player.car.model.name);
  } else {
    hud.setSpeedo(0, null);
  }
  const heading = isDriving() ? player.car.heading : player.heading;
  hud.drawMinimap(pos, heading, currentMarker(), policeBlips(), elapsed);
  hud.updateHud(dt);
  const vignette = document.getElementById('vignette');
  const hurtFlash = clamp(1 - (elapsed - lastHurtAt) * 1.6, 0, 1) * 0.8;
  const lowHealth = player.health < 32 ? 0.3 + Math.sin(elapsed * 5) * 0.12 : 0;
  vignette.style.opacity = String(clamp(hurtFlash + lowHealth, 0, 1));

  if (player.dead && state === 'playing') endRun('wasted');
}

function addCrimeWitnessed(type) {
  const pos = playerPosition();
  if (witnessed(pos.x, pos.z, 34)) addCrime(type);
}

police.onBusted = () => {
  if (state === 'playing') endRun('busted');
};

// --- Screenshot staging: ?shot=foot|drive|chase places the game mid-action. ---
function stageShot(mode) {
  save = defaultSave();
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  state = 'playing';
  if (mode === 'foot') {
    // Stage on the south sidewalk of the central east-west road: Rico in
    // frame, neighbours strolling past, traffic rolling behind him.
    const roadZ = roadCenter(4);
    const px = roadCenter(4) + 8;
    const pz = roadZ + CITY.roadWidth / 2 + 2.4;
    player.mesh.position.set(px, 0, pz);
    player.heading = -0.7;
    cameraYaw = -0.7;
    const strollers = [
      { dx: 5.5, dz: 0.6, heading: Math.PI / 2 }, { dx: -6.5, dz: -0.8, heading: -Math.PI / 2 },
      { dx: 11, dz: 0.2, heading: Math.PI / 2 }, { dx: -13, dz: 0.9, heading: Math.PI / 2 },
      { dx: 3.2, dz: -13.5, heading: 0 }, { dx: -2.5, dz: 14, heading: Math.PI },
    ];
    for (const s of strollers) spawnPedestrian(scene, { x: px + s.dx, z: pz + s.dz, heading: s.heading });
    const east = spawnCar(scene, { x: px - 42, z: roadZ + 3.4, heading: Math.PI / 2, mode: 'traffic' });
    east.speed = 9;
    const west = spawnCar(scene, { x: px + 12, z: roadZ - 3.4, heading: -Math.PI / 2, mode: 'traffic' });
    west.speed = 10.5;
    // Parked cars on the curbs around the corner, so the street reads lived-in.
    spawnCar(scene, { x: px - 14, z: roadZ + 6.6, heading: Math.PI / 2, mode: 'parked' });
    spawnCar(scene, { x: px + 15, z: roadZ - 6.6, heading: -Math.PI / 2, mode: 'parked' });
    spawnCar(scene, { x: roadCenter(4) + 6.6, z: pz + 17, heading: 0, mode: 'parked' });
    spawnCar(scene, { x: roadCenter(4) - 6.6, z: pz - 19, heading: Math.PI, mode: 'parked' });
    hud.showControlsHint(30);
    offerMission(0);
  } else if (mode === 'drive' || mode === 'chase') {
    // Eastbound lane (road centre + 3.4, the lane traffic itself uses for
    // this heading): staging in the westbound lane put the car head-on
    // into oncoming traffic, which bulldozed it out of the shot.
    const car = spawnCar(scene, {
      x: roadCenter(3), z: roadCenter(5) + 3.4, heading: Math.PI / 2,
      model: CAR_MODELS[1], mode: 'parked',
    });
    // A gold Kestrel reads clearly in screenshots.
    car.mesh.children.forEach((child) => {
      if (child.geometry && child.geometry.parameters && child.geometry.parameters.height === 0.55) {
        child.material = new THREE.MeshLambertMaterial({ color: 0xffb02e });
      }
    });
    enterCar(car);
    car.speed = mode === 'chase' ? 18 : 17;
    cameraYaw = car.heading;
    cameraPitch = 0.22;
    player.hasPistol = true;
    if (mode === 'chase') {
      save.missionIndex = 3;
      offerMission(3);
      hud.showBanner('BORROWED WINGS');
      // Exactly four wanted stars, staged deterministically: clear any
      // crime the car entry may have been witnessed for, then set the
      // heat by hand so the star count never drifts between captures.
      clearWanted();
      addHeat(3.6);
      // The gold mission beacon stands on the road ahead of the car, so
      // the objective is in the same frame as the chase.
      placeShotBeacon(car.mesh.position.x + 96, car.mesh.position.z);
      // Two cruisers staged on the tail, offset to either side of the
      // player's lane so both light bars read in frame and on the
      // minimap without an early pile-up.
      const behind = spawnCar(scene, {
        x: car.mesh.position.x - 26, z: car.mesh.position.z - 3.6,
        heading: Math.PI / 2, police: true, mode: 'police',
      });
      behind.speed = 13.5;
      police.units.push(behind);
      const second = spawnCar(scene, {
        x: car.mesh.position.x - 35, z: car.mesh.position.z + 3.0,
        heading: Math.PI / 2, police: true, mode: 'police',
      });
      second.speed = 13;
      police.units.push(second);
    } else {
      offerMission(1);
    }
  }
}

// --- Main loop. ---
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state === 'playing') {
    elapsed += dt;
    save.stats.playSeconds += dt;
    autosaveTimer += dt;
    if (autosaveTimer > 25) {
      autosaveTimer = 0;
      persistSave();
    }
    simulate(dt);
  } else if (state === 'title') {
    // The city idles behind the title: traffic rolls, people stroll.
    for (const car of allCars) if (car.mode === 'traffic') updateTrafficCar(car, dt, null);
    updatePedestrians(dt);
  }
  updateDayCycle(state === 'title' ? dt * 0.25 : dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  framesRendered++;
  window.__frames = framesRendered;
  if (shotMode && framesRendered > 55) window.__shotReady = true;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Debug/testing hook: lets a headless driver verify the world state.
window.__gameDebug = () => ({
  state,
  frames: framesRendered,
  car: player.car
    ? { x: player.car.mesh.position.x, z: player.car.mesh.position.z, heading: player.car.heading, speed: player.car.speed }
    : null,
  foot: { x: player.mesh.position.x, z: player.mesh.position.z },
  cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  stars: police.stars,
  units: police.units.length,
});

// Boot.
initInput(canvas);
hud.initHud();
refreshContinueButton();
if (shotMode) {
  stageShot(shotMode);
} else {
  setMusic(true);
}
requestAnimationFrame(frame);
