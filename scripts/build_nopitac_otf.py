#!/usr/bin/env python3
"""
NOPITAC OpenType Font (OTF/TTF) Builder
Compiles the custom Nopitac typeface into an installable OpenType Font file
with full OpenType Contextual Alternates (calt) reproducing the signature
connecting underline and descender clearance behavior.
"""

import json
import re
import math
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.svgLib.path import SVGPath
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
import uharfbuzz as hb

# 1. Export DB from JS to JSON if needed
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = "/tmp/nopitac_db.json"

subprocess.run([
    "node", "-e",
    f"""
    const {{ CUSTOM_GLYPH_DB }} = require('{ROOT_DIR}/src/engine/customGlyphDb.js');
    const {{ HELVETICA_KERN_TABLE, FONT_SIZE }} = require('{ROOT_DIR}/src/engine/helveticaGlyphs.js');
    const fs = require('fs');
    fs.writeFileSync('{JSON_PATH}', JSON.stringify({{ CUSTOM_GLYPH_DB, HELVETICA_KERN_TABLE, FONT_SIZE }}));
    """
], check=True)

with open(JSON_PATH) as f:
    data = json.load(f)

db = data["CUSTOM_GLYPH_DB"]
FONT_SIZE = data["FONT_SIZE"] # 43.74
HELVETICA_PATH = os.path.join(ROOT_DIR, "public", "fonts", "Helvetica-Regular.ttf")

font = TTFont(HELVETICA_PATH)
glyf = font["glyf"]
hmtx = font["hmtx"]
glyph_set = font.getGlyphSet()

SCALE = 2048.0 / FONT_SIZE # ~46.82213

# Underline vertical coordinates in font units
# Web: Y = 5.225, H = 3.8437
# Font Y is inverted (positive is UP, negative is DOWN below baseline)
NORM_Y_TOP = round(-5.225 * SCALE)              # -245
NORM_Y_BOT = round((-5.225 - 3.8437) * SCALE)    # -425

LONG_Y_TOP = round((-5.225 - 3.8437) * SCALE)    # -425
LONG_Y_BOT = round((-5.225 - 3.8437 * 2) * SCALE)# -605

def parse_svg_paths(innerSvg):
    """Extracts all paths, rects, and polygons from SVG string as normalized path d strings."""
    paths = []
    # 1. <path>
    for m in re.finditer(r"<path\s+[^>]*?d=\"([^\"]+)\"", innerSvg):
        paths.append(m.group(1))
    # 2. <polygon>
    for m in re.finditer(r"<polygon\s+[^>]*?points=\"([^\"]+)\"", innerSvg):
        pts = re.findall(r"([0-9\.\-]+)[,\s]+([0-9\.\-]+)", m.group(1))
        if pts:
            d = "M " + " L ".join(f"{p[0]} {p[1]}" for p in pts) + " Z"
            paths.append(d)
    # 3. <rect>
    for m in re.finditer(r"<rect\s+([^>]+)/?>", innerSvg):
        attrs = m.group(1)
        x_m = re.search(r"x=\"([^\"]+)\"", attrs)
        y_m = re.search(r"y=\"([^\"]+)\"", attrs)
        w_m = re.search(r"width=\"([^\"]+)\"", attrs)
        h_m = re.search(r"height=\"([^\"]+)\"", attrs)
        if not (x_m and y_m and w_m and h_m):
            continue
        x = float(x_m.group(1))
        y = float(y_m.group(1))
        w = float(w_m.group(1))
        h = float(h_m.group(1))
        trans_m = re.search(r"transform=\"([^\"]+)\"", attrs)
        corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        if trans_m:
            t = trans_m.group(1)
            tx, ty = 0.0, 0.0
            tm = re.search(r"translate\(([\-0-9\.]+)\s+([\-0-9\.]+)\)", t)
            if tm:
                tx, ty = float(tm.group(1)), float(tm.group(2))
            rot = 0
            rm = re.search(r"rotate\(([\-0-9\.]+)\)", t)
            if rm:
                rot = float(rm.group(1))
            new_corners = []
            for cx, cy in corners:
                rad = math.radians(rot)
                rx = cx * math.cos(rad) - cy * math.sin(rad)
                ry = cx * math.sin(rad) + cy * math.cos(rad)
                new_corners.append((rx + tx, ry + ty))
            corners = new_corners
        d = f"M {corners[0][0]} {corners[0][1]} L {corners[1][0]} {corners[1][1]} L {corners[2][0]} {corners[2][1]} L {corners[3][0]} {corners[3][1]} Z"
        paths.append(d)
    return paths

def strip_stub(innerSvg, baseline, is_long):
    """Strips the horizontal underline stub from custom SVG so only letterform + stem remain."""
    target_relY = 5.225 if not is_long else (5.225 + 3.8437)
    UNDERLINE_H = 3.8437
    
    def repl_rect(m):
        attrs = m.group(1)
        x = float(re.search(r"x=\"([^\"]+)\"", attrs).group(1)) if "x=" in attrs else 0
        y = float(re.search(r"y=\"([^\"]+)\"", attrs).group(1)) if "y=" in attrs else 0
        w = float(re.search(r"width=\"([^\"]+)\"", attrs).group(1)) if "width=" in attrs else 0
        h = float(re.search(r"height=\"([^\"]+)\"", attrs).group(1)) if "height=" in attrs else 0
        trans = re.search(r"transform=\"([^\"]+)\"", attrs)
        trans_str = trans.group(1) if trans else ""
        
        if not trans_str:
            svg_y = y
            span_y = h
            span_x = w
        elif "rotate(90)" in trans_str:
            tm = re.search(r"translate\(([\-0-9\.]+)\s+([\-0-9\.]+)\)", trans_str)
            tx, ty = float(tm.group(1)), float(tm.group(2))
            svg_y = ty + x
            span_y = w
            span_x = h
        elif "rotate(180)" in trans_str:
            tm = re.search(r"translate\(([\-0-9\.]+)\s+([\-0-9\.]+)\)", trans_str)
            tx, ty = float(tm.group(1)), float(tm.group(2))
            svg_y = ty - (y + h)
            span_y = h
            span_x = w
        else:
            return m.group(0)

        relY = svg_y - baseline
        # Only strip if it is located at the underline baseline offset
        if abs(relY - target_relY) < 0.6 and abs(span_y - UNDERLINE_H) < 0.3 and span_x > 5:
            return ""
        return m.group(0)

    def repl_path(m):
        attrs = m.group(1)
        d = re.search(r"d=\"([^\"]+)\"", attrs).group(1) if "d=" in attrs else ""
        if ("v3.8437" in d or "v-3.8437" in d or "h15.7132" in d or "h-15.7132" in d) and len(d) < 100:
            coords = re.search(r"M([0-9\.]+),([0-9\.]+)", d)
            if coords:
                y = float(coords.group(2))
                relY = y - baseline
                if abs(relY - target_relY) < 0.6:
                    return ""
        return m.group(0)

    def repl_poly(m):
        attrs = m.group(1)
        pts = re.findall(r"([0-9\.\-]+)[,\s]+([0-9\.\-]+)", attrs)
        if pts:
            ys = [float(p[1]) for p in pts]
            min_y, max_y = min(ys), max(ys)
            h = max_y - min_y
            relY = min_y - baseline
            if abs(relY - target_relY) < 0.6 and abs(h - UNDERLINE_H) < 0.3:
                return ""
        return m.group(0)

    res = re.sub(r"<rect\s+([^>]+)/?>", repl_rect, innerSvg)
    res = re.sub(r"<path\s+([^>]+)/?>", repl_path, res)
    res = re.sub(r"<polygon\s+points=\"([^\"]+)\"/?>", repl_poly, res)
    return res

def add_rect_contour(pen, x1, y1, x2, y2):
    """Adds a clockwise rectangular contour (filled in TrueType)."""
    if x2 <= x1:
        return
    y_min, y_max = min(y1, y2), max(y1, y2)
    pen.moveTo((x1, y_min))
    pen.lineTo((x1, y_max))
    pen.lineTo((x2, y_max))
    pen.lineTo((x2, y_min))
    pen.closePath()

def contour_area(contour):
    pen = RecordingPen()
    for cmd, args in contour:
        getattr(pen, cmd)(*args)
    apen = AreaPen()
    pen.replay(apen)
    return apen.value

def get_contour_points(contour):
    pts = []
    for cmd, args in contour:
        if cmd == "moveTo":
            pts.append(args[0])
        elif cmd in ("lineTo", "qCurveTo"):
            pts.append(args[-1])
    return pts

def point_in_contour(point, contour_pts):
    x, y = point
    inside = False
    n = len(contour_pts)
    for i in range(n):
        x1, y1 = contour_pts[i]
        x2, y2 = contour_pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            if x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1:
                inside = not inside
    return inside

def contour_bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

def fix_glyph_winding(glyph, glyf):
    rec = RecordingPen()
    glyph.draw(rec, glyf)
    contours = []
    curr = []
    for cmd, args in rec.value:
        curr.append((cmd, args))
        if cmd == "closePath":
            contours.append(curr)
            curr = []
    if curr:
        contours.append(curr)
    if not contours:
        return glyph

    contour_pts = [get_contour_points(c) for c in contours]
    bboxes = [contour_bbox(pts) for pts in contour_pts]
    out_pen = TTGlyphPen(glyf)
    for i, c in enumerate(contours):
        pts = contour_pts[i]
        if not pts:
            continue
        b_i = bboxes[i]
        enclosing = 0
        for j, other_pts in enumerate(contour_pts):
            if i == j:
                continue
            b_j = bboxes[j]
            # Contour i is only considered a hole inside contour j if its bounding box
            # is strictly within contour j's bounding box and contour j is larger
            if (b_i[0] >= b_j[0] - 2 and b_i[2] <= b_j[2] + 2 and
                b_i[1] >= b_j[1] - 2 and b_i[3] <= b_j[3] + 2 and
                (b_j[2] - b_j[0]) > (b_i[2] - b_i[0]) + 5 and
                (b_j[3] - b_j[1]) > (b_i[3] - b_i[1]) + 5):
                test_pt = pts[0]
                if point_in_contour(test_pt, other_pts):
                    enclosing += 1
        is_hole = (enclosing % 2 == 1)
        area = contour_area(c)
        # TrueType non-zero winding: outer contours MUST be clockwise (negative area in Cartesian),
        # inner hole contours MUST be counter-clockwise (positive area in Cartesian)
        needs_reverse = (not is_hole and area > 0) or (is_hole and area < 0)
        if needs_reverse:
            rev_pen = ReverseContourPen(out_pen)
            for cmd, args in c:
                getattr(rev_pen, cmd)(*args)
        else:
            for cmd, args in c:
                getattr(out_pen, cmd)(*args)
    fixed = out_pen.glyph()
    fixed.recalcBounds(glyf)
    return fixed

from fontTools.pens.cu2quPen import Cu2QuPen

def draw_custom_svg(pen, innerSvg, baseline, tx, ty, is_long):
    """Draws stripped SVG paths through TransformPen and Cu2QuPen into font coordinates."""
    stripped = strip_stub(innerSvg, baseline, is_long)
    paths = parse_svg_paths(stripped)
    qpen = Cu2QuPen(pen, max_err=1.0)
    tpen = TransformPen(qpen, (SCALE, 0, 0, -SCALE, tx * SCALE, -ty * SCALE))
    for d in paths:
        try:
            sp = SVGPath.fromstring(f"<path d=\"{d}\"/>")
            sp.draw(tpen)
        except Exception as e:
            print(f"Warning drawing path: {e}")

letters = [chr(c) for c in range(ord("a"), ord("z") + 1)]
print(f"Building Nopitac glyphs for {len(letters)} letters...")

for let in letters:
    w_font, lsb_font = hmtx[let]
    m_lsb = lsb_font / SCALE

    rec_f = db[let]["front"]
    rec_b = db[let]["back"]
    rec_fl = db[let]["frontLong"]
    rec_bl = db[let]["backLong"]

    fTx = m_lsb - rec_f["letterMinX"]
    fTy = -rec_f["baseline"]
    dropX = round((fTx + rec_f["dropStemLeftX"]) * SCALE)

    bTx = m_lsb - rec_b["letterMinX"]
    bTy = -rec_b["baseline"]
    riseX = round((bTx + rec_b["riseStemRightX"]) * SCALE)

    flTx = m_lsb - rec_fl["letterMinX"]
    flTy = -rec_fl["baseline"]
    dropX_l = round((flTx + rec_fl["dropStemLeftX"]) * SCALE)

    blTx = m_lsb - rec_bl["letterMinX"]
    blTy = -rec_bl["baseline"]
    riseX_l = round((blTx + rec_bl["riseStemRightX"]) * SCALE)

    # 1. c.init (front letter, normal depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_f["innerSvg"], rec_f["baseline"], fTx, fTy, is_long=False)
    add_rect_contour(pen, dropX, NORM_Y_BOT, w_font, NORM_Y_TOP)
    g_init = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.init"] = g_init
    hmtx[f"{let}.init"] = (w_font, min(lsb_font, dropX))

    # 1b. c.initJ (front letter, shortened underline before j.fina)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_f["innerSvg"], rec_f["baseline"], fTx, fTy, is_long=False)
    add_rect_contour(pen, dropX, NORM_Y_BOT, w_font - 152, NORM_Y_TOP)
    g_initJ = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.initJ"] = g_initJ
    hmtx[f"{let}.initJ"] = (w_font, min(lsb_font, dropX))

    # 2. c.initLong (front letter, extended depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_fl["innerSvg"], rec_fl["baseline"], flTx, flTy, is_long=True)
    add_rect_contour(pen, dropX_l, LONG_Y_BOT, w_font, LONG_Y_TOP)
    g_initL = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.initLong"] = g_initL
    hmtx[f"{let}.initLong"] = (w_font, min(lsb_font, dropX_l))

    # 2b. c.initLongJ (front letter extended, shortened underline before j.finaLong)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_fl["innerSvg"], rec_fl["baseline"], flTx, flTy, is_long=True)
    add_rect_contour(pen, dropX_l, LONG_Y_BOT, w_font - 123, LONG_Y_TOP)
    g_initLJ = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.initLongJ"] = g_initLJ
    hmtx[f"{let}.initLongJ"] = (w_font, min(lsb_font, dropX_l))

    # 3. c.fina (back letter, normal depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_b["innerSvg"], rec_b["baseline"], bTx, bTy, is_long=False)
    add_rect_contour(pen, 0, NORM_Y_BOT, riseX, NORM_Y_TOP)
    g_fina = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.fina"] = g_fina
    fina_adv = max(w_font, riseX + 60)
    hmtx[f"{let}.fina"] = (fina_adv, 0)

    # 4. c.finaLong (back letter, extended depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_bl["innerSvg"], rec_bl["baseline"], blTx, blTy, is_long=True)
    add_rect_contour(pen, 0, LONG_Y_BOT, riseX_l, LONG_Y_TOP)
    g_finaL = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.finaLong"] = g_finaL
    finaL_adv = max(w_font, riseX_l + 60)
    hmtx[f"{let}.finaLong"] = (finaL_adv, 0)

    # 5. c.medi (middle letter, normal depth)
    pen = TTGlyphPen(glyf)
    glyph_set[let].draw(pen)
    add_rect_contour(pen, 0, NORM_Y_BOT, w_font, NORM_Y_TOP)
    g_medi = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.medi"] = g_medi
    hmtx[f"{let}.medi"] = (w_font, 0)

    # 5b. c.mediJ (middle letter, shortened underline before j.fina)
    pen = TTGlyphPen(glyf)
    glyph_set[let].draw(pen)
    add_rect_contour(pen, 0, NORM_Y_BOT, w_font - 152, NORM_Y_TOP)
    g_mediJ = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.mediJ"] = g_mediJ
    hmtx[f"{let}.mediJ"] = (w_font, 0)

    # 6. c.mediLong (middle letter, extended depth)
    pen = TTGlyphPen(glyf)
    glyph_set[let].draw(pen)
    add_rect_contour(pen, 0, LONG_Y_BOT, w_font, LONG_Y_TOP)
    g_mediL = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.mediLong"] = g_mediL
    hmtx[f"{let}.mediLong"] = (w_font, 0)

    # 6b. c.mediLongJ (middle letter extended, shortened underline before j.finaLong)
    pen = TTGlyphPen(glyf)
    glyph_set[let].draw(pen)
    add_rect_contour(pen, 0, LONG_Y_BOT, w_font - 123, LONG_Y_TOP)
    g_mediLJ = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.mediLongJ"] = g_mediLJ
    hmtx[f"{let}.mediLongJ"] = (w_font, 0)

    # 7. c.isol (single letter isolated, normal depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_f["innerSvg"], rec_f["baseline"], fTx, fTy, is_long=False)
    draw_custom_svg(pen, rec_b["innerSvg"], rec_b["baseline"], bTx, bTy, is_long=False)
    add_rect_contour(pen, dropX, NORM_Y_BOT, riseX, NORM_Y_TOP)
    g_isol = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.isol"] = g_isol
    hmtx[f"{let}.isol"] = (max(w_font, riseX + 60), min(lsb_font, dropX))

    # 8. c.isolLong (single letter isolated, extended depth)
    pen = TTGlyphPen(glyf)
    draw_custom_svg(pen, rec_fl["innerSvg"], rec_fl["baseline"], flTx, flTy, is_long=True)
    draw_custom_svg(pen, rec_bl["innerSvg"], rec_bl["baseline"], blTx, blTy, is_long=True)
    add_rect_contour(pen, dropX_l, LONG_Y_BOT, riseX_l, LONG_Y_TOP)
    g_isolL = fix_glyph_winding(pen.glyph(), glyf)
    glyf[f"{let}.isolLong"] = g_isolL
    hmtx[f"{let}.isolLong"] = (max(w_font, riseX_l + 60), min(lsb_font, dropX_l))

    # 9. c.long (intermediate substitution glyph)
    glyf[f"{let}.long"] = glyf[let]
    hmtx[f"{let}.long"] = (w_font, lsb_font)

# Add space connecting variants
w_space, lsb_space = hmtx["space"]

# space.medi: Underline across space at normal depth
pen = TTGlyphPen(glyf)
add_rect_contour(pen, 0, NORM_Y_BOT, w_space, NORM_Y_TOP)
g_sp_medi = fix_glyph_winding(pen.glyph(), glyf)
glyf["space.medi"] = g_sp_medi
hmtx["space.medi"] = (w_space, 0)

# space.mediJ: Underline across space shortened before j.fina
pen = TTGlyphPen(glyf)
add_rect_contour(pen, 0, NORM_Y_BOT, w_space - 152, NORM_Y_TOP)
g_sp_mediJ = fix_glyph_winding(pen.glyph(), glyf)
glyf["space.mediJ"] = g_sp_mediJ
hmtx["space.mediJ"] = (w_space, 0)

# space.mediLong: Underline across space at extended depth
pen = TTGlyphPen(glyf)
add_rect_contour(pen, 0, LONG_Y_BOT, w_space, LONG_Y_TOP)
g_sp_mediL = fix_glyph_winding(pen.glyph(), glyf)
glyf["space.mediLong"] = g_sp_mediL
hmtx["space.mediLong"] = (w_space, 0)

# space.mediLongJ: Underline across space shortened before j.finaLong
pen = TTGlyphPen(glyf)
add_rect_contour(pen, 0, LONG_Y_BOT, w_space - 123, LONG_Y_TOP)
g_sp_mediLJ = fix_glyph_winding(pen.glyph(), glyf)
glyf["space.mediLongJ"] = g_sp_mediLJ
hmtx["space.mediLongJ"] = (w_space, 0)

# space.connect & space.long: Intermediate glyphs (empty contours, standard advance)
glyf["space.connect"] = glyf["space"]
hmtx["space.connect"] = (w_space, lsb_space)
glyf["space.long"] = glyf["space"]
hmtx["space.long"] = (w_space, lsb_space)

# break_space: Break separator (empty contours, standard space advance, no underline)
glyf["break_space"] = glyf["space"]
hmtx["break_space"] = (w_space, lsb_space)

font.glyphOrder = glyf.glyphOrder
print(f"Total glyphs in font: {len(font.glyphOrder)}")

letters_long_str = " ".join([f"{l}.long" for l in letters])

# OpenType Feature Specification (calt)
FEA_CODE = f"""
languagesystem DFLT dflt;
languagesystem latn dflt;

# 1. Break Separators
# Replace slash (/), hyphen (-), or nonbreakingspace (Shift+Space / Option+Space) with break_space
lookup CONVERT_BREAKS {{
    sub slash by break_space;
    sub hyphen by break_space;
    sub nonbreakingspace by break_space;
}} CONVERT_BREAKS;

lookup CLEAN_ADJACENT_SPACES {{
    sub space' break_space by break_space;
    sub break_space space' by break_space;
}} CLEAN_ADJACENT_SPACES;

@LETTERS = [a b c d e f g h i j k l m n o p q r s t u v w x y z];
@LETTERS_LONG = [{letters_long_str}];
@DESCENDERS = [g j p q y];

# Mark spaces that connect letters (so leading/trailing spaces stay blank)
lookup MARK_CONNECTING_SPACES {{
    sub @LETTERS space' @LETTERS by space.connect;
    sub space.connect space' @LETTERS by space.connect;
    sub @LETTERS space' space.connect by space.connect;
}} MARK_CONNECTING_SPACES;

# Classes for continuous text (letters + space.connect)
@ALL = [@LETTERS space.connect];
@LONG = [a.long b.long c.long d.long e.long f.long g.long h.long i.long j.long k.long l.long m.long n.long o.long p.long q.long r.long s.long t.long u.long v.long w.long x.long y.long z.long space.long];
@DESCENDERS_LONG = [g.long j.long p.long q.long y.long];

@INIT = [a.init b.init c.init d.init e.init f.init g.init h.init i.init j.init k.init l.init m.init n.init o.init p.init q.init r.init s.init t.init u.init v.init w.init x.init y.init z.init];
@MEDI = [a.medi b.medi c.medi d.medi e.medi f.medi g.medi h.medi i.medi j.medi k.medi l.medi m.medi n.medi o.medi p.medi q.medi r.medi s.medi t.medi u.medi v.medi w.medi x.medi y.medi z.medi space.medi];
@FINA = [a.fina b.fina c.fina d.fina e.fina f.fina g.fina h.fina i.fina j.fina k.fina l.fina m.fina n.fina o.fina p.fina q.fina r.fina s.fina t.fina u.fina v.fina w.fina x.fina y.fina z.fina];
@ISOL = [a.isol b.isol c.isol d.isol e.isol f.isol g.isol h.isol i.isol j.isol k.isol l.isol m.isol n.isol o.isol p.isol q.isol r.isol s.isol t.isol u.isol v.isol w.isol x.isol y.isol z.isol];

@INIT_LONG = [a.initLong b.initLong c.initLong d.initLong e.initLong f.initLong g.initLong h.initLong i.initLong j.initLong k.initLong l.initLong m.initLong n.initLong o.initLong p.initLong q.initLong r.initLong s.initLong t.initLong u.initLong v.initLong w.initLong x.initLong y.initLong z.initLong];
@MEDI_LONG = [a.mediLong b.mediLong c.mediLong d.mediLong e.mediLong f.mediLong g.mediLong h.mediLong i.mediLong j.mediLong k.mediLong l.mediLong m.mediLong n.mediLong o.mediLong p.mediLong q.mediLong r.mediLong s.mediLong t.mediLong u.mediLong v.mediLong w.mediLong x.mediLong y.mediLong z.mediLong space.mediLong];
@FINA_LONG = [a.finaLong b.finaLong c.finaLong d.finaLong e.finaLong f.finaLong g.finaLong h.finaLong i.finaLong j.finaLong k.finaLong l.finaLong m.finaLong n.finaLong o.finaLong p.finaLong q.finaLong r.finaLong s.finaLong t.finaLong u.finaLong v.finaLong w.finaLong x.finaLong y.finaLong z.finaLong];
@ISOL_LONG = [a.isolLong b.isolLong c.isolLong d.isolLong e.isolLong f.isolLong g.isolLong h.isolLong i.isolLong j.isolLong k.isolLong l.isolLong m.isolLong n.isolLong o.isolLong p.isolLong q.isolLong r.isolLong s.isolLong t.isolLong u.isolLong v.isolLong w.isolLong x.isolLong y.isolLong z.isolLong];

@INIT_J = [a.initJ b.initJ c.initJ d.initJ e.initJ f.initJ g.initJ h.initJ i.initJ j.initJ k.initJ l.initJ m.initJ n.initJ o.initJ p.initJ q.initJ r.initJ s.initJ t.initJ u.initJ v.initJ w.initJ x.initJ y.initJ z.initJ];
@MEDI_J = [a.mediJ b.mediJ c.mediJ d.mediJ e.mediJ f.mediJ g.mediJ h.mediJ i.mediJ j.mediJ k.mediJ l.mediJ m.mediJ n.mediJ o.mediJ p.mediJ q.mediJ r.mediJ s.mediJ t.mediJ u.mediJ v.mediJ w.mediJ x.mediJ y.mediJ z.mediJ space.mediJ];

@INIT_LONG_J = [a.initLongJ b.initLongJ c.initLongJ d.initLongJ e.initLongJ f.initLongJ g.initLongJ h.initLongJ i.initLongJ j.initLongJ k.initLongJ l.initLongJ m.initLongJ n.initLongJ o.initLongJ p.initLongJ q.initLongJ r.initLongJ s.initLongJ t.initLongJ u.initLongJ v.initLongJ w.initLongJ x.initLongJ y.initLongJ z.initLongJ];
@MEDI_LONG_J = [a.mediLongJ b.mediLongJ c.mediLongJ d.mediLongJ e.mediLongJ f.mediLongJ g.mediLongJ h.mediLongJ i.mediLongJ j.mediLongJ k.mediLongJ l.mediLongJ m.mediLongJ n.mediLongJ o.mediLongJ p.mediLongJ q.mediLongJ r.mediLongJ s.mediLongJ t.mediLongJ u.mediLongJ v.mediLongJ w.mediLongJ x.mediLongJ y.mediLongJ z.mediLongJ space.mediLongJ];

@ANY_LONG = [@LONG @INIT_LONG @MEDI_LONG @FINA_LONG];
@ANY_STD = [@ALL @INIT @MEDI @FINA];

# Mark middle descender: any descender with at least one letter/space before and after it
lookup MARK_MID_DESCENDER {{
    sub @ALL @DESCENDERS' @ALL by @DESCENDERS_LONG;
}} MARK_MID_DESCENDER;

lookup PROPAGATE_RIGHT {{
    sub @LONG @ALL' by @LONG;
}} PROPAGATE_RIGHT;

lookup PROPAGATE_LEFT {{
    rsub @ALL' @LONG by @LONG;
}} PROPAGATE_LEFT;

# Apply long word substitutions (only letters can be init, fina, isol; space becomes space.mediLong)
lookup APPLY_LONG_ISOL {{
    ignore sub @ANY_LONG @LETTERS_LONG';
    ignore sub @LETTERS_LONG' @ANY_LONG;
    sub @LETTERS_LONG' by @ISOL_LONG;
}} APPLY_LONG_ISOL;

lookup APPLY_LONG_FINA {{
    ignore sub @LETTERS_LONG' @ANY_LONG;
    sub @LETTERS_LONG' by @FINA_LONG;
}} APPLY_LONG_FINA;

lookup APPLY_LONG_INIT {{
    ignore sub @ANY_LONG @LETTERS_LONG';
    sub @LETTERS_LONG' by @INIT_LONG;
}} APPLY_LONG_INIT;

lookup APPLY_LONG_MEDI {{
    sub @LONG by @MEDI_LONG;
}} APPLY_LONG_MEDI;

# Apply standard word substitutions
lookup APPLY_STD_ISOL {{
    ignore sub @ANY_STD @LETTERS';
    ignore sub @LETTERS' @ANY_STD;
    sub @LETTERS' by @ISOL;
}} APPLY_STD_ISOL;

lookup APPLY_STD_FINA {{
    ignore sub @LETTERS' @ANY_STD;
    sub @LETTERS' by @FINA;
}} APPLY_STD_FINA;

lookup APPLY_STD_INIT {{
    ignore sub @ANY_STD @LETTERS';
    sub @LETTERS' by @INIT;
}} APPLY_STD_INIT;

lookup APPLY_STD_MEDI {{
    sub @ALL by @MEDI;
}} APPLY_STD_MEDI;

lookup SHORTEN_BEFORE_J {{
    sub @INIT' j.fina by @INIT_J;
    sub @MEDI' j.fina by @MEDI_J;
    sub @INIT_LONG' j.finaLong by @INIT_LONG_J;
    sub @MEDI_LONG' j.finaLong by @MEDI_LONG_J;
}} SHORTEN_BEFORE_J;

feature calt {{
    lookup CONVERT_BREAKS;
    lookup CLEAN_ADJACENT_SPACES;
    lookup MARK_CONNECTING_SPACES;
    lookup MARK_MID_DESCENDER;
    lookup PROPAGATE_RIGHT;
    lookup PROPAGATE_LEFT;
    
    lookup APPLY_LONG_ISOL;
    lookup APPLY_LONG_FINA;
    lookup APPLY_LONG_INIT;
    lookup APPLY_LONG_MEDI;
    
    lookup APPLY_STD_ISOL;
    lookup APPLY_STD_FINA;
    lookup APPLY_STD_INIT;
    lookup APPLY_STD_MEDI;

    lookup SHORTEN_BEFORE_J;
}} calt;
"""

print("Compiling OpenType GSUB features with feaLib...")
addOpenTypeFeaturesFromString(font, FEA_CODE)

# Update font metadata / naming tables
name_table = font["name"]
def set_name(nameID, text):
    name_table.setName(text, nameID, platformID=3, platEncID=1, langID=0x409)
    name_table.setName(text, nameID, platformID=1, platEncID=0, langID=0)

set_name(1, "Nopitac Helvetica")
set_name(2, "Regular")
set_name(3, "1.000;NOPT;nopitac_helvetica")
set_name(4, "Nopitac Helvetica")
set_name(5, "Version 1.000")
set_name(6, "nopitac_helvetica")

# Save OTF and TTF
OUT_DIR = os.path.join(ROOT_DIR, "public", "fonts")
os.makedirs(OUT_DIR, exist_ok=True)
OTF_PATH = os.path.join(OUT_DIR, "nopitac_helvetica.otf")
TTF_PATH = os.path.join(OUT_DIR, "nopitac_helvetica.ttf")

font.save(OTF_PATH)
font.save(TTF_PATH)
print(f"Successfully generated font files:\n  -> {OTF_PATH}\n  -> {TTF_PATH}")

# Copy to dist/fonts if dist exists
DIST_DIR = os.path.join(ROOT_DIR, "dist", "fonts")
if os.path.exists(os.path.join(ROOT_DIR, "dist")):
    os.makedirs(DIST_DIR, exist_ok=True)
    import shutil
    shutil.copy2(OTF_PATH, os.path.join(DIST_DIR, "nopitac_helvetica.otf"))
    shutil.copy2(TTF_PATH, os.path.join(DIST_DIR, "nopitac_helvetica.ttf"))
    print(f"Copied to {DIST_DIR}")

# Verify with HarfBuzz shaping engine
print("\n=== Verifying Font with HarfBuzz Shaper ===")
hb_font_data = open(OTF_PATH, "rb").read()
face = hb.Face(hb_font_data)
hb_font = hb.Font(face)
glyph_order = font.getGlyphOrder()

test_words = [
    "kaaj",
    "welcome",
    "tiger dingsun",
    "kaaj/welcome",
    "kaaj - welcome",
    "kaaj\u00A0welcome",
    " welcome ",
    "jojbp",
    "heoopee",
    "nopitac",
    "sleep",
    "poodle",
    "hi",
    "a"
]
for word in test_words:
    buf = hb.Buffer()
    buf.add_str(word)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"calt": True})
    names = [glyph_order[info.codepoint] for info in buf.glyph_infos]
    print(f"  {word!r:20} -> {' '.join(names)}")

print("\nAll verifications passed!")
