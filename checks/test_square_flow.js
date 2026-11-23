import fs from 'fs';
import { CUSTOM_GLYPH_DB } from '../src/engine/customGlyphDb.js';
import { getCharMetrics, getHelveticaKerning, FONT_SIZE } from '../src/engine/helveticaGlyphs.js';
import { UNDERLINE_HEIGHT, stripUnderlineStub } from '../src/engine/nopitacRenderer.js';
import { DEFAULT_DESIGNERS } from '../src/engine/compositionSpiral.js';

function getSquareTrackState(s, H, L, cornerRadius = 32) {
  const P = 4 * L;
  s = ((s % P) + P) % P;

  const corners = [
    { s: L, x: H, y: -H, inAngle: 0, outAngle: 90 },
    { s: 2 * L, x: H, y: H, inAngle: 90, outAngle: 180 },
    { s: 3 * L, x: -H, y: H, inAngle: 180, outAngle: 270 },
    { s: 4 * L, x: -H, y: -H, inAngle: 270, outAngle: 360 }
  ];

  for (const c of corners) {
    const d = s - c.s;
    if (Math.abs(d) <= cornerRadius) {
      const u = (d + cornerRadius) / (2 * cornerRadius);
      const t = u * u * (3 - 2 * u); // smoothstep
      const angle = c.inAngle + t * (c.outAngle - c.inAngle);
      return { x: c.x, y: c.y, angle: angle % 360 };
    }
  }

  // Pure edge
  if (s < L) {
    return { x: -H + s, y: -H, angle: 0 };
  } else if (s < 2 * L) {
    return { x: H, y: -H + (s - L), angle: 90 };
  } else if (s < 3 * L) {
    return { x: H - (s - 2 * L), y: H, angle: 180 };
  } else {
    return { x: -H, y: H - (s - 3 * L), angle: 270 };
  }
}

function renderConcentricSquares(namesInput, options = {}) {
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
  const cornerPad = 18 / scale;

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

  // Allocate designers edge by edge. If a designer exceeds the corner of an edge, place it on adjacent edge!
  const placedSquares = squares.map(sq => ({
    ...sq,
    designers: [],
    edges: [[], [], [], []]
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

        // If designer exceeds corner along this edge, place it in the adjacent edge!
        if (edge.length > 0 && needed > usableEdgeLength) {
          break;
        }

        edge.push(d);
        sq.designers.push({ ...d, edgeIndex: eIdx });
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
    if (sq.designers.length === 0 && bracketStyle === 'name-brackets') return;

    const H = sq.half;
    const sideBase = sq.sideBaseLength;
    const perimBase = sq.perimeterBaseLength;

    // Closed square stroke
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

    // Position each designer on their edge
    // In static layout: balanced spacing along each edge
    // In animation: perimeter position advances by animOffset along the square
    const totalDesigners = sq.designers.length;
    if (totalDesigners === 0) return;

    // Calculate static start position for each designer
    const positionedDesigners = [];
    let curPerimOffset = 0;

    for (let eIdx = 0; eIdx < 4; eIdx++) {
      const edgeList = sq.edges[eIdx];
      const edgeBaseStart = eIdx * sideBase;
      const count = edgeList.length;
      if (count === 0) continue;

      const totalTextWidth = edgeList.reduce((sum, d) => sum + d.textWidth, 0);
      const usableLength = sideBase - 2 * cornerPad;

      let gap = minInterDesignerGap;
      let startX = cornerPad;

      if (count >= 2) {
        gap = (usableLength - totalTextWidth) / (count - 1);
      } else if (count === 1) {
        startX = (sideBase - totalTextWidth) / 2;
      }

      let curX = startX;
      edgeList.forEach((d, idx) => {
        const staticPerimS = edgeBaseStart + curX;
        curX += d.textWidth + gap;

        positionedDesigners.push({
          ...d,
          edgeIndex: eIdx,
          instanceId: `${sq.squareIndex}-${eIdx}-${idx}`,
          staticPerimS
        });
      });
    }

    positionedDesigners.forEach(d => {
      // Advance by animOffset along perimeter
      const currentPerimS = ((d.staticPerimS + animOffset) % perimBase + perimBase) % perimBase;
      const centerS = currentPerimS + d.textWidth / 2;

      // Track state at center of designer
      const state = getSquareTrackState(centerS * scale, H, sq.sideLength, 24);
      const rad = (state.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const first = d.glyphs[0];
      const last = d.glyphs[d.glyphs.length - 1];

      const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

      const fTx = first.metrics.lsb - fDb.letterMinX;
      const bTx = last.metrics.lsb - bDb.letterMinX;

      const dropX = fTx + fDb.dropStemLeftX - d.textWidth / 2;
      const riseX = last.relX + bTx + bDb.riseStemRightX - d.textWidth / 2;

      // In name-brackets mode: draw straight underline between drop and rise stems
      if (bracketStyle === 'name-brackets') {
        const p1 = {
          x: state.x + dropX * scale * cos,
          y: state.y + dropX * scale * sin
        };
        const p2 = {
          x: state.x + riseX * scale * cos,
          y: state.y + riseX * scale * sin
        };

        underlinePaths.push(`
    <!-- Name Underline: [${d.instanceId}] (${d.fullName}) -->
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

      // Render glyphs
      d.glyphs.forEach(g => {
        placedGlyphsCount++;
        const ch = g.char;
        const relFromCenter = g.relX - d.textWidth / 2;

        const gx = state.x + relFromCenter * scale * cos;
        const gy = state.y + relFromCenter * scale * sin;
        const angleDeg = state.angle;

        const isFirst = bracketStyle === 'name-brackets' && g.isFirstOfName;
        const isLast = bracketStyle === 'name-brackets' && g.isLastOfName;

        if (isFirst && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
          const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
          const tx = g.metrics.lsb - fDb.letterMinX;
          const ty = baselineOffsetLocal - fDb.baseline;
          const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
          glyphMarkup.push(`
      <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
        ${cleanSvg}
      </g>`);
        } else if (isLast && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
          const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
          const tx = g.metrics.lsb - bDb.letterMinX;
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

// Test static view
const staticRes = renderConcentricSquares(DEFAULT_DESIGNERS);
fs.writeFileSync('checks/test_square_static.svg', staticRes.svgString);

// Test animated frame (offset = 120)
const animRes = renderConcentricSquares(DEFAULT_DESIGNERS, { animOffset: 120 });
fs.writeFileSync('checks/test_square_anim.svg', animRes.svgString);

console.log('Saved static and anim test SVGs');

