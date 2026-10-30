import sharp from 'sharp';

type ButtonMaterial = 'well' | 'button-primary' | 'button-secondary';

// Independent source-art oracle: exclude the translucent cast shadow.
export async function paintedButtonBounds(theme: string, material: ButtonMaterial) {
  const { data, info } = await sharp(`art/runtime-sources/themes/${theme}/${material}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! < 200) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  return {
    width: info.width,
    height: info.height,
    x: (left + right + 1) / 2,
    y: (top + bottom + 1) / 2,
  };
}
