/**
 * NOPITAC Type Renderer
 * Renders custom SVG front and back letters, middle letters from Helvetica,
 * and the continuous signature underline connecting them.
 * Spacing, advance widths, and kerning pairs are predefined from the Helvetica TTF font file.
 */

import { CUSTOM_GLYPH_DB } from './customGlyphDb.js';
import {
  FONT_SIZE,
  HELVETICA_GLYPHS,
  HELVETICA_KERN_TABLE,
  getHelveticaKerning,
  getCharMetrics
} from './helveticaGlyphs.js';

export { FONT_SIZE, HELVETICA_GLYPHS, HELVETICA_KERN_TABLE, getHelveticaKerning, getCharMetrics };

export const UNDERLINE_Y = 5.225; // baseline offset for underline top
export const UNDERLINE_HEIGHT = 3.8437; // constant thickness (width of lowercase l)
export const BREAK_REGEX = /[\/\-\u00A0]+/;

/**
 * Descender letters that drop below the baseline in the middle of a word
 */
export const DESCENDER_LETTERS = new Set(['p', 'q', 'y', 'g', 'j']);

/**
 * Returns true if any letter between the first and last letter has a descender (p, q, y, g, j).
 */
export function hasMiddleDescender(chars) {
  if (!chars || chars.length <= 2) return false;
  for (let i = 1; i < chars.length - 1; i++) {
    if (DESCENDER_LETTERS.has(chars[i].toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Strips the horizontal underline stub (located at targetRelY, default UNDERLINE_Y ≈ 5.225)
 * from custom glyph SVG markup so extended/frame underlines render cleanly without overlap.
 */
export function stripUnderlineStub(innerSvg, baseline, targetRelY = UNDERLINE_Y) {
  if (!innerSvg) return '';

  return innerSvg.replace(/<(rect|path|polygon)\s+([^>]+?)\/?>/gs, (fullTag, tagName, attrs) => {
    if (tagName === 'rect') {
      const y = parseFloat(attrs.match(/y=\"([^\"]+)\"/)?.[1] || 0);
      const w = parseFloat(attrs.match(/width=\"([^\"]+)\"/)?.[1] || 0);
      const h = parseFloat(attrs.match(/height=\"([^\"]+)\"/)?.[1] || 0);
      const trans = attrs.match(/transform=\"([^\"]+)\"/)?.[1] || '';
      const relY = y - baseline;

      if (!trans || trans.includes('rotate(180)')) {
        if (Math.abs(relY - targetRelY) < 0.4 && Math.abs(h - UNDERLINE_HEIGHT) < 0.2 && w > 5) {
          return ''; // Strip horizontal underline rect
        }
      } else if (trans.includes('rotate(90)')) {
        // Rotated 90 deg: w is vertical thickness (~3.84), h is horizontal span (> 10)
        if (Math.abs(w - UNDERLINE_HEIGHT) < 0.2 && h > 10) {
          return ''; // Strip rotated underline rect
        }
      }
    } else if (tagName === 'path') {
      const d = attrs.match(/d=\"([^\"]+)\"/)?.[1] || '';
      if ((d.includes('v3.8437') || d.includes('v-3.8437')) && d.length < 80) {
        const coords = d.match(/M([0-9\.]+),([0-9\.]+)/);
        if (coords) {
          const y = parseFloat(coords[2]);
          const relY = y - baseline;
          if (Math.abs(relY - targetRelY) < 0.4) {
            return ''; // Strip path underline rect
          }
        }
      }
    } else if (tagName === 'polygon') {
      const points = attrs.match(/points=\"([^\"]+)\"/)?.[1] || '';
      if (points.includes('39.3') && points.includes('43.1')) {
        return ''; // Strip polygon underline
      }
    }

    return fullTag;
  });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class NopitacRenderer {
  constructor(font = null) {
    this.font = font;
  }

  /**
   * Generates the SVG string and layout metadata for the given text and tracking.
   * Uses predefined Helvetica advance widths and kerning pairs.
   */
  render(text, tracking = 6) {
    text = (text || '').trim();
    if (!text) {
      return {
        svgString: '',
        viewBox: '0 0 0 0',
        vbWidth: 0,
        vbHeight: 0,
        totalWidth: 0,
        underlineStartX: 0,
        underlineEndX: 0,
        underlineWidth: 0
      };
    }

    if (BREAK_REGEX.test(text)) {
      const rawSegments = text.split(BREAK_REGEX);
      const segments = rawSegments.map(s => s.trim()).filter(s => s.length > 0);
      if (segments.length > 1) {
        return this._renderMultiSegments(segments, tracking, text);
      }
    }

    const chars = [...text];

    // Single letter
    if (chars.length === 1) {
      return this._renderSingle(chars[0]);
    }

    const firstChar = chars[0];
    const lastChar = chars[chars.length - 1];

    // Extended underline for middle descenders (p, q, y, g, j)
    const isExtended = hasMiddleDescender(chars);
    const shiftY = isExtended ? UNDERLINE_HEIGHT : 0;
    const curUnderlineY = UNDERLINE_Y + shiftY;

    let fDb = CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
    if (isExtended && CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.frontLong) {
      fDb = CUSTOM_GLYPH_DB[firstChar.toLowerCase()].frontLong;
    }
    let bDb = CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;
    if (isExtended && CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.backLong) {
      bDb = CUSTOM_GLYPH_DB[lastChar.toLowerCase()].backLong;
    }

    // 1. Calculate typographic positions using predefined Helvetica advanceWidth and kerning
    const positions = [0];
    let curX = 0;
    for (let i = 0; i < chars.length - 1; i++) {
      const mA = getCharMetrics(chars[i], this.font);
      const kern = getHelveticaKerning(chars[i], chars[i + 1], this.font);
      curX += mA.advance + kern + tracking;
      positions.push(curX);
    }

    // 2. Position front letter at origin X = 0, aligned to Helvetica native left side-bearing
    const mFirst = getCharMetrics(firstChar, this.font);
    const fTx = mFirst.lsb - fDb.letterMinX;
    const fTy = -fDb.baseline;
    const underlineStartX = fTx + fDb.dropStemLeftX;

    // 3. Middle letters from Helvetica
    const middleMarkup = [];
    for (let i = 1; i < chars.length - 1; i++) {
      const ch = chars[i];
      if (ch === ' ') continue; // Space is handled via typographic advance

      const originX = positions[i];
      const m = getCharMetrics(ch, this.font);
      if (m.d) {
        middleMarkup.push(`<path d="${m.d}" transform="translate(${originX.toFixed(3)}, 0)" />`);
      } else if (this.font) {
        const glyph = this.font.charToGlyph(ch);
        const path = glyph.getPath(originX, 0, FONT_SIZE);
        const d = path.toPathData(2);
        if (d) {
          middleMarkup.push(`<path d="${d}" />`);
        }
      }
    }

    // 4. Position back letter at its typographic origin, aligned to Helvetica native left side-bearing
    const lastOriginX = positions[positions.length - 1];
    const mLast = getCharMetrics(lastChar, this.font);
    const bTx = lastOriginX + mLast.lsb - bDb.letterMinX;
    const bTy = -bDb.baseline;
    const underlineEndX = bTx + bDb.riseStemRightX;
    const lastLetterRight = lastOriginX + mLast.lsb + bDb.letterWidth;

    // 5. Continuous Underline connecting front drop-stem to back rise-stem
    const underlineLeft = Math.min(underlineStartX, underlineEndX);
    const underlineRight = Math.max(underlineStartX, underlineEndX);
    const underlineWidth = Math.max(0, underlineRight - underlineLeft);

    // 6. Selectable text layer (tspans placed at exact typographic character coordinates)
    const tspans = chars.map((ch, idx) => {
      const x = positions[idx].toFixed(3);
      const safeCh = ch === ' ' ? ' ' : escapeXml(ch);
      return `<tspan x="${x}">${safeCh}</tspan>`;
    }).join('');

    // 7. Bounding dimensions for SVG viewBox (safely encloses all glyphs even at negative kerning)
    const allX = [
      0,
      underlineStartX,
      underlineEndX,
      fTx + fDb.letterMinX,
      fTx + fDb.letterMaxX,
      lastOriginX + mLast.lsb,
      lastLetterRight,
      lastOriginX + mLast.advance,
      ...positions
    ];
    // Vertical extensions when underline is shifted down for middle descenders
    const hasCustomFrontLong = isExtended && !!CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.frontLong;
    const frontExtension = (isExtended && !hasCustomFrontLong)
      ? `\n    <!-- Front drop-stem extension to lower underline -->\n    <rect x="${underlineStartX.toFixed(3)}" y="${UNDERLINE_Y}" width="${UNDERLINE_HEIGHT}" height="${(shiftY + UNDERLINE_HEIGHT).toFixed(3)}" />`
      : '';
    const hasCustomLong = isExtended && !!CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.backLong;
    const backExtension = (isExtended && !hasCustomLong)
      ? `\n    <!-- Back rise-stem extension to lower underline -->\n    <rect x="${(underlineEndX - UNDERLINE_HEIGHT).toFixed(3)}" y="${UNDERLINE_Y}" width="${UNDERLINE_HEIGHT}" height="${(shiftY + UNDERLINE_HEIGHT).toFixed(3)}" />`
      : '';

    const minVisualX = Math.min(...allX);
    const maxVisualX = Math.max(...allX);
    const padX = 28;
    const minX = Math.floor(minVisualX - padX);
    const maxX = Math.ceil(maxVisualX + padX);
    const minY = -42;
    const maxY = isExtended ? 26 : 20;
    const vbWidth = Math.max(1, maxX - minX);
    const vbHeight = maxY - minY;

    const fInnerSvg = (isExtended && !hasCustomFrontLong) ? stripUnderlineStub(fDb.innerSvg, fDb.baseline) : fDb.innerSvg;
    const bInnerSvg = (isExtended && !hasCustomLong) ? stripUnderlineStub(bDb.innerSvg, bDb.baseline) : bDb.innerSvg;

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}" width="${vbWidth}" height="${vbHeight}" data-nopitac-text="${escapeXml(text)}">
  <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
    <!-- Front letter (${escapeXml(firstChar)}) -->
    <g transform="translate(${fTx.toFixed(3)}, ${fTy.toFixed(3)})">
      ${fInnerSvg}
    </g>${frontExtension}
    <!-- Middle letters (Helvetica) -->
    ${middleMarkup.join('\n    ')}
    <!-- Back letter (${escapeXml(lastChar)}) -->
    <g transform="translate(${bTx.toFixed(3)}, ${bTy.toFixed(3)})">
      ${bInnerSvg}
    </g>${backExtension}
    <!-- Continuous Underline connecting front drop-stem to back rise-stem -->
    <rect x="${underlineLeft.toFixed(3)}" y="${curUnderlineY.toFixed(3)}" width="${underlineWidth.toFixed(3)}" height="${UNDERLINE_HEIGHT}" />
  </g>
  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" xml:space="preserve" y="0">${tspans}</text>
</svg>`;

    return {
      svgString,
      viewBox: `${minX} ${minY} ${vbWidth} ${vbHeight}`,
      vbWidth,
      vbHeight,
      totalWidth: maxVisualX - minVisualX,
      underlineStartX,
      underlineEndX,
      underlineWidth,
      isExtended,
      underlineY: curUnderlineY
    };
  }

  _renderSingle(ch) {
    const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
    const m = getCharMetrics(ch, this.font);
    const fTx = m.lsb - fDb.letterMinX;
    const fTy = -fDb.baseline;
    const underlineStartX = fTx + fDb.dropStemLeftX;
    const stubWidth = 24;
    const underlineEndX = underlineStartX + stubWidth;

    const padX = 24;
    const minVisualX = Math.min(0, underlineStartX, fTx + fDb.letterMinX);
    const maxVisualX = Math.max(fTx + fDb.letterMaxX, underlineEndX);
    const minX = Math.floor(minVisualX - padX);
    const maxX = Math.ceil(maxVisualX + padX);
    const minY = -42;
    const maxY = 20;
    const vbWidth = maxX - minX;
    const vbHeight = maxY - minY;

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}" width="${vbWidth}" height="${vbHeight}" data-nopitac-text="${escapeXml(ch)}">
  <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
    <g transform="translate(${fTx.toFixed(3)}, ${fTy.toFixed(3)})">
      ${fDb.innerSvg}
    </g>
    <rect x="${underlineStartX.toFixed(3)}" y="${UNDERLINE_Y}" width="${stubWidth}" height="${UNDERLINE_HEIGHT}" />
  </g>
  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" xml:space="preserve" y="0">
    <tspan x="0">${escapeXml(ch)}</tspan>
  </text>
</svg>`;

    return {
      svgString,
      viewBox: `${minX} ${minY} ${vbWidth} ${vbHeight}`,
      vbWidth,
      vbHeight,
      totalWidth: fDb.letterWidth,
      underlineStartX,
      underlineEndX,
      underlineWidth: stubWidth
    };
  }

  _buildSegment(segText, startX, tracking) {
    const chars = [...segText];
    if (chars.length === 1) {
      const ch = chars[0];
      const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;
      const m = getCharMetrics(ch, this.font);
      const fTx = startX + m.lsb - fDb.letterMinX;
      const fTy = -fDb.baseline;
      const bTx = startX + m.lsb - bDb.letterMinX;
      const bTy = -bDb.baseline;
      const dropX = fTx + fDb.dropStemLeftX;
      const riseX = bTx + bDb.riseStemRightX;
      const underLeft = Math.min(dropX, riseX);
      const underRight = Math.max(dropX, riseX);
      const underWidth = underRight - underLeft;

      const artwork = `
    <!-- Segment: ${escapeXml(ch)} -->
    <g transform="translate(${fTx.toFixed(3)}, ${fTy.toFixed(3)})">
      ${fDb.innerSvg}
    </g>
    <rect x="${underLeft.toFixed(3)}" y="${UNDERLINE_Y}" width="${underWidth.toFixed(3)}" height="${UNDERLINE_HEIGHT}" />`;

      const allX = [startX, dropX, riseX, fTx + fDb.letterMinX, fTx + fDb.letterMaxX];
      const tspans = `<tspan x="${startX.toFixed(3)}">${escapeXml(ch)}</tspan>`;
      const nextStartX = Math.max(startX + m.advance, riseX + 4);

      return {
        artwork,
        tspans,
        allX,
        isExtended: false,
        nextStartX,
        underlineStartX: dropX,
        underlineEndX: riseX,
        underlineWidth: underWidth
      };
    }

    const firstChar = chars[0];
    const lastChar = chars[chars.length - 1];

    const isExtended = hasMiddleDescender(chars);
    const shiftY = isExtended ? UNDERLINE_HEIGHT : 0;
    const curUnderlineY = UNDERLINE_Y + shiftY;

    let fDb = CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
    if (isExtended && CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.frontLong) {
      fDb = CUSTOM_GLYPH_DB[firstChar.toLowerCase()].frontLong;
    }
    let bDb = CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;
    if (isExtended && CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.backLong) {
      bDb = CUSTOM_GLYPH_DB[lastChar.toLowerCase()].backLong;
    }

    const positions = [startX];
    let curX = startX;
    for (let i = 0; i < chars.length - 1; i++) {
      const mA = getCharMetrics(chars[i], this.font);
      const kern = getHelveticaKerning(chars[i], chars[i + 1], this.font);
      curX += mA.advance + kern + tracking;
      positions.push(curX);
    }

    const mFirst = getCharMetrics(firstChar, this.font);
    const fTx = startX + mFirst.lsb - fDb.letterMinX;
    const fTy = -fDb.baseline;
    const underlineStartX = fTx + fDb.dropStemLeftX;

    const middleMarkup = [];
    for (let i = 1; i < chars.length - 1; i++) {
      const ch = chars[i];
      if (ch === ' ') continue;

      const originX = positions[i];
      const m = getCharMetrics(ch, this.font);
      if (m.d) {
        middleMarkup.push(`<path d="${m.d}" transform="translate(${originX.toFixed(3)}, 0)" />`);
      } else if (this.font) {
        const glyph = this.font.charToGlyph(ch);
        const path = glyph.getPath(originX, 0, FONT_SIZE);
        const d = path.toPathData(2);
        if (d) middleMarkup.push(`<path d="${d}" />`);
      }
    }

    const lastOriginX = positions[positions.length - 1];
    const mLast = getCharMetrics(lastChar, this.font);
    const bTx = lastOriginX + mLast.lsb - bDb.letterMinX;
    const bTy = -bDb.baseline;
    const underlineEndX = bTx + bDb.riseStemRightX;
    const lastLetterRight = lastOriginX + mLast.lsb + bDb.letterWidth;

    const underlineLeft = Math.min(underlineStartX, underlineEndX);
    const underlineRight = Math.max(underlineStartX, underlineEndX);
    const underlineWidth = Math.max(0, underlineRight - underlineLeft);

    const tspans = chars.map((ch, idx) => {
      const x = positions[idx].toFixed(3);
      const safeCh = ch === ' ' ? ' ' : escapeXml(ch);
      return `<tspan x="${x}">${safeCh}</tspan>`;
    }).join('');

    const hasCustomFrontLong = isExtended && !!CUSTOM_GLYPH_DB[firstChar.toLowerCase()]?.frontLong;
    const frontExtension = (isExtended && !hasCustomFrontLong)
      ? `\n    <rect x="${underlineStartX.toFixed(3)}" y="${UNDERLINE_Y}" width="${UNDERLINE_HEIGHT}" height="${(shiftY + UNDERLINE_HEIGHT).toFixed(3)}" />`
      : '';
    const hasCustomLong = isExtended && !!CUSTOM_GLYPH_DB[lastChar.toLowerCase()]?.backLong;
    const backExtension = (isExtended && !hasCustomLong)
      ? `\n    <rect x="${(underlineEndX - UNDERLINE_HEIGHT).toFixed(3)}" y="${UNDERLINE_Y}" width="${UNDERLINE_HEIGHT}" height="${(shiftY + UNDERLINE_HEIGHT).toFixed(3)}" />`
      : '';

    const fInnerSvg = (isExtended && !hasCustomFrontLong) ? stripUnderlineStub(fDb.innerSvg, fDb.baseline) : fDb.innerSvg;
    const bInnerSvg = (isExtended && !hasCustomLong) ? stripUnderlineStub(bDb.innerSvg, bDb.baseline) : bDb.innerSvg;

    const artwork = `
    <!-- Front letter (${escapeXml(firstChar)}) -->
    <g transform="translate(${fTx.toFixed(3)}, ${fTy.toFixed(3)})">
      ${fInnerSvg}
    </g>${frontExtension}
    <!-- Middle letters (Helvetica) -->
    ${middleMarkup.join('\n    ')}
    <!-- Back letter (${escapeXml(lastChar)}) -->
    <g transform="translate(${bTx.toFixed(3)}, ${bTy.toFixed(3)})">
      ${bInnerSvg}
    </g>${backExtension}
    <!-- Underline -->
    <rect x="${underlineLeft.toFixed(3)}" y="${curUnderlineY.toFixed(3)}" width="${underlineWidth.toFixed(3)}" height="${UNDERLINE_HEIGHT}" />`;

    const allX = [
      startX,
      underlineStartX,
      underlineEndX,
      fTx + fDb.letterMinX,
      fTx + fDb.letterMaxX,
      lastOriginX + mLast.lsb,
      lastLetterRight,
      lastOriginX + mLast.advance,
      ...positions
    ];

    const nextStartX = Math.max(lastOriginX + mLast.advance, lastLetterRight, underlineEndX);

    return {
      artwork,
      tspans,
      allX,
      isExtended,
      nextStartX,
      underlineStartX,
      underlineEndX,
      underlineWidth
    };
  }

  _renderMultiSegments(segments, tracking, fullText) {
    let curStartX = 0;
    const breakGap = 16;
    const artworks = [];
    const tspans = [];
    const allX = [];
    let hasAnyExtended = false;

    for (const seg of segments) {
      const segRes = this._buildSegment(seg, curStartX, tracking);
      artworks.push(segRes.artwork);
      tspans.push(segRes.tspans);
      allX.push(...segRes.allX);
      if (segRes.isExtended) hasAnyExtended = true;
      curStartX = segRes.nextStartX + breakGap;
    }

    const minVisualX = Math.min(...allX);
    const maxVisualX = Math.max(...allX);
    const padX = 28;
    const minX = Math.floor(minVisualX - padX);
    const maxX = Math.ceil(maxVisualX + padX);
    const minY = -42;
    const maxY = hasAnyExtended ? 26 : 20;
    const vbWidth = Math.max(1, maxX - minX);
    const vbHeight = maxY - minY;

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}" width="${vbWidth}" height="${vbHeight}" data-nopitac-text="${escapeXml(fullText)}">
  <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
    ${artworks.join('\n')}
  </g>
  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" xml:space="preserve" y="0">${tspans.join('')}</text>
</svg>`;

    return {
      svgString,
      viewBox: `${minX} ${minY} ${vbWidth} ${vbHeight}`,
      vbWidth,
      vbHeight,
      totalWidth: maxVisualX - minVisualX,
      underlineStartX: Math.min(...allX),
      underlineEndX: Math.max(...allX),
      underlineWidth: maxVisualX - minVisualX,
      isExtended: hasAnyExtended,
      underlineY: hasAnyExtended ? (UNDERLINE_Y + UNDERLINE_HEIGHT) : UNDERLINE_Y
    };
  }
}
