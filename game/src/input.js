// input.js — keyboard and mouse state for the whole game. Other modules read
// the plain `keys` set and the mouse deltas each frame; nothing else here
// knows about DOM events.

export const keys = new Set();
export const mouse = {
  dx: 0,          // movement accumulated since the last frame consumed it
  dy: 0,
  down: false,    // left button held (fire / punch)
  rightDown: false,
  locked: false,  // pointer lock engaged on the canvas
};

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyM',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'KeyP', 'Escape', 'Enter', 'KeyH', 'KeyC',
]);

let pressHandlers = new Map();

export function onPress(code, handler) {
  if (!pressHandlers.has(code)) pressHandlers.set(code, []);
  pressHandlers.get(code).push(handler);
}

export function initInput(canvas) {
  addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) {
      keys.add(event.code);
      const handlers = pressHandlers.get(event.code) || [];
      for (const handler of handlers) handler();
    } else {
      keys.add(event.code);
    }
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouse.down = true;
    if (event.button === 2) mouse.rightDown = true;
  });
  addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
    if (event.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (mouse.locked) {
      mouse.dx += event.movementX || 0;
      mouse.dy += event.movementY || 0;
    }
  });
}

export function requestLock(canvas) {
  if (!mouse.locked && canvas.requestPointerLock) canvas.requestPointerLock();
}

export function releaseLock() {
  if (mouse.locked && document.exitPointerLock) document.exitPointerLock();
}

// Called once per frame by the game loop after the camera consumed movement.
export function consumeMouseDelta() {
  const delta = { dx: mouse.dx, dy: mouse.dy };
  mouse.dx = 0;
  mouse.dy = 0;
  return delta;
}

export function isDown(...codes) {
  return codes.some((code) => keys.has(code));
}
