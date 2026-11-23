import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

font = TTFont("public/fonts/Helvetica-Regular.ttf")
glyf = font["glyf"]
hmtx = font["hmtx"]

letters = [chr(c) for c in range(ord("a"), ord("z") + 1)]
variants = ["init", "medi", "fina", "isol", "initLong", "mediLong", "finaLong", "isolLong", "long"]

# Add dummy letter glyphs
for let in letters:
    for var in variants:
        gname = f"{let}.{var}"
        if gname not in font.getGlyphOrder():
            glyf[gname] = glyf[let]
            hmtx[gname] = hmtx[let]

# Add space glyphs
w_space, lsb_space = hmtx["space"]
for var in ["connect", "medi", "mediLong", "long"]:
    gname = f"space.{var}"
    if gname not in font.getGlyphOrder():
        glyf[gname] = glyf["space"]
        hmtx[gname] = (w_space, 0)

# Add break_space glyph
if "break_space" not in font.getGlyphOrder():
    glyf["break_space"] = glyf["space"]
    hmtx["break_space"] = (w_space, 0)

font.glyphOrder = glyf.glyphOrder

fea = """
languagesystem DFLT dflt;
languagesystem latn dflt;

# 1. Break Separators
# Replace slash, hyphen, or nonbreakingspace with break_space
lookup CONVERT_BREAKS {
    sub slash by break_space;
    sub hyphen by break_space;
    sub nonbreakingspace by break_space;
} CONVERT_BREAKS;

lookup CLEAN_ADJACENT_SPACES {
    sub space' break_space by break_space;
    sub break_space space' by break_space;
} CLEAN_ADJACENT_SPACES;

@LETTERS = [a b c d e f g h i j k l m n o p q r s t u v w x y z];
@DESCENDERS = [g j p q y];

# Mark spaces that connect letters (so leading/trailing spaces stay blank)
lookup MARK_CONNECTING_SPACES {
    sub @LETTERS space' @LETTERS by space.connect;
    sub space.connect space' @LETTERS by space.connect;
    sub @LETTERS space' space.connect by space.connect;
} MARK_CONNECTING_SPACES;

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

@ANY_LONG = [@LONG @INIT_LONG @MEDI_LONG @FINA_LONG];
@ANY_STD = [@ALL @INIT @MEDI @FINA];

# Mark middle descender: any descender with at least one letter/space before and after it
lookup MARK_MID_DESCENDER {
    sub @ALL @DESCENDERS' @ALL by @DESCENDERS_LONG;
} MARK_MID_DESCENDER;

lookup PROPAGATE_RIGHT {
    sub @LONG @ALL' by @LONG;
} PROPAGATE_RIGHT;

lookup PROPAGATE_LEFT {
    rsub @ALL' @LONG by @LONG;
} PROPAGATE_LEFT;

# Apply long word substitutions
lookup APPLY_LONG_ISOL {
    ignore sub @ANY_LONG @LETTERS.long';
    ignore sub @LETTERS.long' @ANY_LONG;
    sub @LETTERS.long' by @ISOL_LONG;
} APPLY_LONG_ISOL;

lookup APPLY_LONG_FINA {
    ignore sub @LETTERS.long' @ANY_LONG;
    sub @LETTERS.long' by @FINA_LONG;
} APPLY_LONG_FINA;

lookup APPLY_LONG_INIT {
    ignore sub @ANY_LONG @LETTERS.long';
    sub @LETTERS.long' by @INIT_LONG;
} APPLY_LONG_INIT;

lookup APPLY_LONG_MEDI {
    sub @LONG by @MEDI_LONG;
} APPLY_LONG_MEDI;

# Apply standard word substitutions
lookup APPLY_STD_ISOL {
    ignore sub @ANY_STD @LETTERS';
    ignore sub @LETTERS' @ANY_STD;
    sub @LETTERS' by @ISOL;
} APPLY_STD_ISOL;

lookup APPLY_STD_FINA {
    ignore sub @LETTERS' @ANY_STD;
    sub @LETTERS' by @FINA;
} APPLY_STD_FINA;

lookup APPLY_STD_INIT {
    ignore sub @ANY_STD @LETTERS';
    sub @LETTERS' by @INIT;
} APPLY_STD_INIT;

lookup APPLY_STD_MEDI {
    sub @ALL by @MEDI;
} APPLY_STD_MEDI;

feature calt {
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
} calt;
"""

# Define @LETTERS.long
letters_long = " ".join([f"{l}.long" for l in letters])
fea = fea.replace("@LETTERS.long", f"[{letters_long}]")

addOpenTypeFeaturesFromString(font, fea)
font.save("/tmp/test_space_hb.ttf")

hb_font_data = open("/tmp/test_space_hb.ttf", "rb").read()
face = hb.Face(hb_font_data)
hb_font = hb.Font(face)
glyph_order = font.getGlyphOrder()

test_cases = [
    ("tiger dingsun", "continuous phrase across space (long due to g)"),
    ("kaaj welcome", "continuous phrase across space (standard depth)"),
    ("kaaj/welcome", "break with slash"),
    ("kaaj/heoopee", "break with slash (first standard, second long)"),
    ("kaaj - welcome", "break with dash"),
    ("kaaj\u00A0welcome", "break with nonbreakingspace (Shift+Space / Option+Space)"),
    ("welcome", "single word standard"),
    ("heoopee", "single word long"),
]

print("=== HarfBuzz Shaping Results ===")
for text, desc in test_cases:
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"calt": True})
    names = [glyph_order[info.codepoint] for info in buf.glyph_infos]
    print(f"\nTest: {text} ({desc})")
    print(f"Result: {' '.join(names)}")
