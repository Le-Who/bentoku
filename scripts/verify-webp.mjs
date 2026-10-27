import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assessRgba } from './asset-quality.mjs';
import { runtimeAssetPairs } from './runtime-asset-pairs.mjs';

const { verification } = JSON.parse(await readFile('art/asset-compression.json', 'utf8'));
const pairs = await runtimeAssetPairs();
let failures = 0;
for (const { source, target } of pairs) {
  try {
    const sourcePixels = await sharp(source, { failOn: 'error' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const targetPixels = await sharp(target, { failOn: 'error' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = assessRgba(sourcePixels, targetPixels, verification.maxVisibleWeightedMae);
    if (!result.okay) failures += 1;
    process.stdout.write(
      `${result.okay ? 'PASS' : 'FAIL'} ${target}: dimensions match=${result.dimensionsMatch}, alpha diffs=${result.alphaDiffs}, visible weighted RGB MAE=${result.visibleWeightedMae?.toFixed(3) ?? 'n/a'}\n`,
    );
  } catch (error) {
    failures += 1;
    process.stdout.write(`FAIL ${target}: ${error.message}\n`);
  }
}
async function webpsUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) return webpsUnder(name);
      return entry.isFile() && /\.webp$/i.test(entry.name) ? [name] : [];
    }),
  );
  return nested.flat();
}
const expected = new Set(pairs.map(({ target }) => path.normalize(target)));
for (const file of await webpsUnder(path.join('public', 'assets'))) {
  if (!expected.has(path.normalize(file))) {
    failures += 1;
    process.stdout.write(`FAIL ${file}: no mapped source\n`);
  }
}
if (failures > 0) throw new Error(`${failures} WebP verification(s) failed.`);
process.stdout.write(
  `Verified ${pairs.length} lossy WebPs; alpha and dimensions exact, visible weighted RGB MAE <= ${verification.maxVisibleWeightedMae}.\n`,
);
