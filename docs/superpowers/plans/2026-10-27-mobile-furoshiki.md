# Mobile Furoshiki Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a separately rendered mobile UI combining the complete clue overview with furoshiki pockets; preserve the desktop composition.

**Architecture:** Keep PuzzleScene as the single owner of puzzle, placement, undo, save, hint, sound and music state. A namespaced DOM MobileGameView renders the same public snapshot and invokes scene callbacks. Canvas desktop geometry and views remain unchanged. Mobile dialogs and clue enlargement use accessible HTML dialogs; orientation changes preserve the existing controllers.

**Tech Stack:** Existing TypeScript, Phaser, native DOM/CSS, Playwright; no new dependencies.

**Spec:** User-selected combination of Porcelain Logic clue overview and Furoshiki Fold styling, without Bento/Notes tabs or fill counter.

## Global Constraints

- Render every clue, including anchor plus six Master clues (7 total).
- Render nine board cells and twelve fixed inventory pockets; placed pieces leave an empty return target.
- Existing sprites and clue semantics remain authoritative; no new puzzle mechanics.
- Portrait and touch landscape fit available viewport; small-height fallback scrolls rather than overlaps.
- Explicit tap-to-enlarge notes; large touch buttons; pointer cancellation must not place a piece.
- Desktop screenshot must remain identical at the same seed/state.

## Review Focus

- Seven varying-size clues on short portrait screens.
- Mobile touch drag, swaps, return, undo, invalid drops and cancellation.
- Difficulty, help, settings sliders and winning dialogs.
- Resizing/orientation with selected piece, modal and persisted board.
- DOM focus and keyboard input must not also trigger hidden Phaser controls.

## Task 1: Mobile renderer and scene bridge

- [x] Add failing mobile e2e tests for portrait visibility, seven-clue overview and actual tap placement/undo.
- [x] Add MobileGameView, clue diagram renderer, dialog presenter and namespaced mobile styles; render state through PuzzleScene callbacks.
- [x] Add textile asset with reproducible source and runtime WebP.
- [x] Verify targeted mobile tests; capture portrait, short phone and touch-landscape screenshots.

## Task 2: Interaction hardening and validation

- [x] Add behavioral tests for drag/swap/return/cancel, clue enlargement, difficulty/settings/hints, victory and orientation.
- [x] Fix any observed issues and review real screenshots for collisions/readability.
- [x] Compare desktop canvas screenshot before/after and run existing desktop e2e.
- [x] Run full unit suite, lint, format check and production build.
- [x] Obtain independent code review, address actionable findings, provide local preview URL and screenshots.
