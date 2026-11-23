/**
 * NOPITAC Photo Frame Engine
 * 
 * Implements the 5-step photo frame construction:
 * 1. Write the name of the person in Nopitac Helvetica
 * 2. Examine the length of the underline and create a square with that length as the side
 * 3. Use that square as the clipping mask for the submitted image
 * 4. Move square with image below text, top edge reaches 1/4 x-height from baseline
 * 5. Extend underline till end of square photo (down left side, across bottom, up right side)
 */

import { FONT_SIZE, UNDERLINE_HEIGHT, stripUnderlineStub } from './nopitacRenderer.js';
import { CUSTOM_GLYPH_DB } from './customGlyphDb.js';
import { getCharMetrics, getHelveticaKerning } from './helveticaGlyphs.js';

export class PhotoFrameEngine {
  constructor() {
    this.baseFontSize = FONT_SIZE; // 43.74
  }

  /**
   * Calculate core geometry for a given name string.
   */
  calculateMetrics(name, options = {}) {
    const rawText = (name || 'charlie maignan').trim();
    const chars = [...rawText];
    if (chars.length < 2) {
      return null;
    }

    const firstChar = chars[0].toLowerCase();
    const lastChar = chars[chars.length - 1].toLowerCase();

    const fDb = CUSTOM_GLYPH_DB[firstChar]?.front || CUSTOM_GLYPH_DB['a'].front;
    const bDb = CUSTOM_GLYPH_DB[lastChar]?.back || CUSTOM_GLYPH_DB['a'].back;

    // Typographic positions at base FONT_SIZE (43.74)
    const positions = [0];
    let curX = 0;
    const tracking = options.tracking || 0;

    for (let i = 0; i < chars.length - 1; i++) {
      const mA = getCharMetrics(chars[i], null);
      const kern = getHelveticaKerning(chars[i], chars[i + 1], null);
      curX += mA.advance + kern + tracking;
      positions.push(curX);
    }

    const mFirst = getCharMetrics(firstChar, null);
    const fTx = mFirst.lsb - fDb.letterMinX;
    const fTy = -fDb.baseline;
    const underlineStartX = fTx + fDb.dropStemLeftX;

    const lastOriginX = positions[positions.length - 1];
    const mLast = getCharMetrics(lastChar, null);
    const bTx = lastOriginX + mLast.lsb - bDb.letterMinX;
    const bTy = -bDb.baseline;
    const underlineEndX = bTx + bDb.riseStemRightX;

    const underlineWidth = Math.max(10, underlineEndX - underlineStartX);

    // Standard Helvetica Neue proportions:
    // x-height ratio = 0.517
    const xHeight = this.baseFontSize * 0.517;
    // Overlap: 1/4 the length of x-height from baseline
    const overlap = xHeight * 0.25;

    const squareSize = underlineWidth;
    const squareX = underlineStartX;
    const squareY = -overlap; // Baseline is at y = 0, square top is above baseline by 1/4 x-height
    const squareBottom = squareY + squareSize;

    return {
      text: rawText,
      chars,
      firstChar,
      lastChar,
      positions,
      fDb,
      bDb,
      fTx,
      fTy,
      bTx,
      bTy,
      underlineStartX,
      underlineEndX,
      underlineWidth,
      strokeWidth: UNDERLINE_HEIGHT, // 3.8437 at base font size
      xHeight,
      overlap,
      squareSize,
      squareX,
      squareY,
      squareBottom
    };
  }

  /**
   * Calculate image placement inside the stationary square mask.
   * Ensures the image completely covers the mask (object-fit: cover) and clamps
   * pan offsets so no empty space outside the image can ever be revealed.
   */
  calculateImagePlacement(maskX, maskY, maskSize, options = {}) {
    const natW = options.imageNaturalWidth || 200;
    const natH = options.imageNaturalHeight || 200;
    const aspect = natW / (natH || 1);
    const imgScale = Math.max(1.0, options.imageScale !== undefined ? options.imageScale : 1.0);
    const imgPanX = options.imagePanX || 0; // % offset (-100 to +100)
    const imgPanY = options.imagePanY || 0;

    // Minimum size to cover the stationary square mask completely:
    let coverW, coverH;
    if (aspect >= 1) {
      coverH = maskSize;
      coverW = maskSize * aspect;
    } else {
      coverW = maskSize;
      coverH = maskSize / aspect;
    }

    // Apply zoom / scale factor (never < 1.0)
    const imgW = coverW * imgScale;
    const imgH = coverH * imgScale;

    // Stationary mask center
    const maskCenterX = maskX + maskSize / 2;
    const maskCenterY = maskY + maskSize / 2;

    // Unclamped candidate offsets (relative to square size)
    const rawOffsetX = (imgPanX * maskSize) / 100;
    const rawOffsetY = (imgPanY * maskSize) / 100;

    // Natural centered position relative to mask top-left:
    const baseRelX = (maskSize - imgW) / 2;
    const baseRelY = (maskSize - imgH) / 2;

    // Combined rel position:
    let relX = baseRelX + rawOffsetX;
    let relY = baseRelY + rawOffsetY;

    // Strict boundary clamping:
    // Mask extends from 0 to maskSize.
    // Image left must be <= 0 and image right must be >= maskSize.
    // Therefore: maskSize - imgW <= relX <= 0
    const minX = maskSize - imgW;
    const maxX = 0;
    relX = Math.max(minX, Math.min(maxX, relX));

    const minY = maskSize - imgH;
    const maxY = 0;
    relY = Math.max(minY, Math.min(maxY, relY));

    // Absolute position
    const imgX = maskX + relX;
    const imgY = maskY + relY;

    return {
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH,
      relX,
      relY,
      minX,
      maxX,
      minY,
      maxY
    };
  }

  /**
   * Render frame elements (defs, image, text/stems) centered within a given bounding box.
   * Does NOT output an outer <svg> wrapper or card border.
   */
  renderFrameGroup(name, boxX, boxY, boxW, boxH, options = {}) {
    const metrics = this.calculateMetrics(name, options);
    if (!metrics) return null;

    const theme = options.theme || 'dark';
    const textColor = theme === 'dark' ? '#ffffff' : '#000000';
    const imageHref = options.imageHref || '';

    const baseW = metrics.underlineWidth;
    const baseTextTop = Math.abs(metrics.fTy);
    const baseTotalH = baseTextTop + metrics.squareBottom;

    // Scale to fit reference box with standard 0.965 inset ratio (matching Illustrator SVG mask size 117.1 / 121.27)
    const fitRatio = options.fitRatio !== undefined ? options.fitRatio : 0.965;
    const scale = Math.min(boxW / baseW, boxH / baseTotalH) * fitRatio;

    const strokeW = metrics.strokeWidth * scale;
    const squareSize = metrics.squareSize * scale;

    const frameW = baseW * scale;
    const frameH = baseTotalH * scale;

    // Center horizontally and vertically within (boxX, boxY, boxW, boxH)
    const originShiftX = boxX + (boxW - frameW) / 2 - (metrics.squareX * scale);
    const originShiftY = boxY + (boxH - frameH) / 2 + (baseTextTop * scale) - (metrics.squareY * scale);

    const maskX = (metrics.squareX * scale) + originShiftX;
    const maskY = (metrics.squareY * scale) + originShiftY;

    const clipId = options.clipId || ('photo-clip-' + Math.random().toString(36).slice(2, 9));

    const imgPlacement = this.calculateImagePlacement(maskX, maskY, squareSize, options);

    const fInnerClean = stripUnderlineStub(metrics.fDb.innerSvg, metrics.fDb.baseline);
    const bInnerClean = stripUnderlineStub(metrics.bDb.innerSvg, metrics.bDb.baseline);

    const middlePaths = [];
    for (let i = 1; i < metrics.chars.length - 1; i++) {
      const ch = metrics.chars[i];
      if (ch === ' ') continue;
      const m = getCharMetrics(ch, null);
      if (m?.d) {
        const origX = metrics.positions[i] * scale;
        middlePaths.push(`<path d="${m.d}" transform="translate(${origX.toFixed(3)}, 0) scale(${scale.toFixed(5)})" fill="${textColor}" />`);
      }
    }

    const leftStemX = metrics.squareX * scale;
    const leftStemHeight = metrics.squareBottom * scale;
    const rightStemX = (metrics.underlineEndX * scale) - strokeW;
    const rightStemHeight = metrics.squareBottom * scale;
    const bottomUnderlineY = (metrics.squareBottom * scale) - strokeW;

    return {
      clipId,
      mask: { x: maskX, y: maskY, size: squareSize },
      imgPlacement,
      scale,
      originShiftX,
      originShiftY,
      defs: `
    <clipPath id="${clipId}">
      <rect x="${maskX.toFixed(3)}" y="${maskY.toFixed(3)}" width="${squareSize.toFixed(3)}" height="${squareSize.toFixed(3)}" />
    </clipPath>`,
      imageSvg: imageHref ? `
    <g clip-path="url(#${clipId})" id="photoStageClippedArea" style="cursor: grab;">
      <image id="photoToolImage" href="${imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
    </g>` : `
    <g clip-path="url(#${clipId})" id="photoStageClippedArea">
      <rect x="${maskX.toFixed(3)}" y="${maskY.toFixed(3)}" width="${squareSize.toFixed(3)}" height="${squareSize.toFixed(3)}" fill="#222222" />
    </g>`,
      textSvg: `
    <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="${textColor}" pointer-events="none">
      <rect x="${leftStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${leftStemHeight.toFixed(3)}" />
      <rect x="${(metrics.squareX * scale).toFixed(3)}" y="${bottomUnderlineY.toFixed(3)}" width="${squareSize.toFixed(3)}" height="${strokeW.toFixed(3)}" />
      <rect x="${rightStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${rightStemHeight.toFixed(3)}" />
      <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerClean}</g>
      ${middlePaths.join('\n      ')}
      <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerClean}</g>
    </g>`
    };
  }

  /**
   * Render the complete photo frame SVG.
   */
  renderFinalFrame(name, options = {}) {
    const metrics = this.calculateMetrics(name, options);
    if (!metrics) return '';

    const fontSize = options.fontSize || 32;
    const scale = fontSize / this.baseFontSize;
    const theme = options.theme || 'light'; // 'light' | 'dark'
    const showCardBorder = options.showCardBorder === true;
    const cardPaddingRatio = options.cardPaddingRatio || 0.15;

    const textColor = theme === 'dark' ? '#ffffff' : '#000000';
    const bgColor = theme === 'dark' ? '#000000' : '#ffffff';
    const strokeColor = textColor;
    const imageHref = options.imageHref || '';

    const strokeW = metrics.strokeWidth * scale;
    const squareSizePx = metrics.squareSize * scale;
    const squareXPx = metrics.squareX * scale;
    const squareYPx = metrics.squareY * scale;
    const squareBottomPx = metrics.squareBottom * scale;

    // Total content bounding box
    const textTopPx = Math.abs(metrics.fTy * scale);
    const totalCompHeight = textTopPx + squareBottomPx;

    const pad = options.fixedPad !== undefined ? options.fixedPad : squareSizePx * cardPaddingRatio;
    const cardW = options.cardWidth || (squareSizePx + pad * 2);
    const cardH = options.cardHeight || (totalCompHeight + pad * 2);

    // Center horizontally and vertically within the card
    const originShiftX = (cardW - squareSizePx) / 2 - squareXPx;
    const originShiftY = (cardH - totalCompHeight) / 2 + textTopPx - squareYPx;

    const clipRectX = squareXPx + originShiftX;
    const clipRectY = squareYPx + originShiftY;

    const clipId = 'pfc-' + Math.random().toString(36).slice(2, 9);

    const fInnerClean = stripUnderlineStub(metrics.fDb.innerSvg, metrics.fDb.baseline);
    const bInnerClean = stripUnderlineStub(metrics.bDb.innerSvg, metrics.bDb.baseline);

    const middlePaths = [];
    for (let i = 1; i < metrics.chars.length - 1; i++) {
      const ch = metrics.chars[i];
      if (ch === ' ') continue;
      const m = getCharMetrics(ch, null);
      if (m?.d) {
        const origX = metrics.positions[i] * scale;
        middlePaths.push(`<path d="${m.d}" transform="translate(${origX.toFixed(3)}, 0) scale(${scale.toFixed(5)})" fill="${textColor}" />`);
      }
    }

    const leftStemX = squareXPx;
    const leftStemHeight = squareBottomPx;
    const rightStemX = (metrics.underlineEndX * scale) - strokeW;
    const rightStemHeight = squareBottomPx;
    const bottomUnderlineY = squareBottomPx - strokeW;

    const imgPlacement = this.calculateImagePlacement(clipRectX, clipRectY, squareSizePx, options);

    const borderStroke = showCardBorder
      ? `<rect x="0.75" y="0.75" width="${(cardW - 1.5).toFixed(2)}" height="${(cardH - 1.5).toFixed(2)}" fill="none" stroke="${strokeColor}" stroke-width="1.5" />`
      : '';

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" viewBox="0 0 ${cardW.toFixed(2)} ${cardH.toFixed(2)}" class="photo-frame-svg">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" />
    </clipPath>
  </defs>

  <rect x="0" y="0" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" fill="${bgColor}" />
  ${borderStroke}

  <!-- Layer 1: Clipped Image inside square mask (below text) -->
  <g clip-path="url(#${clipId})">
    ${imageHref ? `
    <image href="${imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
    ` : `
    <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#111111" />
    `}
  </g>

  <!-- Layer 2: Extended Frame & Typography -->
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="${textColor}">
    <rect x="${leftStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${leftStemHeight.toFixed(3)}" />
    <rect x="${squareXPx.toFixed(3)}" y="${bottomUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${strokeW.toFixed(3)}" />
    <rect x="${rightStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${rightStemHeight.toFixed(3)}" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerClean}</g>
    ${middlePaths.join('\n    ')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerClean}</g>
  </g>
</svg>`.trim();
  }
}
