import fs from 'fs';
import { CUSTOM_GLYPH_DB } from '../src/engine/customGlyphDb.js';
import { getCharMetrics, getHelveticaKerning, FONT_SIZE } from '../src/engine/helveticaGlyphs.js';
import { UNDERLINE_HEIGHT, stripUnderlineStub } from '../src/engine/nopitacRenderer.js';
import { DEFAULT_DESIGNERS } from '../src/engine/compositionSpiral.js';

function renderConcentricSquaresCleanHandoff(namesInput, options = {}) {
  const {
    size = 780,
    ringSpacing = 68,
    scale = 0.65,
    tracking = 0,
    bracketStyle = 'name-brackets',
    animOffset = 0,
    rotationAngle = 0
  } = options;

  let names = [];
  if (Array.isArray(namesInput)) {
    names = namesInput.map(n => String(n).trim().toLowerCase()).filter(Boolean);
  } else if (typeof namesInput === 'string') {
    names = namesInput.split(/[\n,\/]+/).map(n => n.trim().toLowerCase()).filter(Boolean);
  }
  if (names.length === 0) names = DEFAULT_DESIGNERS;

  const half = size / 2; // 390
  const squares = [];
  let curH = half;
  const minH = 85;

  while (curH >= minH) {
    const sideLength = 2 * curH;
    const sideBaseLength = sideLength / scale;
    const perimeterBaseLength = 4 * sideBaseLength;
    squares.push({
      squareIndex: squares.length,
      half: curH,
      sideLength,
      sideBaseLength,
      perimeterBaseLength
    });
    curH -= ringSpacing;
  }

  const spaceMetrics = getCharMetrics(' ', null);
  const spaceAdvance = spaceMetrics.advance + tracking;
  const minInterDesignerGap = spaceAdvance * 2.2;

  // Measure designer templates
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
      textWidth: curRelX
    };
  });

  // Allocate designers to concentric squares
  // Each square can hold up to its perimeter capacity
  const placedSquares = squares.map(sq => ({
    ...sq,
    designers: []
  }));

  let dIdx = 0;
  for (let sqIdx = 0; sqIdx < placedSquares.length && dIdx < designerList.length; sqIdx++) {
    const sq = placedSquares[sqIdx];
    let usedPerim = 0;

    while (dIdx < designerList.length) {
      const d = designerList[dIdx];
      const needed = usedPerim + (sq.designers.length > 0 ? minInterDesignerGap : 0) + d.textWidth;
      if (sq.designers.length > 0 && needed > sq.perimeterBaseLength) {
        break; // Square is full
      }
      sq.designers.push(d);
      usedPerim = needed;
      dIdx++;
    }
  }

  // Edge geometry definitions:
  // Edge 0 (Top): start (-H, -H), direction (+1, 0), angle 0
  // Edge 1 (Right): start (+H, -H), direction (0, +1), angle 90
  // Edge 2 (Bottom): start (+H, +H), direction (-1, 0), angle 180
  // Edge 3 (Left): start (-H, +H), direction (0, -1), angle 270
  function getEdgeDef(e, H) {
    if (e === 0) return { start: { x: -H, y: -H }, dir: { x: 1, y: 0 }, angle: 0 };
    if (e === 1) return { start: { x: H, y: -H }, dir: { x: 0, y: 1 }, angle: 90 };
    if (e === 2) return { start: { x: H, y: H }, dir: { x: -1, y: 0 }, angle: 180 };
    return { start: { x: -H, y: H }, dir: { x: 0, y: -1 }, angle: 270 };
  }

  const strokeWidth = UNDERLINE_HEIGHT * scale;
  const baselineOffsetLocal = -7.14685;
  const underlinePaths = [];
  const glyphMarkup = [];
  const tspans = [];
  let placedGlyphsCount = 0;

  placedSquares.forEach(sq => {
    const N = sq.designers.length;
    if (N === 0) return;

    const H = sq.half;
    const W = sq.sideBaseLength;
    const P = sq.perimeterBaseLength;

    // Closed square stroke for continuous-ribbon or clean-underlines
    if (bracketStyle === 'continuous-ribbon' || bracketStyle === 'clean-underlines') {
      underlinePaths.push(`
      <!-- Closed Square [${sq.squareIndex}] -->
      <rect 
        x="${(-H).toFixed(3)}" 
        y="${(-H).toFixed(3)}" 
        width="${(2 * H).toFixed(3)}" 
        height="${(2 * H).toFixed(3)}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linejoin="miter" 
        stroke-miterlimit="4" 
      />`);
    }

    // Calculate distributed perimeter positions for the N designers
    const totalTextWidth = sq.designers.reduce((sum, d) => sum + d.textWidth, 0);
    const gap = (P - totalTextWidth) / N;

    let curS = 0;
    const positioned = sq.designers.map((d, idx) => {
      const s_initial = curS;
      curS += d.textWidth + gap;
      return {
        ...d,
        s_initial,
        instanceId: `${sq.squareIndex}-${idx}`
      };
    });

    positioned.forEach(d => {
      // Continuous perimeter coordinate with animOffset
      const s = ((d.s_initial + animOffset) % P + P) % P;
      const w = d.textWidth;

      // Clean corner handoff:
      // A designer transitions from Edge e to Edge (e+1) at the exact moment its leading edge reaches the corner!
      // On Edge e, the corner is at (e + 1) * W.
      // So the transition threshold is s_shifted = (s + w) % P.
      const s_shifted = (s + w) % P;
      const e = Math.floor(s_shifted / W) % 4; // strictly 0, 1, 2, or 3
      const x_local = s_shifted - e * W;       // strictly in [0, W)

      const edgeDef = getEdgeDef(e, H);
      const angleDeg = edgeDef.angle;

      const first = d.glyphs[0];
      const last = d.glyphs[d.glyphs.length - 1];

      const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

      const fTx = first.metrics.lsb - fDb.letterMinX;
      const bTx = last.metrics.lsb - bDb.letterMinX;

      const dropX = x_local + fTx + fDb.dropStemLeftX;
      const riseX = x_local + last.relX + bTx + bDb.riseStemRightX;

      // In name-brackets mode: straight line underline along Edge e
      if (bracketStyle === 'name-brackets') {
        const p1 = {
          x: edgeDef.start.x + dropX * scale * edgeDef.dir.x,
          y: edgeDef.start.y + dropX * scale * edgeDef.dir.y
        };
        const p2 = {
          x: edgeDef.start.x + riseX * scale * edgeDef.dir.x,
          y: edgeDef.start.y + riseX * scale * edgeDef.dir.y
        };

        underlinePaths.push(`
      <!-- Name Underline: [${d.instanceId}] (${d.fullName}) Edge ${e} -->
      <line 
        x1="${p1.x.toFixed(3)}" 
        y1="${p1.y.toFixed(3)}" 
        x2="${p2.x.toFixed(3)}" 
        y2="${p2.y.toFixed(3)}" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linecap="butt" 
      />`);
      }

      // Render glyphs along Edge e
      d.glyphs.forEach(g => {
        placedGlyphsCount++;
        const ch = g.char;
        const gxLocal = x_local + g.relX;

        const gx = edgeDef.start.x + gxLocal * scale * edgeDef.dir.x;
        const gy = edgeDef.start.y + gxLocal * scale * edgeDef.dir.y;

        const isFirst = bracketStyle === 'name-brackets' && g.isFirstOfName;
        const isLast = bracketStyle === 'name-brackets' && g.isLastOfName;

        if (isFirst && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
          const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
          const tx = g.metrics.lsb - fDb.letterMinX;
          const ty = baselineOffsetLocal - fDb.baseline;
          const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
          glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
        } else if (isLast && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
          const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
          const tx = g.metrics.lsb - bDb.letterMinX;
          const ty = baselineOffsetLocal - bDb.baseline;
          const cleanSvg = stripUnderlineStub(bDb.innerSvg, bDb.baseline);
          glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
        } else {
          const originX = 0;
          const originY = baselineOffsetLocal;
          if (g.metrics.d) {
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg}) scale(${scale.toFixed(4)}) translate(${originX.toFixed(3)}, ${originY.toFixed(3)})">
          <path d="${g.metrics.d}" />
        </g>`);
          }
        }

        tspans.push(`<tspan>${ch}</tspan>`);
      });
    });
  });

  const cardHalf = half + 50; // 440
  const cardSize = cardHalf * 2; // 880
  const maxRotationRadius = Math.hypot(cardHalf, cardHalf);
  const outerPad = 16;
  const viewHalf = Math.ceil(maxRotationRadius + outerPad); // 639
  const minX = -viewHalf;
  const minY = -viewHalf;
  const vbWidth = viewHalf * 2;
  const vbHeight = viewHalf * 2;

  const svgString = `<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}" 
  width="${vbWidth.toFixed(0)}" 
  height="${vbHeight.toFixed(0)}" 
  data-nopitac-composition="concentric-squares"
>
  <defs>
    <filter id="compCardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000000" flood-opacity="0.04" />
    </filter>
  </defs>

  <!-- Master Center Rotation Group -->
  <g id="compRotationGroup" transform="rotate(${rotationAngle.toFixed(3)}, 0, 0)">
    <!-- Rotating Composition Card Background -->
    <rect 
      x="${(-cardHalf).toFixed(1)}" 
      y="${(-cardHalf).toFixed(1)}" 
      width="${cardSize.toFixed(1)}" 
      height="${cardSize.toFixed(1)}" 
      rx="6" 
      fill="#f5f3ec" 
      filter="url(#compCardShadow)" 
    />
    
    ${underlinePaths.join('\n')}

    <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
      ${glyphMarkup.join('\n')}
    </g>
  </g>

  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" style="opacity: 0; pointer-events: none;" xml:space="preserve">
    ${tspans.join('')}
  </text>
</svg>`;

  return {
    svgString,
    placedGlyphsCount
  };
}

// Generate test SVGs at offset 0, offset 100, offset 200, offset 400
[0, 100, 200, 400].forEach(offset => {
  const res = renderConcentricSquaresCleanHandoff(DEFAULT_DESIGNERS, { animOffset: offset });
  fs.writeFileSync('checks/test_clean_' + offset + '.svg', res.svgString);
});
console.log('Saved test_clean SVGs');
