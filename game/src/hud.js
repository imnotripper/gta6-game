// hud.js — everything drawn over the 3D world: cash, health and armour bars,
// wanted stars, the objective card, prompts, the bust meter, dialogue boxes,
// mission banners, and the circular minimap with its blips.

import { CITY, roadCenter } from './config.js';
import { clamp } from './random.js';

const els = {};
let dialogueQueue = [];
let dialogueDone = null;
let dialogueTimer = 0;
let bannerTimer = 0;
let toastTimer = 0;

export function initHud() {
  for (const id of [
    'hud', 'cash', 'healthFill', 'armorFill', 'armorRow', 'stars', 'objectiveTitle',
    'objectiveSub', 'prompt', 'timer', 'dialogue', 'dialogueWho', 'dialogueText',
    'banner', 'toast', 'bustWrap', 'bustFill', 'speedo', 'minimap', 'vehicleName',
  ]) {
    els[id] = document.getElementById(id);
  }
  els.mapCtx = els.minimap.getContext('2d');
}

export function setCash(cash) {
  els.cash.textContent = `$${Math.floor(cash).toLocaleString('en-US')}`;
}

export function setHealthArmor(health, armor) {
  els.healthFill.style.width = `${clamp(health, 0, 100)}%`;
  els.healthFill.style.background = health < 30 ? '#ff4040' : '#4ade80';
  els.armorRow.style.display = armor > 0 ? 'flex' : 'none';
  els.armorFill.style.width = `${clamp(armor, 0, 100)}%`;
}

export function setStars(stars) {
  let text = '';
  for (let i = 0; i < 5; i++) text += i < stars ? '★' : '☆';
  els.stars.textContent = text;
  els.stars.style.opacity = stars > 0 ? '1' : '0.25';
}

export function setObjective(title, sub = '') {
  els.objectiveTitle.textContent = title || '';
  els.objectiveSub.textContent = sub || '';
  els.objectiveTitle.parentElement.style.display = title ? 'block' : 'none';
}

export function showPrompt(text) {
  els.prompt.textContent = text || '';
  els.prompt.style.display = text ? 'block' : 'none';
}

export function setTimer(seconds) {
  if (seconds === null || seconds === undefined) {
    els.timer.style.display = 'none';
    return;
  }
  els.timer.style.display = 'block';
  const s = Math.max(0, Math.ceil(seconds));
  els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  els.timer.style.color = s < 20 ? '#ff5d5d' : '#ffd166';
}

export function setSpeedo(speedKmh, vehicleName) {
  if (vehicleName) {
    els.speedo.style.display = 'block';
    els.speedo.textContent = `${Math.round(speedKmh)} km/h`;
    els.vehicleName.style.display = 'block';
    els.vehicleName.textContent = vehicleName;
  } else {
    els.speedo.style.display = 'none';
    els.vehicleName.style.display = 'none';
  }
}

export function setBust(meter) {
  els.bustWrap.style.display = meter > 0.02 ? 'block' : 'none';
  els.bustFill.style.width = `${clamp(meter * 100, 0, 100)}%`;
}

export function showBanner(title) {
  els.banner.textContent = title;
  els.banner.style.opacity = '1';
  bannerTimer = 2.6;
}

export function showToast(text, seconds = 3) {
  els.toast.textContent = text;
  els.toast.style.opacity = '1';
  toastTimer = seconds;
}

// Dialogue: lines play one at a time; Enter/click advances, or they advance
// on their own after a few seconds so screenshots and shy players still flow.
export function showDialogue(lines, onDone) {
  dialogueQueue = [...lines];
  dialogueDone = onDone || null;
  nextDialogueLine();
}

function nextDialogueLine() {
  const line = dialogueQueue.shift();
  if (!line) {
    els.dialogue.style.display = 'none';
    const done = dialogueDone;
    dialogueDone = null;
    if (done) done();
    return;
  }
  els.dialogue.style.display = 'block';
  els.dialogueWho.textContent = line.who;
  els.dialogueText.textContent = line.text;
  dialogueTimer = 4.6;
}

export function advanceDialogue() {
  if (els.dialogue.style.display === 'block') nextDialogueLine();
}

export function dialogueActive() {
  return els.dialogue.style.display === 'block';
}

export function updateHud(dt) {
  if (dialogueTimer > 0) {
    dialogueTimer -= dt;
    if (dialogueTimer <= 0 && els.dialogue.style.display === 'block') nextDialogueLine();
  }
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) els.banner.style.opacity = '0';
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) els.toast.style.opacity = '0';
  }
}

// The minimap: the whole island, north up, with the player centred in spirit
// (the map is small enough to show entire, which keeps navigation honest).
export function drawMinimap(playerPos, playerHeading, marker, policeUnits, time) {
  const ctx = els.mapCtx;
  const size = els.minimap.width;
  const scale = size / (CITY.halfExtent * 2 + 60);
  const toMap = (x, z) => ({
    x: (x + CITY.halfExtent + 30) * scale,
    y: (z + CITY.halfExtent + 30) * scale,
  });
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#10344d';
  ctx.fillRect(0, 0, size, size);
  const island = toMap(-CITY.halfExtent, -CITY.halfExtent);
  ctx.fillStyle = '#3a3742';
  ctx.fillRect(island.x, island.y, CITY.halfExtent * 2 * scale, CITY.halfExtent * 2 * scale);
  ctx.strokeStyle = '#5b6472';
  ctx.lineWidth = Math.max(1.5, CITY.roadWidth * scale * 0.55);
  ctx.beginPath();
  for (let i = 0; i <= CITY.blocksPerSide; i++) {
    const c = roadCenter(i);
    const a = toMap(c, -CITY.halfExtent);
    const b = toMap(c, CITY.halfExtent);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    const c2 = toMap(-CITY.halfExtent, c);
    const d2 = toMap(CITY.halfExtent, c);
    ctx.moveTo(c2.x, c2.y);
    ctx.lineTo(d2.x, d2.y);
  }
  ctx.stroke();

  // Police blips flash red/blue.
  for (const unit of policeUnits) {
    const p = toMap(unit.x, unit.z);
    ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff4455' : '#4488ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker.
  if (marker) {
    const p = toMap(marker.x, marker.z);
    ctx.fillStyle = '#ffc233';
    ctx.strokeStyle = '#00000088';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Player arrow.
  const p = toMap(playerPos.x, playerPos.z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(Math.sin(playerHeading), -Math.cos(playerHeading)));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
