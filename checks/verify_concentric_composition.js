import { CompositionSpiralRenderer, DEFAULT_DESIGNERS, COMPOSITION_PRESETS } from '../src/engine/compositionSpiral.js';

const renderer = new CompositionSpiralRenderer(null);

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  } else {
    console.log('PASS:', message);
  }
}

console.log('=== 1. Testing Concentric Squares Mode ===');
const sqRes = renderer.render(DEFAULT_DESIGNERS, { shape: 'square' });
assert(sqRes.svgString.includes('data-nopitac-composition="concentric-squares"'), 'Square has concentric-squares attribute');
assert(sqRes.svgString.includes('id="compRotationGroup"'), 'Square has compRotationGroup');
assert(sqRes.placedGlyphsCount > 0, `Square placed ${sqRes.placedGlyphsCount} glyphs`);
assert(sqRes.squaresCount >= 4, `Generated ${sqRes.squaresCount} concentric squares`);
assert(!sqRes.svgString.includes('multi-corner'), 'No multi-corner folding paths in concentric squares');

console.log('\n=== 2. Testing Animation on Concentric Squares ===');
const sqAnim1 = renderer.render(DEFAULT_DESIGNERS, { shape: 'square', animOffset: 120, cornerApproach: 1 });
assert(sqAnim1.svgString !== sqRes.svgString, 'Approach 1 anim offset changes SVG content');
assert(sqAnim1.placedGlyphsCount === sqRes.placedGlyphsCount, 'Approach 1 glyph count is stable during animation');

const sqAnim2 = renderer.render(DEFAULT_DESIGNERS, { shape: 'square', animOffset: 120, cornerApproach: 2 });
assert(sqAnim2.svgString !== sqRes.svgString, 'Approach 2 anim offset changes SVG content');
assert(sqAnim2.placedGlyphsCount === sqRes.placedGlyphsCount, 'Approach 2 glyph count is stable during animation');
assert(sqAnim2.svgString !== sqAnim1.svgString, 'Approach 1 and Approach 2 have distinct animations');

const sqRot = renderer.render(DEFAULT_DESIGNERS, { shape: 'square', rotationAngle: 45 });
assert(sqRot.svgString.includes('transform="rotate(45.000, 0, 0)"'), 'Center rotation rotates around (0, 0)');

console.log('\n=== 3. Testing Underline Styles on Concentric Squares ===');
const sqRibbon = renderer.render(DEFAULT_DESIGNERS, { shape: 'square', bracketStyle: 'continuous-ribbon' });
assert(sqRibbon.svgString.includes('stroke-linejoin="miter"'), 'Continuous ribbon has closed miter square frames');

const sqClean = renderer.render(DEFAULT_DESIGNERS, { shape: 'square', bracketStyle: 'clean-underlines' });
assert(sqClean.svgString.includes('stroke-linejoin="miter"'), 'Clean underlines has closed miter square frames');

console.log('\n=== 4. Testing Concentric Circles Mode ===');
const cirRes = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle' });
assert(cirRes.svgString.includes('data-nopitac-composition="circle-spiral"'), 'Circle has circle-spiral attribute');
assert(cirRes.placedGlyphsCount > 0, `Circle placed ${cirRes.placedGlyphsCount} glyphs`);

console.log('\n=== 5. Testing Presets on Concentric Squares ===');
Object.entries(COMPOSITION_PRESETS).forEach(([key, preset]) => {
  const pSq = renderer.render(preset.names, { shape: 'square' });
  assert(pSq.placedGlyphsCount > 0, `Preset ${key} on squares rendered ${pSq.placedGlyphsCount} glyphs`);
  const pCir = renderer.render(preset.names, { shape: 'circle' });
  assert(pCir.placedGlyphsCount > 0, `Preset ${key} on circles rendered ${pCir.placedGlyphsCount} glyphs`);
});

console.log('\nALL CONCENTRIC COMPOSITION CHECKS PASSED SUCCESSFULLY!');

