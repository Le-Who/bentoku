import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assessRgba } from './asset-quality.mjs';

const pixels = (values, width = values.length / 4, height = 1) => ({
  data: Buffer.from(values),
  info: { width, height, channels: 4 },
});

test('accepts small visible RGB changes and ignores fully transparent RGB', () => {
  const source = pixels([100, 120, 140, 255, 20, 30, 40, 0]);
  const compressed = pixels([102, 118, 141, 255, 255, 255, 255, 0]);
  const result = assessRgba(source, compressed, 2);
  assert.equal(result.okay, true);
  assert.ok(Math.abs(result.visibleWeightedMae - 5 / 3) < 1e-10);
});

test('rejects changed alpha, dimensions, and excessive visible error', () => {
  const source = pixels([100, 100, 100, 255]);
  assert.equal(assessRgba(source, pixels([100, 100, 100, 254]), 8).okay, false);
  assert.equal(assessRgba(source, pixels([100, 100, 100, 255], 1, 2), 8).okay, false);
  assert.equal(assessRgba(source, pixels([120, 120, 120, 255]), 8).okay, false);
});
