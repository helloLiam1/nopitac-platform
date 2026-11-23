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

import { FONT_SIZE, UNDERLINE_Y, UNDERLINE_HEIGHT, stripUnderlineStub } from '../src/engine/nopitacRenderer.js';
import { CUSTOM_GLYPH_DB } from '../src/engine/customGlyphDb.js';
import { HELVETICA_GLYPHS, getCharMetrics, getHelveticaKerning } from '../src/engine/helveticaGlyphs.js';

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
   * Ensures the image covers the mask (object-fit: cover) and pans smoothly
   * inside the mask while the square mask itself stays completely stationary.
   */
  calculateImagePlacement(maskX, maskY, maskSize, options = {}) {
    const natW = options.imageNaturalWidth || 200;
    const natH = options.imageNaturalHeight || 200;
    const aspect = natW / (natH || 1);
    const imgScale = options.imageScale !== undefined ? options.imageScale : 1.05;
    const imgPanX = options.imagePanX || 0; // % offset (-100 to +100)
    const imgPanY = options.imagePanY || 0;

    // To cover the stationary square mask completely (object-fit: cover):
    let coverW, coverH;
    if (aspect >= 1) {
      // Landscape or square: height covers the square mask, width scales proportionally
      coverH = maskSize;
      coverW = maskSize * aspect;
    } else {
      // Portrait: width covers the square mask, height scales proportionally
      coverW = maskSize;
      coverH = maskSize / aspect;
    }

    // Apply zoom / scale factor
    const imgW = coverW * imgScale;
    const imgH = coverH * imgScale;

    // Stationary mask center
    const maskCenterX = maskX + maskSize / 2;
    const maskCenterY = maskY + maskSize / 2;

    // Pan offsets (relative to square size)
    const panOffsetX = (imgPanX * maskSize) / 100;
    const panOffsetY = (imgPanY * maskSize) / 100;

    // Image top-left corner
    const imgX = maskCenterX - imgW / 2 + panOffsetX;
    const imgY = maskCenterY - imgH / 2 + panOffsetY;

    return {
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH
    };
  }

  /**
   * Render the complete final photo frame SVG.
   */
  renderFinalFrame(name, options = {}) {
    const metrics = this.calculateMetrics(name, options);
    if (!metrics) return '';

    const fontSize = options.fontSize || 32;
    const scale = fontSize / this.baseFontSize;
    const theme = options.theme || 'light'; // 'light' | 'dark'
    const showCardBorder = options.showCardBorder !== false;
    const cardPaddingRatio = options.cardPaddingRatio || 0.35;

    const textColor = theme === 'dark' ? '#ffffff' : '#000000';
    const bgColor = theme === 'dark' ? '#000000' : '#ffffff';
    const strokeColor = textColor;
    const imageHref = options.imageHref || '';
    const imgScale = options.imageScale || 1.0;
    const imgPanX = options.imagePanX || 0; // % offset (-50 to +50)
    const imgPanY = options.imagePanY || 0;

    const strokeW = metrics.strokeWidth * scale;
    const squareSizePx = metrics.squareSize * scale;
    const squareXPx = metrics.squareX * scale;
    const squareYPx = metrics.squareY * scale;
    const squareBottomPx = metrics.squareBottom * scale;

    // Outer card canvas size
    const pad = squareSizePx * cardPaddingRatio;
    const cardW = squareSizePx + pad * 2;
    const cardH = cardW; // square card like reference

    // Center the composition horizontally and vertically in card
    const originShiftX = (cardW - squareSizePx) / 2 - squareXPx;
    // Position text & square with balanced top/bottom margin
    const textTopPx = Math.abs(metrics.fTy * scale);
    const totalCompHeight = textTopPx + squareBottomPx;
    const originShiftY = (cardH - totalCompHeight) / 2 + textTopPx - squareYPx;

    const clipRectX = squareXPx + originShiftX;
    const clipRectY = squareYPx + originShiftY;

    const clipId = 'photoframe-clip-' + Math.random().toString(36).slice(2, 9);

    // Front & Back clean letter vectors
    const fInnerClean = stripUnderlineStub(metrics.fDb.innerSvg, metrics.fDb.baseline);
    const bInnerClean = stripUnderlineStub(metrics.bDb.innerSvg, metrics.bDb.baseline);

    // Middle letter paths
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

    // Extended underline stems and bottom rail
    const leftStemX = squareXPx;
    const leftStemHeight = squareBottomPx;
    const rightStemX = (metrics.underlineEndX * scale) - strokeW;
    const rightStemHeight = squareBottomPx;
    const bottomUnderlineY = squareBottomPx - strokeW;

    // Image placement inside the stationary square mask
    const imgPlacement = this.calculateImagePlacement(clipRectX, clipRectY, squareSizePx, options);

    const borderStroke = showCardBorder ? `<rect x="1" y="1" width="${(cardW - 2).toFixed(2)}" height="${(cardH - 2).toFixed(2)}" fill="none" stroke="${strokeColor}" stroke-width="2" />` : '';

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" viewBox="0 0 ${cardW.toFixed(2)} ${cardH.toFixed(2)}" class="photo-frame-svg">
  <defs>
    <!-- Stationary Square Mask -->
    <clipPath id="${clipId}">
      <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" />
    </clipPath>
  </defs>

  <!-- Background Artboard Card -->
  <rect x="0" y="0" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" fill="${bgColor}" />
  ${borderStroke}

  <!-- Layer 1: Clipped Image inside the stationary square mask (Below Text) -->
  <g clip-path="url(#${clipId})">
    ${imageHref ? `
    <image href="${imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
    ` : `
    <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#388e3c" />
    `}
  </g>

  <!-- Layer 2: Extended Frame & Typography (On Top of Image) -->
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="${textColor}">
    <!-- Left vertical bracket rail: extended down to photo bottom -->
    <rect x="${leftStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${leftStemHeight.toFixed(3)}" />

    <!-- Bottom horizontal underline: spans across photo bottom -->
    <rect x="${squareXPx.toFixed(3)}" y="${bottomUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${strokeW.toFixed(3)}" />

    <!-- Right vertical bracket rail: extended down to photo bottom -->
    <rect x="${rightStemX.toFixed(3)}" y="0" width="${strokeW.toFixed(3)}" height="${rightStemHeight.toFixed(3)}" />

    <!-- Front Letter with drop-stem anchor -->
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
      ${fInnerClean}
    </g>

    <!-- Middle Letters from Helvetica -->
    ${middlePaths.join('\n    ')}

    <!-- Back Letter with rise-stem anchor -->
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
      ${bInnerClean}
    </g>
  </g>
</svg>`.trim();
  }

  /**
   * Render side-by-side comparison view (Dark + Light cards), identical to reference image.
   */
  renderSideBySide(name, options = {}) {
    const darkCard = this.renderFinalFrame(name, { ...options, theme: 'dark' });
    const lightCard = this.renderFinalFrame(name, { ...options, theme: 'light' });

    return {
      darkCard,
      lightCard
    };
  }

  /**
   * Render step-by-step interactive breakdowns (Steps 1, 2, 3, 4, 5).
   */
  renderStep(name, stepNumber, options = {}) {
    const metrics = this.calculateMetrics(name, options);
    if (!metrics) return '';

    const fontSize = options.fontSize || 24;
    const scale = fontSize / this.baseFontSize;
    const imageHref = options.imageHref || '';
    const strokeW = metrics.strokeWidth * scale;
    const squareSizePx = metrics.squareSize * scale;
    const squareXPx = metrics.squareX * scale;
    const squareYPx = metrics.squareY * scale;

    const pad = 24;
    const totalW = squareSizePx + pad * 2 + 30;
    const totalH = squareSizePx + pad * 2 + 50;
    const originShiftX = pad;
    const originShiftY = pad + 20;

    const clipId = 'step-clip-' + stepNumber + '-' + Math.random().toString(36).slice(2, 7);

    // Standard baseline underline
    const baselineUnderlineY = 0; // at baseline
    const underlineHeightPx = strokeW;

    const fInnerWithStub = metrics.fDb.innerSvg;
    const bInnerWithStub = metrics.bDb.innerSvg;
    const fInnerClean = stripUnderlineStub(metrics.fDb.innerSvg, metrics.fDb.baseline);
    const bInnerClean = stripUnderlineStub(metrics.bDb.innerSvg, metrics.bDb.baseline);

    const middlePaths = [];
    for (let i = 1; i < metrics.chars.length - 1; i++) {
      const ch = metrics.chars[i];
      if (ch === ' ') continue;
      const m = getCharMetrics(ch, null);
      if (m?.d) {
        const origX = metrics.positions[i] * scale;
        middlePaths.push(`<path d="${m.d}" transform="translate(${origX.toFixed(3)}, 0) scale(${scale.toFixed(5)})" fill="#000000" />`);
      }
    }

    if (stepNumber === 1) {
      // Step 1: Write the name in Nopitac Helvetica with normal signature underline
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${(totalH * 0.45).toFixed(2)}">
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    <!-- Baseline Underline -->
    <rect x="${squareXPx.toFixed(3)}" y="${baselineUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${underlineHeightPx.toFixed(3)}" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerWithStub}</g>
    ${middlePaths.join('')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerWithStub}</g>
  </g>
</svg>`.trim();
    }

    if (stepNumber === 2) {
      // Step 2: Examine underline length and create square with that side length
      const sqY = originShiftY + underlineHeightPx + 8;
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${totalH.toFixed(2)}">
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    <rect x="${squareXPx.toFixed(3)}" y="${baselineUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${underlineHeightPx.toFixed(3)}" fill="#000000" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerWithStub}</g>
    ${middlePaths.join('')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerWithStub}</g>
  </g>
  <!-- Square side length = underline length -->
  <rect x="${(originShiftX + squareXPx).toFixed(3)}" y="${sqY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#111111" />
  <!-- Dimension Callout -->
  <text x="${(originShiftX + squareXPx + squareSizePx / 2).toFixed(3)}" y="${(sqY + squareSizePx / 2).toFixed(3)}" fill="#ffffff" font-family="'Helvetica Neue', sans-serif" font-size="11" text-anchor="middle" dominant-baseline="middle">${squareSizePx.toFixed(1)}px × ${squareSizePx.toFixed(1)}px</text>
</svg>`.trim();
    }

    if (stepNumber === 3) {
      // Step 3: Square as clipping mask for submitted image
      const sqY = originShiftY + underlineHeightPx + 8;
      const sqX = originShiftX + squareXPx;
      const imgPlacement3 = this.calculateImagePlacement(sqX, sqY, squareSizePx, options);
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${totalH.toFixed(2)}">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${sqX.toFixed(3)}" y="${sqY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" />
    </clipPath>
  </defs>
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    <rect x="${squareXPx.toFixed(3)}" y="${baselineUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${underlineHeightPx.toFixed(3)}" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerWithStub}</g>
    ${middlePaths.join('')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerWithStub}</g>
  </g>
  <g clip-path="url(#${clipId})">
    ${imageHref ? `
    <image href="${imageHref}" x="${imgPlacement3.x.toFixed(3)}" y="${imgPlacement3.y.toFixed(3)}" width="${imgPlacement3.width.toFixed(3)}" height="${imgPlacement3.height.toFixed(3)}" preserveAspectRatio="none" />
    ` : `
    <rect x="${sqX.toFixed(3)}" y="${sqY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#388e3c" />
    `}
  </g>
</svg>`.trim();
    }

    if (stepNumber === 4) {
      // Step 4: Move square with image below text, top edge 1/4 x-height from baseline
      const sqClipX = squareXPx + originShiftX;
      const sqClipY = squareYPx + originShiftY;
      const imgPlacement4 = this.calculateImagePlacement(sqClipX, sqClipY, squareSizePx, options);
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${totalH.toFixed(2)}">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${sqClipX.toFixed(3)}" y="${sqClipY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" />
    </clipPath>
  </defs>
  <!-- Image Below Text Layer inside stationary square mask -->
  <g clip-path="url(#${clipId})">
    ${imageHref ? `
    <image href="${imageHref}" x="${imgPlacement4.x.toFixed(3)}" y="${imgPlacement4.y.toFixed(3)}" width="${imgPlacement4.width.toFixed(3)}" height="${imgPlacement4.height.toFixed(3)}" preserveAspectRatio="none" />
    ` : `
    <rect x="${sqClipX.toFixed(3)}" y="${sqClipY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#388e3c" />
    `}
  </g>
  <!-- Text Layer on Top (1/4 x-height overlap) -->
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    <rect x="${squareXPx.toFixed(3)}" y="${baselineUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${underlineHeightPx.toFixed(3)}" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${fInnerWithStub}</g>
    ${middlePaths.join('')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${bInnerWithStub}</g>
  </g>
</svg>`.trim();
    }

    if (stepNumber === 5) {
      // Step 5: Extend underline till end of square photo (final frame)
      return this.renderFinalFrame(name, {
        ...options,
        fontSize,
        imageHref,
        theme: 'light',
        showCardBorder: false,
        cardPaddingRatio: 0.15
      });
    }

    return '';
  }
}

