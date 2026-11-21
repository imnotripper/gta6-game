// save.js — the whole persistence layer: one localStorage record holding
// story progress, cash, the pistol, lifetime stats and where Rico was last
// standing. Saving happens from the pause menu and at every mission end.
// Save format v2 (polish pass): same shape as v1; v1 records still load.

import { SAVE_KEY, PLAYER } from './config.js';

export function defaultSave() {
  return {
    version: 2,
    missionIndex: 0,       // next story mission to play
    storyDone: false,
    cash: PLAYER.startCash,
    hasPistol: false,
    position: { x: PLAYER.start.x, z: PLAYER.start.z, heading: PLAYER.start.heading },
    stats: {
      missionsDone: 0,
      carsStolen: 0,
      distanceDriven: 0,
      timesBusted: 0,
      timesWasted: 0,
      playSeconds: 0,
    },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) return null;
    return { ...defaultSave(), ...parsed, stats: { ...defaultSave().stats, ...(parsed.stats || {}) } };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe.
  }
}
