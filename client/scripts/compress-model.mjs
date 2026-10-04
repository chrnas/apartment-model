// Compresses a raw .glb into the deployed client/public/apartment.glb.
//
// Usage (from the client/ folder):
//   npm run compress:model -- ../models-raw/yourfile.glb [textureSize]
//
// Defaults: WebP textures, resize to 1024, Draco geometry compression.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const input = process.argv[2];
const textureSize = process.argv[3] ?? '1024';
const output = resolve('public/apartment.glb');

if (!input) {
  console.error('Usage: npm run compress:model -- <input.glb> [textureSize]');
  process.exit(1);
}

const inputPath = resolve(input);
if (!existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}

console.log(`Compressing ${inputPath}`);
console.log(`  textures: WebP, max ${textureSize}px`);
console.log(`  geometry: Draco`);
console.log(`  output:   ${output}\n`);

const result = spawnSync(
  'npx',
  [
    '-y',
    '@gltf-transform/cli@latest',
    'optimize',
    inputPath,
    output,
    '--texture-compress',
    'webp',
    '--texture-size',
    textureSize,
    '--compress',
    'draco',
  ],
  { stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
