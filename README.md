[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/imnotripper/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/imnotripper/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Harbor: Solace City

An original open-world crime game that runs in a desktop browser from static
files — no build step, no network, no installs. A sun-soaked island city of
neon and palm trees, and one returning getaway driver with a diner to save.

## The story

Rico Vane left Solace City five years ago. Now Sol Reyes — who runs the
Marina Diner and once kept him fed for free — is being squeezed by Dario
Venn's Velvet Circle. Five story missions take Rico from parking a borrowed
Marlin to outrunning every cruiser in the city:

1. **Homecoming** — meet Sol, move her cousin's car off the diner's street.
2. **Supper Run** — a crate, a club, and a clock.
3. **The Collector** — three of Venn's men, one warehouse lot, a new pistol.
4. **Borrowed Wings** — steal Venn's gold Kestrel GT and lose the heat.
5. **Neon Goodbye** — checkpoints, a ferry, and every star the SCPD can give.

After the story, gold markers keep offering paid odd jobs across the city.

## What's in the world

- A 9×9-block procedural city (Three.js, vendored) with lit towers, neon
  signage, palms, street lamps, a marina, and a full day cycle that slides
  from golden hour into neon night.
- Traffic that drives the grid on right-hand lanes and brakes for trouble,
  parked cars on every curb, and 40+ pedestrians who stroll, panic and run.
- Any car can be taken and driven — five original models, arcade handling,
  engine and skid audio, working headlights and a speedometer.
- A heat-based wanted system (0–5 stars): cruisers hunt you, officers open
  fire at three stars, and a bust meter fills when you're cornered.
- Combat on foot: fists from the start, a pistol from mission 3, with
  witnesses — quiet crimes need an audience, gunfire doesn't.
- HUD with cash, health/armour bars, wanted stars, mission timer, and a
  circular minimap with mission and police blips.
- Cash, health and armour pickups; wasted/busted respawns with fines;
  pause menu; progress, cash and stats saved to `localStorage`.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click canvas to lock) | Look |
| Click | Punch / shoot |
| E | Enter / exit car |
| Shift | Sprint |
| Space | Handbrake |
| H | Horn |
| Enter | Advance dialogue |
| P | Pause menu (save from here) |

## Run it

Serve `game/` with any static file server and open `index.html` in desktop
Chrome, e.g. `python3 -m http.server --directory game 8080`.

## Hand in (the bounty program)

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## Layout

- `game/index.html`, `game/style.css` — page and screen styling
- `game/src/main.js` — game states, cameras, day cycle, system wiring
- `game/src/world.js` — the city: ground plan, towers, palms, harbour
- `game/src/vehicles.js` — car factory, traffic AI, driving physics
- `game/src/pedestrians.js` — the people of Solace City
- `game/src/player.js` — Rico: walking, driving, fighting
- `game/src/police.js` — wanted level, pursuit AI, bust meter
- `game/src/missions.js` — the five-mission story, odd jobs, pickups
- `game/src/hud.js` — HUD, dialogue, minimap
- `game/src/audio.js` — all sound, synthesised with WebAudio
- `game/src/input.js`, `game/src/config.js`, `game/src/random.js`, `game/src/save.js`
- `game/vendor/three.min.js` — Three.js r128 (MIT), vendored minified

Everything — city, characters, vehicles, names, story, art and sound — is
original to this game.

---
Built by an AI agent for the [make.fun bounty](https://make.fun/bounty/gta6-01). Try make.fun with referral code [9d2jgpgk](https://make.fun/r/9d2jgpgk).
