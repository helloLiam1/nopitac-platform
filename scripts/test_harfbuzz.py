import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

font = TTFont("public/fonts/Helvetica-Regular.ttf")
glyf = font["glyf"]
hmtx = font["hmtx"]

letters = [chr(c) for c in range(ord("a"), ord("z") + 1)]
variants = ["init", "medi", "fina", "isol", "initLong", "mediLong", "finaLong", "isolLong", "long"]

# Add dummy glyphs
for let in letters:
    for var in variants:
        gname = f"{let}.{var}"
        if gname not in font.getGlyphOrder():
            glyf[gname] = glyf[let]
            hmtx[gname] = hmtx[let]

font.glyphOrder = glyf.glyphOrder

fea = """
languagesystem DFLT dflt;
languagesystem latn dflt;

@ALL = [a b c d e f g h i j k l m n o p q r s t u v w x y z];
@DESCENDERS = [g j p q y];

@LONG = [a.long b.long c.long d.long e.long f.long g.long h.long i.long j.long k.long l.long m.long n.long o.long p.long q.long r.long s.long t.long u.long v.long w.long x.long y.long z.long];
@DESCENDERS_LONG = [g.long j.long p.long q.long y.long];

@INIT = [a.init b.init c.init d.init e.init f.init g.init h.init i.init j.init k.init l.init m.init n.init o.init p.init q.init r.init s.init t.init u.init v.init w.init x.init y.init z.init];
@MEDI = [a.medi b.medi c.medi d.medi e.medi f.medi g.medi h.medi i.medi j.medi k.medi l.medi m.medi n.medi o.medi p.medi q.medi r.medi s.medi t.medi u.medi v.medi w.medi x.medi y.medi z.medi];
@FINA = [a.fina b.fina c.fina d.fina e.fina f.fina g.fina h.fina i.fina j.fina k.fina l.fina m.fina n.fina o.fina p.fina q.fina r.fina s.fina t.fina u.fina v.fina w.fina x.fina y.fina z.fina];
@ISOL = [a.isol b.isol c.isol d.isol e.isol f.isol g.isol h.isol i.isol j.isol k.isol l.isol m.isol n.isol o.isol p.isol q.isol r.isol s.isol t.isol u.isol v.isol w.isol x.isol y.isol z.isol];

@INIT_LONG = [a.initLong b.initLong c.initLong d.initLong e.initLong f.initLong g.initLong h.initLong i.initLong j.initLong k.initLong l.initLong m.initLong n.initLong o.initLong p.initLong q.initLong r.initLong s.initLong t.initLong u.initLong v.initLong w.initLong x.initLong y.initLong z.initLong];
@MEDI_LONG = [a.mediLong b.mediLong c.mediLong d.mediLong e.mediLong f.mediLong g.mediLong h.mediLong i.mediLong j.mediLong k.mediLong l.mediLong m.mediLong n.mediLong o.mediLong p.mediLong q.mediLong r.mediLong s.mediLong t.mediLong u.mediLong v.mediLong w.mediLong x.mediLong y.mediLong z.mediLong];
@FINA_LONG = [a.finaLong b.finaLong c.finaLong d.finaLong e.finaLong f.finaLong g.finaLong h.finaLong i.finaLong j.finaLong k.finaLong l.finaLong m.finaLong n.finaLong o.finaLong p.finaLong q.finaLong r.finaLong s.finaLong t.finaLong u.finaLong v.finaLong w.finaLong x.finaLong y.finaLong z.finaLong];
@ISOL_LONG = [a.isolLong b.isolLong c.isolLong d.isolLong e.isolLong f.isolLong g.isolLong h.isolLong i.isolLong j.isolLong k.isolLong l.isolLong m.isolLong n.isolLong o.isolLong p.isolLong q.isolLong r.isolLong s.isolLong t.isolLong u.isolLong v.isolLong w.isolLong x.isolLong y.isolLong z.isolLong];

lookup MARK_MID_DESCENDER {
    sub @ALL @DESCENDERS' @ALL by @DESCENDERS_LONG;
} MARK_MID_DESCENDER;

lookup PROPAGATE_RIGHT {
    sub @LONG @ALL' by @LONG;
} PROPAGATE_RIGHT;

lookup PROPAGATE_LEFT {
    rsub @ALL' @LONG by @LONG;
} PROPAGATE_LEFT;

@ANY_LONG = [@LONG @INIT_LONG @MEDI_LONG @FINA_LONG];
@ANY_STD = [@ALL @INIT @MEDI @FINA];

lookup APPLY_LONG_ISOL {
    ignore sub @ANY_LONG @LONG';
    ignore sub @LONG' @ANY_LONG;
    sub @LONG' by @ISOL_LONG;
} APPLY_LONG_ISOL;

lookup APPLY_LONG_FINA {
    ignore sub @LONG' @ANY_LONG;
    sub @LONG' by @FINA_LONG;
} APPLY_LONG_FINA;

lookup APPLY_LONG_INIT {
    ignore sub @ANY_LONG @LONG';
    sub @LONG' by @INIT_LONG;
} APPLY_LONG_INIT;

lookup APPLY_LONG_MEDI {
    sub @LONG by @MEDI_LONG;
} APPLY_LONG_MEDI;

lookup APPLY_STD_ISOL {
    ignore sub @ANY_STD @ALL';
    ignore sub @ALL' @ANY_STD;
    sub @ALL' by @ISOL;
} APPLY_STD_ISOL;

lookup APPLY_STD_FINA {
    ignore sub @ALL' @ANY_STD;
    sub @ALL' by @FINA;
} APPLY_STD_FINA;

lookup APPLY_STD_INIT {
    ignore sub @ANY_STD @ALL';
    sub @ALL' by @INIT;
} APPLY_STD_INIT;

lookup APPLY_STD_MEDI {
    sub @ALL by @MEDI;
} APPLY_STD_MEDI;

feature calt {
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

addOpenTypeFeaturesFromString(font, fea)
font.save("/tmp/test_hb.ttf")

hb_font_data = open("/tmp/test_hb.ttf", "rb").read()
face = hb.Face(hb_font_data)
hb_font = hb.Font(face)

glyph_order = font.getGlyphOrder()
test_words = ["kaaj", "jojbp", "heoopee", "nopitac", "sleep", "poodle", "hi", "a", "kaaj heoopee"]
for word in test_words:
    buf = hb.Buffer()
    buf.add_str(word)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"calt": True})
    glyph_names = [glyph_order[info.codepoint] for info in buf.glyph_infos]
    print(f"{word:15} -> {' '.join(glyph_names)}")
