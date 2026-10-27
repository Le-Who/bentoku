import type { CluePattern } from '../puzzle/types';

const NS = 'http://www.w3.org/2000/svg';

/** The exact same cell coordinates and combined marks as the canvas clue view. */
export function clueDiagram(clue: CluePattern): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('mobile-clue-grid');
  svg.setAttribute('viewBox', `0 0 ${clue.width * 40} ${clue.height * 40}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', clue.name);
  const grid = document.createElementNS(NS, 'path');
  let lines = '';
  for (let x = 0; x <= clue.width; x++) lines += `M${x * 40} 0V${clue.height * 40} `;
  for (let y = 0; y <= clue.height; y++) lines += `M0 ${y * 40}H${clue.width * 40} `;
  grid.setAttribute('d', lines);
  grid.setAttribute('fill', 'none');
  grid.setAttribute('stroke', '#675a47');
  grid.setAttribute('stroke-width', '1.3');
  svg.append(grid);
  for (const cell of clue.cells) {
    const x = cell.x * 40;
    const y = cell.y * 40;
    const marks = [cell.animal, cell.food].filter((mark) => mark !== undefined);
    if (!marks.length) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(x + 20));
      dot.setAttribute('cy', String(y + 20));
      dot.setAttribute('r', '1.6');
      dot.setAttribute('fill', '#675a47');
      svg.append(dot);
    }
    marks.forEach((mark, index) => {
      const image = document.createElementNS(NS, 'image');
      const combined = marks.length === 2;
      image.setAttribute('href', `assets/clues/${mark}.webp`);
      image.setAttribute('x', String(x + (combined ? (index ? 17 : 1) : 3)));
      image.setAttribute('y', String(y + (combined ? (index ? 17 : 1) : 3)));
      image.setAttribute('width', combined ? '22' : '34');
      image.setAttribute('height', combined ? '22' : '34');
      svg.append(image);
    });
    if (marks.length === 2) {
      const slash = document.createElementNS(NS, 'path');
      slash.setAttribute('d', `M${x + 6} ${y + 34}L${x + 34} ${y + 6}`);
      slash.setAttribute('stroke', '#675a47');
      slash.setAttribute('stroke-width', '1');
      svg.append(slash);
    }
  }
  return svg;
}
