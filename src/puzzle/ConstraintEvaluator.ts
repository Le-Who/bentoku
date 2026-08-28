import type { BentoPiece, Board, ClueCell, CluePattern, PieceId } from './types';

export const pieceMatchesCell = (piece: BentoPiece, clueCell: ClueCell): boolean =>
  (!clueCell.animal || clueCell.animal === piece.animal) &&
  (!clueCell.food || clueCell.food === piece.food);

export interface ClueOffset {
  x: number;
  y: number;
}

const PRECOMPUTED_OFFSETS: ClueOffset[][][] = Array.from({ length: 4 }, () => []);

for (let w = 1; w <= 3; w++) {
  for (let h = 1; h <= 3; h++) {
    const offsets: ClueOffset[] = [];
    for (let y = 0; y <= 3 - h; y += 1) {
      for (let x = 0; x <= 3 - w; x += 1) {
        offsets.push({ x, y });
      }
    }
    PRECOMPUTED_OFFSETS[w]![h] = offsets;
  }
}

export const getClueOffsets = (clue: CluePattern): ClueOffset[] =>
  PRECOMPUTED_OFFSETS[clue.width]![clue.height]!;

const positionAt = (cell: ClueCell, offset: ClueOffset): number =>
  (cell.y + offset.y) * 3 + cell.x + offset.x;

export const clueCouldMatch = (
  board: Board,
  clue: CluePattern,
  pieceMap: ReadonlyMap<PieceId, BentoPiece>,
): boolean => {
  const offsets = getClueOffsets(clue);
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i]!;
    let match = true;
    for (let j = 0; j < clue.cells.length; j++) {
      const cell = clue.cells[j]!;
      const pieceId = board[positionAt(cell, offset)];
      if (!pieceId || (!cell.animal && !cell.food)) continue;
      const piece = pieceMap.get(pieceId);
      if (!piece || !pieceMatchesCell(piece, cell)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
};

export const clueMatchesBoard = (
  board: Board,
  clue: CluePattern,
  pieceMap: ReadonlyMap<PieceId, BentoPiece>,
): boolean => {
  const offsets = getClueOffsets(clue);
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i]!;
    let match = true;
    for (let j = 0; j < clue.cells.length; j++) {
      const cell = clue.cells[j]!;
      if (!cell.animal && !cell.food) continue;
      const pieceId = board[positionAt(cell, offset)];
      if (!pieceId) {
        match = false;
        break;
      }
      const piece = pieceMap.get(pieceId);
      if (!piece || !pieceMatchesCell(piece, cell)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
};

export const boardSatisfiesPuzzle = (
  board: Board,
  clues: readonly CluePattern[],
  pieceMap: ReadonlyMap<PieceId, BentoPiece>,
): boolean => clues.every((clue) => clueMatchesBoard(board, clue, pieceMap));
