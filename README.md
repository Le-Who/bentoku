# Bentoku

Bentoku is a finished client-side browser puzzle about arranging nine tiny kawaii food friends inside a 3 × 3 bento box. Twelve pieces are available: choose exactly three complete animal families and leave the fourth family on the tray. The order-note sketches describe relative spatial relationships, and every generated puzzle is proven unique from the rules visible to the player.

## Play

- Click or tap a piece, then a bento cell.
- Drag a piece directly into the box.
- Drop one placed piece onto another to swap them.
- Drop a placed piece back on the tray to return it.
- Choose Cozy, Gentle, Clever, Tricky, or Master from the difficulty button. Every level is deduction-only; higher levels use longer chains instead of guesses. Master leaves at least one café-map cell blank and links five or six substantial sliding sketches.
- Set effects and music volume independently in Cozy settings; the Effects switch remains available for quick muting.
- Use `Tab` or arrow keys to move focus, `Enter`/`Space` to select or place, `U` to undo, `H` for help, `D` for difficulty, and `S` for settings.
- Click the seed to copy a shareable link. Daily and random bentos work without a backend.
- Phones have a separate touch layout with all order sketches above the board. Tap any sketch to enlarge it; use taps or drag pieces between the board and the twelve fixed square family slots. Rotation keeps the same game. The narrow desktop preview keeps its own portrait layout; very short windows scroll instead of squeezing the touch targets.
- In mobile **Settings → Appearance**, choose **Picnic Postcards**, **Porcelain Logic**, or **Maple Counter**. Each theme includes its own illustrated materials and all twelve food friends. The choice is saved locally; switching preserves the puzzle, placements, and undo history. A theme is applied only after its complete artwork loads.
- To preview the mobile presentation on a desktop browser, add `?layout=mobile` to the URL. The regular desktop canvas keeps its original composition.

## Development

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm preview
pnpm assets:build
pnpm assets:verify
```

The 12,500-puzzle suite is part of `pnpm test` and covers all five difficulty levels. It independently verifies public-rule uniqueness and completion by the deterministic deduction solver. All art is prepared ahead of time and shipped as lossy WebP assets; the production game never calls an image-generation API. Source PNG and JPEG files remain under `art/` and never enter the runtime bundle. `assets:verify` decodes each source and WebP, checks exact dimensions and alpha, and limits opacity-weighted visible RGB error. The encoding settings, quality comparison, and per-file size measurements are recorded in `art/asset-compression.json`.

On Windows, stop the local dev and preview servers before `pnpm assets:build` so they release open image files.

## Architecture

- Phaser 4.2.1 canvas game
- TypeScript and Vite 8.1
- Seeded solution-first generator
- A public-rule exact solver that considers all 12 visible pieces
- A separate no-assumption deduction solver using constraint propagation, sliding-pattern support, complete-family elimination, and all-different matching
- Information-gain clue selection and five measured deduction profiles
- Local persistence, softly synthesized sound effects, and a compressed gently faded BGM playlist
- No backend and no runtime network dependency for game logic or art

The art direction, prompts, source generations, and manifest live under `art/`. The mobile-theme references and processing parameters are recorded in `art/mobile-theme-manifest.json`; the 63 normalized source PNGs live in `art/runtime-sources/themes/`. Rebuild the runtime WebPs and opaque-character centering data from source with `pnpm assets:build`. The mobile font is bundled locally with its OFL license in `public/assets/fonts/`.
