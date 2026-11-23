/**
 * NOPITAC OpenType Typeface Feature Generator & Documentation
 * Generates AFDKO OpenType Feature (.fea) code for contextual alternates (calt)
 */

export class OpenTypeSpecGenerator {
  /**
   * Generates OpenType .fea code for typeface designers using Glyphs, Robofont, or FontLab
   */
  static generateFeatureCode() {
    return `# NOPITAC Typeface Specification
# Feature: Contextual Alternates (calt) & Ligatures (liga)
# Architecture: First-to-Last Signature Underline Bracket

languagesystem DFLT dflt;
languagesystem latn dflt;

# 1. Glyph Classes
@LETTERS = [a b c d e f g h i j k l m n o p q r s t u v w x y z
            A B C D E F G H I J K L M N O P Q R S T U V W X Y Z];

@INIT_GLYPHS = [a.init b.init c.init d.init e.init f.init g.init h.init i.init j.init
                k.init l.init m.init n.init o.init p.init q.init r.init s.init t.init
                u.init v.init w.init x.init y.init z.init];

@FINA_GLYPHS = [a.fina b.fina c.fina d.fina e.fina f.fina g.fina h.fina i.fina j.fina
                k.fina l.fina m.fina n.fina o.fina p.fina q.fina r.fina s.fina t.fina
                u.fina v.fina w.fina x.fina y.fina z.fina];

# 2. Contextual Alternates (calt)
# Activates initial drop-stem on first letter and final rise-stem on last letter
feature calt {
  # Beginning of word: substitute initial letter with .init variant
  ignore sub @LETTERS @LETTERS';
  sub @LETTERS' by @INIT_GLYPHS;

  # End of word: substitute final letter with .fina variant
  ignore sub @LETTERS' @LETTERS;
  sub @LETTERS' by @FINA_GLYPHS;
} calt;

# 3. Web & App Implementation Note:
# In web applications, the SVG/Canvas dynamic engine (Nopitac Type Engine)
# delivers real-time pixel-perfect continuous underline joining across arbitrary
# character lengths, variable tracking, and descender clearance.
`;
  }

  static downloadFeatureFile() {
    const code = this.generateFeatureCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nopitac-features.fea';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
