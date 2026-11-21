// Neon Harbor: Solace City — the hand-in program for the gta6-01 bounty.
//
// The game itself is the static site in game/ (open game/index.html in any
// desktop browser, no build step, no network). This program's whole job is
// the delivery: copy game/ and screenshots/ into the output directory and
// write the dossier the judge reads, using the kit's own makefun-game
// library so the bytes match the scorer's rebuild exactly.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps below are the gate's own (see the kit's RULES.txt): at most four
// screenshots of 256 KiB each, at most 993 files and 48 MiB under game/, no
// path over 1,000 bytes, and the dossier's source text capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
