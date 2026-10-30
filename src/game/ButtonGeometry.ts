import { themeButtonGeometry } from './theme-button-geometry';
import type { VisualTheme } from './VisualTheme';

/** Keep labels over opaque button faces, excluding the lower/right cast shadow. */
export function themedButtonContentOffset(
  theme: VisualTheme,
  material: 'well' | 'button-primary' | 'button-secondary',
  height: number,
) {
  const { size, center } = themeButtonGeometry[theme][material];
  // Desktop pills preserve their edge insets through nine-slicing. Their X
  // correction follows the uniform height scale, rather than the stretched width.
  const width = material === 'well' ? height : (size[0] * height) / size[1];
  return { x: (center[0] - 0.5) * width, y: (center[1] - 0.5) * height };
}
