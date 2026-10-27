export const VISUAL_THEMES = [
  {
    id: 'picnic',
    name: 'Picnic Postcards',
    description: 'A cheerful picnic of paper and gingham.',
  },
  {
    id: 'porcelain',
    name: 'Porcelain Logic',
    description: 'A quiet table with soft porcelain details.',
  },
  { id: 'maple', name: 'Maple Counter', description: 'A warm wooden counter in autumn tones.' },
] as const;

export type VisualTheme = (typeof VISUAL_THEMES)[number]['id'];
export const DEFAULT_VISUAL_THEME: VisualTheme = 'porcelain';

export function parseVisualTheme(value: unknown): VisualTheme {
  return VISUAL_THEMES.some((theme) => theme.id === value)
    ? (value as VisualTheme)
    : DEFAULT_VISUAL_THEME;
}
