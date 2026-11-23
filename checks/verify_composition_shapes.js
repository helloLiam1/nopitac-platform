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

console.log('--- 1. Testing Square Shape ---');
const sqRes = renderer.render(DEFAULT_DESIGNERS, { shape: 'square' });
assert(sqRes.svgString.includes('data-nopitac-composition="concentric-squares"'), 'Square has concentric-squares attribute');
assert(sqRes.svgString.includes('id="compRotationGroup"'), 'Square has compRotationGroup');
assert(sqRes.placedGlyphsCount > 0, `Square placed ${sqRes.placedGlyphsCount} glyphs`);
assert(sqRes.svgString.includes('<rect'), 'Square has background card rect');

console.log('\n--- 2. Testing Circle Shape ---');
const cirRes = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle' });
assert(cirRes.svgString.includes('data-nopitac-composition="circle-spiral"'), 'Circle has circle-spiral attribute');
assert(cirRes.svgString.includes('id="compRotationGroup"'), 'Circle has compRotationGroup');
assert(cirRes.placedGlyphsCount > 0, `Circle placed ${cirRes.placedGlyphsCount} glyphs`);
assert(cirRes.ringsCount >= 4, `Circle generated ${cirRes.ringsCount} concentric rings`);
assert(cirRes.svgString.includes('<path d="M'), 'Circle has arc underline paths');
assert(cirRes.svgString.includes('stroke-linecap="butt"'), 'Circle underline has flush butt linecap');

console.log('\n--- 3. Testing Animate 1 (Stream Flow) in Circle ---');
const cirAnim1 = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle', animOffset: 50 });
assert(cirAnim1.svgString !== cirRes.svgString, 'Anim offset changes circle SVG content');
assert(cirAnim1.placedGlyphsCount === cirRes.placedGlyphsCount, 'Glyph count is stable during flow');

console.log('\n--- 4. Testing Animate 2 (Center Rotation) in Circle ---');
const cirRot = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle', rotationAngle: 45 });
assert(cirRot.svgString.includes('transform="rotate(45.000, 0, 0)"'), 'Rotation applied to (0, 0)');

console.log('\n--- 5. Testing Underline Styles in Circle ---');
const ribbon = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle', bracketStyle: 'continuous-ribbon' });
assert(ribbon.svgString.includes('<circle'), 'Continuous ribbon has circle elements');

const clean = renderer.render(DEFAULT_DESIGNERS, { shape: 'circle', bracketStyle: 'clean-underlines' });
assert(clean.svgString.includes('<circle'), 'Clean underlines has circle elements');

console.log('\n--- 6. Testing Presets in Circle ---');
Object.entries(COMPOSITION_PRESETS).forEach(([key, preset]) => {
  const pRes = renderer.render(preset.names, { shape: 'circle' });
  assert(pRes.placedGlyphsCount > 0, `Preset ${key} (${preset.title}) rendered ${pRes.placedGlyphsCount} glyphs`);
});

console.log('\nALL ENGINE CHECKS PASSED SUCCESSFULLY!');

