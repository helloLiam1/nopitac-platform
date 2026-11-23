import fs from 'fs';
import { CUSTOM_GLYPH_DB } from '../src/engine/customGlyphDb.js';
import { getCharMetrics, getHelveticaKerning } from '../src/engine/helveticaGlyphs.js';
import { UNDERLINE_HEIGHT, stripUnderlineStub } from '../src/engine/nopitacRenderer.js';
import { DEFAULT_DESIGNERS } from '../src/engine/compositionSpiral.js';

function renderCircleCompositionWholeNames(namesInput, options = {}) {
  const {
    size = 780,
    ringSpacing = 68,
    scale = 0.65,
    tracking = 0,
    animOffset = 0,
    rotationAngle = 0
  } = options;

  let names = Array.isArray(namesInput) ? namesInput : DEFAULT_DESIGNERS;

  const half = size / 2; // 390
  const rings = [];
  let curR = half;
  const minR = 85;

  while (curR >= minR) {
    const circumference = 2 * Math.PI * curR;
    rings.push({
      ringIndex: rings.length,
      radius: curR,
      circumference,
      baseLength: circumference / scale
    });
    curR -= ringSpacing;
  }

  const spaceMetrics = getCharMetrics(' ', null);
  const spaceAdvance = spaceMetrics.advance + tracking;
  const interDesignerGap = spaceAdvance * 2.2;

  // Measure each designer
  const designerList = names.map((name, nameIdx) => {
    const words = name.split(/\s+/).filter(Boolean);
    const glyphs = [];
    let curRelX = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const wordStr = words[wIdx];
      const isFirstWord = wIdx === 0;
      const isLastWord = wIdx === words.length - 1;

      for (let cIdx = 0; cIdx < wordStr.length; cIdx++) {
        const ch = wordStr[cIdx];
        const nextCh = wordStr[cIdx + 1] || (wIdx < words.length - 1 ? words[wIdx + 1][0] : null);
        const m = getCharMetrics(ch, null);
        const kern = nextCh ? getHelveticaKerning(ch, nextCh, null) : 0;
        const step = m.advance + kern + tracking;

        glyphs.push({
          char: ch,
          nameIndex: nameIdx,
          isFirstOfName: isFirstWord && cIdx === 0,
          isLastOfName: isLastWord && cIdx === wordStr.length - 1,
          relX: curRelX,
          metrics: m,
          step
        });

        curRelX += step;
      }

      if (!isLastWord) {
        curRelX += spaceAdvance;
      }
    }

    return {
      nameIndex: nameIdx,
      fullName: name,
      glyphs,
      textWidth: curRelX,
      totalSpan: curRelX + interDesignerGap
    };
  });

  const placedRings = rings.map(r => ({ ...r, designers: [] }));
  let curRingIdx = 0;
  let curRingX = 0;

  for (let dIdx = 0; dIdx < designerList.length; dIdx++) {
    if (curRingIdx >= rings.length) break;

    const d = designerList[dIdx];
    const ring = rings[curRingIdx];

    // If designer doesn't fit on current ring, advance to next ring
    if (curRingX + d.textWidth > ring.baseLength && placedRings[curRingIdx].designers.length > 0) {
      curRingIdx++;
      if (curRingIdx >= rings.length) break;
      curRingX = 0;
    }

    placedRings[curRingIdx].designers.push({
      ...d,
      startX: curRingX,
      instanceId: dIdx
    });

    curRingX += d.totalSpan;
  }

  // Artwork construction
  const strokeWidth = UNDERLINE_HEIGHT * scale;
  const baselineOffsetLocal = -7.14685;
  const theta0 = -Math.PI / 2; // 12 o'clock

  const underlinePaths = [];
  const glyphMarkup = [];

  placedRings.forEach(ring => {
    ring.designers.forEach(d => {
      const first = d.glyphs[0];
      const last = d.glyphs[d.glyphs.length - 1];

      const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

      const fTx = first.metrics.lsb - fDb.letterMinX;
      const bTx = last.metrics.lsb - bDb.letterMinX;

      const dropX = d.startX + fTx + fDb.dropStemLeftX;
      const riseX = d.startX + last.relX + bTx + bDb.riseStemRightX;

      // Circular arc underline
      const t1 = theta0 + (dropX * scale) / ring.radius;
      const t2 = theta0 + (riseX * scale) / ring.radius;

      const x1 = ring.radius * Math.cos(t1);
      const y1 = ring.radius * Math.sin(t1);
      const x2 = ring.radius * Math.cos(t2);
      const y2 = ring.radius * Math.sin(t2);

      const sweep = t2 - t1;
      const largeArc = sweep > Math.PI ? 1 : 0;

      const arcPath = `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${ring.radius.toFixed(3)} ${ring.radius.toFixed(3)} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;

      underlinePaths.push(`
      <path 
        d="${arcPath}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linecap="butt" 
      />`);

      // Draw each glyph of the designer along the circular baseline
      d.glyphs.forEach(g => {
        const ch = g.char;
        const gX = d.startX + g.relX;
        const theta = theta0 + (gX * scale) / ring.radius;
        const gx = ring.radius * Math.cos(theta);
        const gy = ring.radius * Math.sin(theta);
        const angleDeg = (theta * 180 / Math.PI) + 90;

        if (g.isFirstOfName && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
          const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
          const tx = (g.metrics.lsb - fDb.letterMinX);
          const ty = baselineOffsetLocal - fDb.baseline;
          const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
          glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
        } else if (g.isLastOfName && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
          const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
          const tx = (g.metrics.lsb - bDb.letterMinX);
          const ty = baselineOffsetLocal - bDb.baseline;
          const cleanSvg = stripUnderlineStub(bDb.innerSvg, bDb.baseline);
          glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
        } else {
          const originX = 0;
          const originY = baselineOffsetLocal;
          if (g.metrics.d) {
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${originX.toFixed(3)}, ${originY.toFixed(3)})">
          <path d="${g.metrics.d}" />
        </g>`);
          }
        }
      });
    });
  });

  const cardRadius = half + 48; // 438
  const maxR = Math.hypot(cardRadius, cardRadius);
  const viewHalf = Math.ceil(maxR + 16);
  const minX = -viewHalf;
  const minY = -viewHalf;
  const vbDim = viewHalf * 2;

  const svgString = `<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="${minX} ${minY} ${vbDim} ${vbDim}" 
  width="${vbDim}" 
  height="${vbDim}" 
  data-nopitac-composition="circle-spiral"
>
  <defs>
    <filter id="compCardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000000" flood-opacity="0.04" />
    </filter>
  </defs>

  <!-- Master Center Rotation Group -->
  <g id="compRotationGroup" transform="rotate(${rotationAngle.toFixed(3)}, 0, 0)">
    <!-- Circular Background Card -->
    <circle cx="0" cy="0" r="${cardRadius}" fill="#f5f3ec" filter="url(#compCardShadow)" />

    ${underlinePaths.join('\n')}

    <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
      ${glyphMarkup.join('\n')}
    </g>
  </g>
</svg>`;

  return { svgString };
}

const out = renderCircleCompositionWholeNames(DEFAULT_DESIGNERS);
fs.writeFileSync('checks/test_circle_whole.svg', out.svgString);
console.log('Saved test_circle_whole.svg');
