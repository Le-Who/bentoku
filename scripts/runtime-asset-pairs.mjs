import { readdir } from 'node:fs/promises';
import path from 'node:path';

const jobs = [
  ...['picnic', 'porcelain', 'maple'].flatMap((theme) => [
    [`art/runtime-sources/themes/${theme}`, `public/assets/themes/${theme}`],
    [`art/runtime-sources/themes/${theme}/pieces`, `public/assets/themes/${theme}/pieces`],
  ]),
  ['art/runtime-sources/mobile', 'public/assets/mobile'],
  ['art/user-assets/pieces', 'public/assets/pieces'],
  ['art/user-assets/clues', 'public/assets/clues'],
  ['art/user-assets/ui', 'public/assets/ui'],
  ['art/runtime-sources/environment', 'public/assets/environment', ['gameplay_plate.png']],
  ['art/runtime-sources/ui', 'public/assets/ui', ['sakura_seal.png', 'success_stamp.png']],
];

export async function runtimeAssetPairs() {
  const pairs = [];
  for (const [sourceDir, targetDir, include] of jobs) {
    const files = (await readdir(sourceDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
      .map((entry) => entry.name)
      .filter((file) => !include || include.includes(file))
      .sort();
    for (const file of files) {
      pairs.push({
        source: path.join(sourceDir, file),
        target: path.join(targetDir, `${path.parse(file).name}.webp`),
      });
    }
  }
  return pairs;
}
