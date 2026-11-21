// config.js — every shared tuning value for Neon Harbor: Solace City lives here,
// so the rest of the code can stay about behaviour instead of magic numbers.

export const CITY = {
  // The city is a square grid of blocks. Roads run between the blocks.
  blocksPerSide: 9,          // 9 x 9 blocks
  blockSize: 64,             // metres of building ground per block
  roadWidth: 16,             // metres of asphalt between blocks
  get pitch() { return this.blockSize + this.roadWidth; },
  // Total width: every block plus a road on each side of it, halved.
  get halfExtent() {
    return (this.blocksPerSide * this.blockSize + (this.blocksPerSide + 1) * this.roadWidth) / 2;
  },
};

// World coordinates: x grows east, z grows south, y is up. Roads sit at
// coordinates roadCenter(i) for i in [0, blocksPerSide]; blocks fill the gaps.
export function roadCenter(i) {
  return -CITY.halfExtent + CITY.roadWidth / 2 + i * CITY.pitch;
}
export function blockCenter(i) {
  return roadCenter(i) + CITY.roadWidth / 2 + CITY.blockSize / 2;
}

export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 8.6,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  maxArmor: 100,
  startCash: 240,
  // Spawn: a south-east street corner near Vane's apartment, facing the city.
  start: { x: 266, z: 262, heading: Math.PI },
};

export const CAR = {
  // Arcade driving model shared by the player and the traffic AI.
  accel: 15.5,
  brake: 26,
  reverseAccel: 8,
  drag: 0.55,
  grip: 3.4,
  maxSteer: 0.62,
  radius: 1.55,
};

export const WANTED = {
  // Heat decays when the player stays out of trouble and out of sight.
  decayPerSecond: 0.055,
  maxStars: 5,
  // Police units the city fields at each wanted level (index = stars).
  policeByStars: [0, 2, 3, 5, 7, 9],
  crimes: {
    stealCar: 0.55,
    hitCar: 0.3,
    hitPed: 1.1,
    shoot: 0.45,
    shootCar: 0.5,
    missionSpike: 1.0,
  },
};

export const WORLD = {
  trafficCars: 26,
  parkedCars: 30,
  pedestrians: 42,
  dayLengthSeconds: 420,     // one full day/night cycle
  startTimeOfDay: 0.79,      // golden hour, sliding into neon dusk
};

export const SAVE_KEY = 'neon-harbor-solace-city-save-v1';

export const COLORS = {
  sky: 0x2a1e3f,
  fog: 0x3a2340,
  asphalt: 0x23242c,
  sidewalk: 0x4a4550,
  neonPink: 0xff2e88,
  neonCyan: 0x22d3ee,
  neonAmber: 0xffb02e,
};
