"""Contract checks for the deterministic theme-asset command."""
import json
import runpy
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "process-theme-assets.py"


class ThemeAssetsTest(unittest.TestCase):
    def test_dark_magenta_backing_becomes_neutral_translucent_shadow(self):
        key_magenta = runpy.run_path(str(SCRIPT))["key_magenta"]
        source = Image.new("RGBA", (1, 1), (128, 0, 128, 255))
        result = key_magenta(source).getpixel((0, 0))
        self.assertLessEqual(max(result[:3]) - min(result[:3]), 2)
        self.assertGreater(result[3], 100)
        self.assertLess(result[3], 155)

    def make_inputs(self, directory, empty_piece=False, wide_logo=False, shifted_ui_rows=False, shifted_pieces=False, faint_key_edge=False, wide_ui_upper=False):
        paths = {name: directory / f"{name}.png" for name in ("board", "background", "ui", "pieces", "preview")}
        board = Image.new("RGB", (300, 300), "magenta")
        ImageDraw.Draw(board).rectangle((35, 40, 270, 260), fill=(140, 90, 30))
        board.save(paths["board"])
        Image.new("RGB", (500, 900), (230, 190, 120)).save(paths["background"])
        Image.new("RGB", (500, 900), (200, 180, 120)).save(paths["preview"])
        ui = Image.new("RGB", (240, 180), "magenta")
        draw = ImageDraw.Draw(ui)
        for row in range(3):
            for col in range(2):
                if row == 2 and wide_logo:
                    bounds = (20, 130, 142, 169) if col == 0 else (165, 130, 220, 169)
                else:
                    bounds = (col * 120 + 20, row * 60 + 10, col * 120 + 90, row * 60 + 49)
                if shifted_ui_rows:
                    top, bottom = ((10, 67), (80, 105), (130, 169))[row]
                    bounds = (col * 120 + 20, top, col * 120 + 90, bottom)
                if wide_ui_upper and row < 2:
                    left, right = ((20, 124), (135, 220))[col]
                    bounds = (left, row * 60 + 10, right, row * 60 + 49)
                draw.rectangle(bounds, fill=(90, 140, 70))
        ui.save(paths["ui"])
        pieces = Image.new("RGB", (320, 240), "magenta")
        draw = ImageDraw.Draw(pieces)
        for row in range(3):
            for col in range(4):
                if not (empty_piece and row == 2 and col == 3):
                    if shifted_pieces:
                        x0, x1 = ((10, 84), (95, 165), (175, 244), (260, 310))[col]
                        y0, y1 = ((10, 84), (95, 164), (175, 230))[row]
                        bounds = (x0, y0, x1, y1)
                    else:
                        bounds = (col * 80 + 16, row * 80 + 12, col * 80 + 64, row * 80 + 67)
                    draw.ellipse(bounds, fill=(230, 190, 120))
        if faint_key_edge:
            draw.line((0, 239, 319, 239), fill=(246, 14, 242))
        pieces.save(paths["pieces"])
        return paths

    def run_processor(self, root, paths, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), "--theme", "picnic", "--root", str(root), "--board", str(paths["board"]), "--background", str(paths["background"]), "--ui-kit", str(paths["ui"]), "--pieces", str(paths["pieces"]), "--preview", str(paths["preview"]), *extra], capture_output=True, text=True)

    def test_complete_input_preserves_board_geometry_and_normalizes_pieces(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = self.run_processor(root, self.make_inputs(root))
            self.assertEqual(result.returncode, 0, result.stderr)
            source = root / "art/runtime-sources/themes/picnic"
            runtime = root / "public/assets/themes/picnic"
            with Image.open(source / "board.png") as board:
                self.assertEqual(board.size, (300, 300))
                self.assertEqual(board.getchannel("A").getbbox(), (35, 40, 271, 261))
            with Image.open(source / "pieces/cat_egg.png") as piece:
                self.assertEqual(piece.size, (512, 512))
                bbox = piece.getchannel("A").getbbox()
                self.assertGreaterEqual(max(bbox[2] - bbox[0], bbox[3] - bbox[1]), 459)
                self.assertLessEqual(max(bbox[2] - bbox[0], bbox[3] - bbox[1]), 462)
            with Image.open(runtime / "preview.webp") as preview:
                self.assertEqual(preview.width, 256)
            report = json.loads((source / "qc.json").read_text(encoding="utf-8"))
            self.assertEqual(len(report["pieces"]), 12)

    def test_missing_piece_fails_without_publishing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = self.run_processor(root, self.make_inputs(root, empty_piece=True))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("bunny_sandwich", result.stderr)
            self.assertFalse((root / "public/assets/themes/picnic").exists())

    def test_bottom_row_override_preserves_wide_logo(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = self.make_inputs(root, wide_logo=True)
            default = self.run_processor(root, paths)
            self.assertNotEqual(default.returncode, 0)
            self.assertIn("logo", default.stderr)
            result = self.run_processor(root, paths, "--ui-bottom-split", "0.63")
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((root / "art/runtime-sources/themes/picnic/qc.json").read_text(encoding="utf-8"))
            self.assertEqual(report["ui"]["logo"]["source"]["bbox"], [20, 10, 143, 50])
            self.assertEqual(report["ui"]["well"]["source"]["bbox"], [14, 10, 70, 50])
            self.assertEqual(report["ui"]["panel"]["source"]["size"], [120, 60])

    def test_ui_row_breaks_preserve_art_crossing_nominal_boundary(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = self.make_inputs(root, shifted_ui_rows=True)
            default = self.run_processor(root, paths)
            self.assertNotEqual(default.returncode, 0)
            self.assertIn("panel", default.stderr)
            result = self.run_processor(root, paths, "--ui-row-breaks", "0.39", "0.64")
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((root / "art/runtime-sources/themes/picnic/qc.json").read_text(encoding="utf-8"))
            self.assertEqual(report["ui_row_breaks"], [0.39, 0.64])
            self.assertEqual(report["ui"]["panel"]["source"]["bbox"], [20, 10, 91, 68])
            self.assertEqual(report["ui"]["button-primary"]["source"]["size"], [120, 45])

    def test_piece_breaks_preserve_complete_art_between_grid_lines(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = self.make_inputs(root, shifted_pieces=True)
            default = self.run_processor(root, paths)
            self.assertNotEqual(default.returncode, 0)
            self.assertIn("cat_egg", default.stderr)
            result = self.run_processor(root, paths, "--piece-column-breaks", "0.28", "0.53", "0.79", "--piece-row-breaks", "0.375", "0.70")
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((root / "art/runtime-sources/themes/picnic/qc.json").read_text(encoding="utf-8"))
            self.assertEqual(report["piece_column_breaks"], [0.28, 0.53, 0.79])
            self.assertEqual(report["piece_row_breaks"], [0.375, 0.70])
            self.assertEqual(len(report["pieces"]), 12)

    def test_faint_magenta_key_noise_does_not_trigger_edge_clip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = self.run_processor(root, self.make_inputs(root, faint_key_edge=True))
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_upper_ui_split_preserves_wide_panel_and_buttons(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = self.make_inputs(root, wide_ui_upper=True)
            default = self.run_processor(root, paths)
            self.assertNotEqual(default.returncode, 0)
            self.assertIn("panel", default.stderr)
            result = self.run_processor(root, paths, "--ui-upper-split", "0.54")
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((root / "art/runtime-sources/themes/picnic/qc.json").read_text(encoding="utf-8"))
            self.assertEqual(report["ui_upper_split"], 0.54)
            self.assertEqual(report["ui"]["panel"]["source"]["bbox"], [20, 10, 125, 50])

    def test_trim_board_keeps_subject_and_records_crop(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = self.run_processor(root, self.make_inputs(root), "--trim-board")
            self.assertEqual(result.returncode, 0, result.stderr)
            source = root / "art/runtime-sources/themes/picnic"
            with Image.open(source / "board.png") as board:
                self.assertEqual(board.size, (240, 225))
                self.assertEqual(board.getchannel("A").getbbox(), (2, 2, 238, 223))
            report = json.loads((source / "qc.json").read_text(encoding="utf-8"))
            self.assertEqual(report["board"]["source_bbox"], [35, 40, 271, 261])
            self.assertEqual(report["board"]["trim_padding"], 2)


if __name__ == "__main__":
    unittest.main()
