#!/usr/bin/env python3
"""Convert the five generated theme images into checked source PNG assets.

Requires Pillow and NumPy. Run --help for the sheet layout and usage.
All validation runs before any destination file is written.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
UI_NAMES = ("panel", "tray", "button-primary", "button-secondary", "logo", "well")
ANIMALS = ("cat", "bear", "pig", "bunny")
FOODS = ("egg", "rice", "sandwich")


class InvalidAsset(ValueError):
    pass


def open_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGBA")


def key_magenta(image: Image.Image) -> Image.Image:
    """Remove the magenta backing, softening and decontaminating its fringes.

    Pixels close to the key become transparent. At the transition, estimate
    coverage and unmix the known backing color to avoid a purple fringe.
    """
    arr = np.asarray(image.convert("RGBA"), dtype=np.float32).copy()
    rgb = arr[:, :, :3]
    key = np.array([255, 0, 255], dtype=np.float32)
    distance = np.sqrt(np.sum((rgb - key) ** 2, axis=2))
    coverage = np.clip((distance - 30.0) / 70.0, 0.0, 1.0)
    # A shadow darkens the backing, so it can be far from bright #ff00ff.
    # Estimate the magenta contribution and recover a neutral translucent
    # shadow rather than leaving the darkened backing opaque and purple.
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    chroma = np.minimum(red, blue) - green
    shadow = (chroma > 40) & (np.abs(red - blue) < 70) & (green < np.minimum(red, blue) * 0.5)
    shadow_alpha = np.clip(1.0 - chroma / 255.0, 0.0, 1.0)
    if np.any(shadow):
        c = np.maximum(shadow_alpha[shadow, None], 0.001)
        rgb[shadow] = np.clip((rgb[shadow] - (1 - c) * key) / c, 0, 255)
        fade = np.clip((shadow_alpha[shadow] - 0.14) / 0.08, 0.0, 1.0)
        coverage[shadow] = shadow_alpha[shadow] * fade
    partial = (coverage > 0) & (coverage < 1) & ~shadow
    if np.any(partial):
        c = coverage[partial, None]
        rgb[partial] = np.clip((rgb[partial] - (1 - c) * key) / c, 0, 255)
    arr[:, :, 3] *= coverage
    arr[arr[:, :, 3] < 1] = 0
    return Image.fromarray(np.uint8(np.round(arr)), "RGBA")


def remove_tiny_components(image: Image.Image) -> tuple[Image.Image, int]:
    """Remove only very small disconnected alpha islands using run-length labels."""
    data = np.array(image)
    mask = data[:, :, 3] > 0
    height, width = mask.shape
    parents: list[int] = []
    areas: list[int] = []
    runs: list[tuple[int, int, int, int]] = []
    previous: list[tuple[int, int, int]] = []

    def find(i: int) -> int:
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    for y in range(height):
        edges = np.flatnonzero(np.diff(np.pad(mask[y], (1, 1)).astype(np.int8)))
        current = []
        pos = 0
        for left, right in zip(edges[::2], edges[1::2]):
            while pos < len(previous) and previous[pos][1] < left - 1:
                pos += 1
            overlaps = []
            j = pos
            while j < len(previous) and previous[j][0] <= right:
                if previous[j][1] >= left - 1:
                    overlaps.append(find(previous[j][2]))
                j += 1
            if overlaps:
                label = overlaps[0]
                for other in overlaps[1:]:
                    other = find(other)
                    label = find(label)
                    if other != label:
                        parents[other] = label
                        areas[label] += areas[other]
                areas[find(label)] += int(right - left)
            else:
                label = len(parents)
                parents.append(label)
                areas.append(int(right - left))
            current.append((int(left), int(right), label))
            runs.append((y, int(left), int(right), label))
        previous = current

    minimum = max(3, int(width * height * 0.00002))
    removed = 0
    for y, left, right, label in runs:
        if areas[find(label)] < minimum:
            removed += right - left
            data[y, left:right] = 0
    return Image.fromarray(data, "RGBA"), removed


def metrics(image: Image.Image) -> dict:
    alpha = np.asarray(image.getchannel("A"))
    bbox = image.getchannel("A").getbbox()
    return {
        "size": list(image.size),
        "bbox": list(bbox) if bbox else None,
        "margins": [bbox[0], bbox[1], image.width - bbox[2], image.height - bbox[3]] if bbox else None,
        "alpha_extrema": [int(alpha.min()), int(alpha.max())],
        "nonzero_alpha_pixels": int(np.count_nonzero(alpha)),
    }


def require_content(image: Image.Image, name: str, *, edge_check: bool = True) -> dict:
    info = metrics(image)
    if not info["bbox"] or info["nonzero_alpha_pixels"] < max(8, image.width * image.height * 0.001):
        raise InvalidAsset(f"{name}: missing or too little foreground")
    if edge_check and min(info["margins"]) == 0:
        raise InvalidAsset(f"{name}: foreground touches the source edge; artwork may be clipped")
    return info


def check_ratio(image: Image.Image, ratio: float, name: str) -> None:
    if abs(image.width / image.height / ratio - 1) > 0.02:
        raise InvalidAsset(f"{name}: expected aspect ratio {ratio:.3f}, got {image.width}x{image.height}")


def grid_cells(image: Image.Image, cols: int, rows: int):
    for row in range(rows):
        for col in range(cols):
            # Integer boundaries cover every pixel even when dimensions aren't divisible.
            yield image.crop((col * image.width // cols, row * image.height // rows,
                              (col + 1) * image.width // cols, (row + 1) * image.height // rows))


def ui_cells(image: Image.Image, bottom_split: float, row_breaks: list[float], upper_split: float):
    """Crop each UI row independently; only the bottom row varies horizontally."""
    rows = [0, *(int(image.height * value) for value in row_breaks), image.height]
    mid_x = int(image.width * upper_split)
    split_x = int(image.width * bottom_split)
    cells = []
    for row in range(3):
        boundary = split_x if row == 2 else mid_x
        cells.append(image.crop((0, rows[row], boundary, rows[row + 1])))
        cells.append(image.crop((boundary, rows[row], image.width, rows[row + 1])))
    return cells


def piece_cells(image: Image.Image, column_breaks: list[float], row_breaks: list[float]):
    xs = [0, *(int(image.width * value) for value in column_breaks), image.width]
    ys = [0, *(int(image.height * value) for value in row_breaks), image.height]
    return [image.crop((xs[col], ys[row], xs[col + 1], ys[row + 1]))
            for row in range(3) for col in range(4)]


def clean_cell(cell: Image.Image, name: str) -> tuple[Image.Image, dict]:
    keyed, removed = remove_tiny_components(key_magenta(cell))
    info = require_content(keyed, name)
    info["removed_noise_pixels"] = removed
    return keyed, info


def trim_with_padding(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None
    padding = max(2, round(max(image.size) * 0.015))
    # Add transparent padding even where a bounding box approaches a source edge.
    subject = image.crop(bbox)
    out = Image.new("RGBA", (subject.width + 2 * padding, subject.height + 2 * padding))
    out.paste(subject, (padding, padding))
    return out


def normalize_piece(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None
    subject = image.crop(bbox)
    scale = 460 / max(subject.size)
    size = tuple(max(1, round(side * scale)) for side in subject.size)
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (512, 512))
    out.paste(subject, ((512 - size[0]) // 2, (512 - size[1]) // 2))
    return out


def process(args: argparse.Namespace) -> None:
    inputs = {name: open_image(getattr(args, name)) for name in ("board", "background", "ui_kit", "pieces", "preview")}
    check_ratio(inputs["board"], 1, "board")
    check_ratio(inputs["ui_kit"], 4 / 3, "ui-kit")
    check_ratio(inputs["pieces"], 4 / 3, "pieces")
    if inputs["background"].height <= inputs["background"].width:
        raise InvalidAsset("background: expected portrait artwork")

    board, board_noise = remove_tiny_components(key_magenta(inputs["board"]))
    report = {"theme": args.theme, "ui_bottom_split": args.ui_bottom_split, "ui_upper_split": args.ui_upper_split, "ui_row_breaks": args.ui_row_breaks,
              "piece_column_breaks": args.piece_column_breaks, "piece_row_breaks": args.piece_row_breaks,
              "sources": {name: str(getattr(args, name).resolve()) for name in inputs},
              "board": require_content(board, "board"), "ui": {}, "pieces": {}}
    report["board"]["removed_noise_pixels"] = board_noise
    if args.trim_board:
        bbox = board.getchannel("A").getbbox()
        assert bbox is not None
        padding = max(2, round(max(board.size) * 0.005))
        subject = board.crop(bbox)
        board = Image.new("RGBA", (subject.width + 2 * padding, subject.height + 2 * padding))
        board.paste(subject, (padding, padding))
        report["board"]["source_bbox"] = list(bbox)
        report["board"]["trim_padding"] = padding
        report["board"]["output"] = metrics(board)
    assets = {"board": board}
    assets["background"] = ImageOps.fit(inputs["background"], (768, 1664), method=Image.Resampling.LANCZOS)
    report["background"] = {"source_size": list(inputs["background"].size), **metrics(assets["background"])}

    for name, cell in zip(UI_NAMES, ui_cells(inputs["ui_kit"], args.ui_bottom_split, args.ui_row_breaks, args.ui_upper_split)):
        clean, info = clean_cell(cell, name)
        assets[name] = trim_with_padding(clean)
        report["ui"][name] = {"source": info, "output": metrics(assets[name])}

    for index, cell in enumerate(piece_cells(inputs["pieces"], args.piece_column_breaks, args.piece_row_breaks)):
        name = f"{ANIMALS[index % 4]}_{FOODS[index // 4]}"
        clean, info = clean_cell(cell, name)
        assets[f"pieces/{name}"] = normalize_piece(clean)
        report["pieces"][name] = {"source": info, "output": metrics(assets[f"pieces/{name}"])}

    preview = inputs["preview"].copy()
    preview = preview.resize((256, max(1, round(preview.height * 256 / preview.width))), Image.Resampling.LANCZOS)
    assets["preview"] = preview
    report["preview"] = metrics(preview)
    source_dir = args.root / "art/runtime-sources/themes" / args.theme
    for name, image in assets.items():
        png = source_dir / f"{name}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        image.save(png, format="PNG")
    (source_dir / "qc.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Processed {len(assets)} source assets for {args.theme}; QC: {source_dir / 'qc.json'}. Run pnpm assets:build to regenerate runtime WebPs.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Process theme artwork into source PNGs. UI: 2 columns x 3 rows; pieces: 4 animals x 3 foods.")
    parser.add_argument("--theme", choices=("picnic", "porcelain", "maple"), required=True)
    for flag in ("board", "background", "ui-kit", "pieces", "preview"):
        parser.add_argument(f"--{flag}", type=Path, required=True, help=f"raw {flag} image")
    parser.add_argument("--root", type=Path, default=ROOT, help="project root (default: this script's parent project)")
    parser.add_argument("--trim-board", action="store_true", help="trim transparent board padding while retaining a 0.5%% safety border")
    parser.add_argument("--ui-bottom-split", type=float, default=0.5,
                        help="horizontal split as a fraction of sheet width for logo/well only (default: 0.5)")
    parser.add_argument("--ui-upper-split", type=float, default=0.5,
                        help="horizontal split as a fraction of sheet width for first two rows (default: 0.5)")
    parser.add_argument("--ui-row-breaks", type=float, nargs=2, default=[1 / 3, 2 / 3], metavar=("FIRST", "SECOND"),
                        help="row boundaries as fractions of sheet height (default: 1/3 2/3)")
    parser.add_argument("--piece-column-breaks", type=float, nargs=3, default=[0.25, 0.5, 0.75], metavar=("FIRST", "SECOND", "THIRD"),
                        help="piece column boundaries as fractions of sheet width")
    parser.add_argument("--piece-row-breaks", type=float, nargs=2, default=[1 / 3, 2 / 3], metavar=("FIRST", "SECOND"),
                        help="piece row boundaries as fractions of sheet height")
    args = parser.parse_args()
    if not 0 < args.ui_bottom_split < 1:
        parser.error("--ui-bottom-split must be greater than 0 and less than 1")
    if not 0 < args.ui_upper_split < 1:
        parser.error("--ui-upper-split must be greater than 0 and less than 1")
    if not 0 < args.ui_row_breaks[0] < args.ui_row_breaks[1] < 1:
        parser.error("--ui-row-breaks must be increasing fractions between 0 and 1")
    if not 0 < args.piece_column_breaks[0] < args.piece_column_breaks[1] < args.piece_column_breaks[2] < 1:
        parser.error("--piece-column-breaks must be increasing fractions between 0 and 1")
    if not 0 < args.piece_row_breaks[0] < args.piece_row_breaks[1] < 1:
        parser.error("--piece-row-breaks must be increasing fractions between 0 and 1")
    try:
        process(args)
    except (InvalidAsset, OSError, ValueError) as exc:
        print(f"Theme processing failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
