import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { runtimeAssetPairs } from './runtime-asset-pairs.mjs';

const { encoding } = JSON.parse(await readFile('art/asset-compression.json', 'utf8'));
for (const { source, target } of await runtimeAssetPairs()) {
  await mkdir(path.dirname(target), { recursive: true });
  // Encode completely before replacing the asset, so a failed write preserves
  // the previous image instead of exposing a partially written WebP.
  const encoded = await sharp(source, { failOn: 'error' }).webp(encoding).toBuffer();
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, encoded);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  process.stdout.write(`${source} -> ${target}\n`);
}
