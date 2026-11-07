import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveService } from '../src/services/SaveService';
import { VISUAL_THEMES } from '../src/game/VisualTheme';

const key = 'bentoku.save.v1';
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
});

describe('visual theme saves', () => {
  it('opens a fresh game with Picnic Postcards first in the appearance choices', () => {
    expect(new SaveService().settings.visualTheme).toBe('picnic');
    expect(VISUAL_THEMES[0]).toEqual({ id: 'picnic', name: 'Picnic Postcards' });
  });

  it('defaults existing saves without a theme to picnic', () => {
    storage.set(
      key,
      JSON.stringify({ version: 1, settings: { difficulty: 'Gentle' }, stats: { solved: 2 } }),
    );
    expect(new SaveService().settings.visualTheme).toBe('picnic');
    expect(new SaveService().solvedCount).toBe(2);
  });

  it('rejects invalid stored and updated theme values', () => {
    storage.set(
      key,
      JSON.stringify({ version: 1, settings: { visualTheme: 'unknown' }, stats: { solved: 0 } }),
    );
    const save = new SaveService();
    expect(save.settings.visualTheme).toBe('picnic');
    save.updateSettings({ visualTheme: 'bad' as never });
    expect(new SaveService().settings.visualTheme).toBe('picnic');
  });

  it.each(['porcelain', 'maple'] as const)(
    'preserves explicit %s across reload and the current puzzle',
    (visualTheme) => {
      const save = new SaveService();
      const board = ['cat_egg', null, null, null, 'bear_rice', null, null, null, null] as const;
      save.savePuzzle('theme-test', 'Gentle', [...board], 4);
      save.updateSettings({ visualTheme });
      const reloaded = new SaveService();
      expect(reloaded.settings.visualTheme).toBe(visualTheme);
      expect(reloaded.currentSeed).toBe('theme-test');
      expect(reloaded.currentDifficulty).toBe('Gentle');
      expect(reloaded.loadPuzzle('theme-test', 'Gentle')).toEqual({ board, moves: 4 });
    },
  );
});
