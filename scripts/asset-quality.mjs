/** Compare decoded RGBA images using opacity-weighted visible RGB error. */
export function assessRgba(source, target, maxVisibleWeightedMae) {
  const dimensionsMatch =
    source.info.width === target.info.width &&
    source.info.height === target.info.height &&
    source.info.channels === 4 &&
    target.info.channels === 4 &&
    source.data.length === target.data.length;
  if (!dimensionsMatch)
    return { okay: false, dimensionsMatch, alphaDiffs: null, visibleWeightedMae: null };
  let alphaDiffs = 0;
  let error = 0;
  let visibleWeight = 0;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const alpha = source.data[offset + 3];
    if (alpha !== target.data[offset + 3]) alphaDiffs += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      error += Math.abs(source.data[offset + channel] - target.data[offset + channel]) * alpha;
    }
    visibleWeight += 3 * alpha;
  }
  const visibleWeightedMae = visibleWeight ? error / visibleWeight : 0;
  return {
    okay: alphaDiffs === 0 && visibleWeightedMae <= maxVisibleWeightedMae,
    dimensionsMatch,
    alphaDiffs,
    visibleWeightedMae,
  };
}
