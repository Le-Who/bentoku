export const VISUAL_THEMES = [
  {
    id: 'picnic',
    name: 'Picnic Postcards',
  },
  {
    id: 'porcelain',
    name: 'Porcelain Logic',
  },
  { id: 'maple', name: 'Maple Counter' },
] as const;

export type VisualTheme = (typeof VISUAL_THEMES)[number]['id'];
export const DEFAULT_VISUAL_THEME: VisualTheme = 'picnic';

export function parseVisualTheme(value: unknown): VisualTheme {
  return VISUAL_THEMES.some((theme) => theme.id === value)
    ? (value as VisualTheme)
    : DEFAULT_VISUAL_THEME;
}
