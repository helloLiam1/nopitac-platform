import fs from 'fs';
import { CUSTOM_GLYPH_DB } from '../src/engine/customGlyphDb.js';
import { getCharMetrics, getHelveticaKerning, FONT_SIZE } from '../src/engine/helveticaGlyphs.js';
import { UNDERLINE_HEIGHT, stripUnderlineStub } from '../src/engine/nopitacRenderer.js';
import { DEFAULT_DESIGNERS } from '../src/engine/compositionSpiral.js';

function renderConcentricSquares(namesInput, options = {}) {
  const {
    size = 780,
    ringSpacing = 68,
    scale = 0.65,
    tracking = 0,
    bracketStyle = 'name-brackets', // 'name-brackets', 'continuous-ribbon', 'clean-underlines'
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
  const cornerPad = 16 / scale; // padding from corner vertices

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

  // Allocate designers to concentric squares:
  // Pack edge by edge. If a designer exceeds the corner of an edge, place it on the adjacent edge!
  const placedSquares = squares.map(sq => ({
    ...sq,
    edges: [[], [], [], []] // [Top, Right, Bottom, Left]
  }));

  let dIdx = 0;
  for (let sqIdx = 0; sqIdx < placedSquares.length && dIdx < designerList.length; sqIdx++) {
    const sq = placedSquares[sqIdx];
    const usableEdgeLength = sq.sideBaseLength - 2 * cornerPad;

    for (let eIdx = 0; eIdx < 4 && dIdx < designerList.length; eIdx++) {
      const edge = sq.edges[eIdx];

      while (dIdx < designerList.length) {
        const d = designerList[dIdx];
        const currentTotal = edge.reduce((sum, item) => sum + item.textWidth, 0);
        const needed = currentTotal + (edge.length > 0 ? edge.length * minInterDesignerGap : 0) + d.textWidth;

        // If designer exceeds the corner along this edge, place it on the adjacent edge!
        if (edge.length > 0 && needed > usableEdgeLength) {
          break; // move to adjacent edge
        }

        edge.push(d);
        dIdx++;
      }
    }
  }

  // Geometry construction
  const strokeWidth = UNDERLINE_HEIGHT * scale;
  const baselineOffsetLocal = -7.14685;
  const underlinePaths = [];
  const glyphMarkup = [];
  const tspans = [];
  let placedGlyphsCount = 0;

  placedSquares.forEach(sq => {
    const totalSquareDesigners = sq.edges.reduce((sum, e) => sum + e.length, 0);
    if (totalSquareDesigners === 0 && bracketStyle === 'name-brackets') return;

    const H = sq.half;
    const sideBase = sq.sideBaseLength;

    // Continuous square outline if requested
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

    // Edge definitions:
    // Edge 0 (Top): start (-H, -H), end (+H, -H), angle 0
    // Edge 1 (Right): start (+H, -H), end (+H, +H), angle 90
    // Edge 2 (Bottom): start (+H, +H), end (-H, +H), angle 180
    // Edge 3 (Left): start (-H, +H), end (-H, -H), angle 270
    const edgeDefs = [
      { side: 'top', start: { x: -H, y: -H }, angle: 0, dir: { x: 1, y: 0 } },
      { side: 'right', start: { x: H, y: -H }, angle: 90, dir: { x: 0, y: 1 } },
      { side: 'bottom', start: { x: H, y: H }, angle: 180, dir: { x: -1, y: 0 } },
      { side: 'left', start: { x: -H, y: H }, angle: 270, dir: { x: 0, y: -1 } }
    ];

    // Position each designer on its edge with balanced spacing
    sq.edges.forEach((edgeDesigners, eIdx) => {
      const count = edgeDesigners.length;
      if (count === 0) return;

      const edgeDef = edgeDefs[eIdx];
      const totalTextWidth = edgeDesigners.reduce((sum, d) => sum + d.textWidth, 0);
      const usableLength = sideBase - 2 * cornerPad;

      let gap = minInterDesignerGap;
      let startX = cornerPad;

      if (count >= 2) {
        gap = (usableLength - totalTextWidth) / (count - 1);
      } else if (count === 1) {
        startX = (sideBase - totalTextWidth) / 2;
      }

      let curX = startX;

      edgeDesigners.forEach((d, idx) => {
        const dStartX = curX;
        curX += d.textWidth + gap;

        const first = d.glyphs[0];
        const last = d.glyphs[d.glyphs.length - 1];

        const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
        const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

        const fTx = first.metrics.lsb - fDb.letterMinX;
        const bTx = last.metrics.lsb - bDb.letterMinX;

        const dropX = dStartX + fTx + fDb.dropStemLeftX;
        const riseX = dStartX + last.relX + bTx + bDb.riseStemRightX;

        // Render name underline (straight along the edge)
        if (bracketStyle === 'name-brackets') {
          // World coordinates on the edge:
          const rad = (edgeDef.angle * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const p1 = {
            x: edgeDef.start.x + dropX * scale * cos,
            y: edgeDef.start.y + dropX * scale * sin
          };
          const p2 = {
            x: edgeDef.start.x + riseX * scale * cos,
            y: edgeDef.start.y + riseX * scale * sin
          };

          underlinePaths.push(`
      <!-- Name Underline: [${sq.squareIndex}:${eIdx}:${idx}] (${d.fullName}) -->
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

        // Render glyphs along the edge
        d.glyphs.forEach(g => {
          placedGlyphsCount++;
          const ch = g.char;
          const gX = dStartX + g.relX;

          const rad = (edgeDef.angle * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const gx = edgeDef.start.x + gX * scale * cos;
          const gy = edgeDef.start.y + gX * scale * sin;
          const angleDeg = edgeDef.angle;

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

const out = renderConcentricSquares(DEFAULT_DESIGNERS);
fs.writeFileSync('checks/test_concentric_squares.svg', out.svgString);
console.log('Saved test_concentric_squares.svg, glyphs:', out.placedGlyphsCount);
