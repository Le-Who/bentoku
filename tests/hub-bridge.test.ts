import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectHubBridge } from '../src/platform/HubBridge';

afterEach(() => vi.unstubAllGlobals());

function fixture(search = '?embed=ccgh', referrer = 'https://games.tri.mom/') {
  const target = new EventTarget();
  const parent = { postMessage: vi.fn() };
  const states: boolean[] = [];
  vi.stubGlobal('window', Object.assign(target, { location: { search }, parent }));
  vi.stubGlobal('document', { referrer });
  const dispose = connectHubBridge((active) => states.push(active));
  const receive = (patch = {}) =>
    target.dispatchEvent(
      Object.assign(new Event('message'), {
        source: parent,
        origin: 'https://games.tri.mom',
        data: { type: 'ccgh:bentoku:visibility', version: 1, visible: true },
        ...patch,
      }),
    );
  return { parent, states, dispose, receive };
}

describe('Game Hub embedding', () => {
  it('pauses until its parent connects, then follows only validated visibility messages', () => {
    const f = fixture();
    expect(f.states).toEqual([false]);
    expect(f.parent.postMessage).toHaveBeenCalledWith(
      { type: 'bentoku:ready', version: 1 },
      'https://games.tri.mom',
    );
    for (const patch of [
      { origin: 'https://other.example' },
      { source: {} },
      { data: null },
      { data: { type: 'ccgh:bentoku:visibility', version: 2, visible: true } },
      { data: { type: 'ccgh:bentoku:visibility', version: 1, visible: 'true' } },
    ])
      f.receive(patch);
    expect(f.states).toEqual([false]);
    f.receive();
    f.receive({ data: { type: 'ccgh:bentoku:visibility', version: 1, visible: false } });
    expect(f.states).toEqual([false, true, false]);
    f.dispose();
    f.receive();
    expect(f.states).toEqual([false, true, false]);
  });

  it('leaves ordinary browser play and invalid embedding contexts unchanged', () => {
    for (const [search, referrer] of [
      ['', 'https://games.tri.mom/'],
      ['?embed=ccgh', ''],
      ['?embed=ccgh', 'http://untrusted.example/'],
    ]) {
      const f = fixture(search, referrer);
      f.receive();
      expect(f.states).toEqual([]);
      f.dispose();
    }
  });
});
