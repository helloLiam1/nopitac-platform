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

import {
  FONT_SIZE,
  UNDERLINE_Y,
  UNDERLINE_HEIGHT,
  hasMiddleDescender,
  stripUnderlineStub
} from '../src/engine/nopitacRenderer.js';
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

    // Extended underline for middle descenders (p, q, y, g, j)
    const isExtended = hasMiddleDescender(chars);
    const shiftY = isExtended ? UNDERLINE_HEIGHT : 0;
    const curUnderlineY = UNDERLINE_Y + shiftY;

    const hasCustomFrontLong = isExtended && !!CUSTOM_GLYPH_DB[firstChar]?.frontLong;
    const fDb = hasCustomFrontLong
      ? CUSTOM_GLYPH_DB[firstChar].frontLong
      : (CUSTOM_GLYPH_DB[firstChar]?.front || CUSTOM_GLYPH_DB['a'].front);

    const hasCustomBackLong = isExtended && !!CUSTOM_GLYPH_DB[lastChar]?.backLong;
    const bDb = hasCustomBackLong
      ? CUSTOM_GLYPH_DB[lastChar].backLong
      : (CUSTOM_GLYPH_DB[lastChar]?.back || CUSTOM_GLYPH_DB['a'].back);

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

    // Standard Helvetica Neue proportions: x-height ratio = 0.517
    const xHeight = this.baseFontSize * 0.517;
    // Overlap: 1/4 the length of x-height from baseline
    const overlap = xHeight * 0.25;

    const squareSize = underlineWidth;
    const squareX = underlineStartX;
    const squareY = -overlap; // Top of square sits 1/4 x-height above baseline (y = 0)
    const squareBottom = squareY + squareSize;

    return {
      text: rawText,
      chars,
      firstChar,
      lastChar,
      isExtended,
      shiftY,
      curUnderlineY,
      hasCustomFrontLong,
      hasCustomBackLong,
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
   * Build stripped front/back glyph SVG and middle Helvetica letter paths.
   */
  _buildWordLayers(metrics, scale, textColor) {
    const fStubTargetY = metrics.hasCustomFrontLong ? metrics.curUnderlineY : UNDERLINE_Y;
    const bStubTargetY = metrics.hasCustomBackLong ? metrics.curUnderlineY : UNDERLINE_Y;
    const fInnerClean = stripUnderlineStub(metrics.fDb.innerSvg, metrics.fDb.baseline, fStubTargetY);
    const bInnerClean = stripUnderlineStub(metrics.bDb.innerSvg, metrics.bDb.baseline, bStubTargetY);

    const middlePaths = [];
    for (let i = 1; i < metrics.chars.length - 1; i++) {
      const ch = metrics.chars[i];
      if (ch === ' ') continue;
      const m = getCharMetrics(ch, null);
      if (m?.d) {
        const origX = metrics.positions[i] * scale;
        middlePaths.push(
          `<path d="${m.d}" transform="translate(${origX.toFixed(3)}, 0) scale(${scale.toFixed(5)})" fill="${textColor}" />`
        );
      }
    }

    const strokeW = metrics.strokeWidth * scale;
    const stemTopY = metrics.curUnderlineY * scale;
    const leftStemX = metrics.squareX * scale;
    const rightStemX = (metrics.underlineEndX * scale) - strokeW;

    // If a custom frontLong/backLong glyph isn't present during extended mode, bridge down to stemTopY
    const frontFallbackExt = (metrics.isExtended && !metrics.hasCustomFrontLong)
      ? `<rect x="${leftStemX.toFixed(3)}" y="${(UNDERLINE_Y * scale).toFixed(3)}" width="${strokeW.toFixed(3)}" height="${((metrics.shiftY + UNDERLINE_HEIGHT) * scale).toFixed(3)}" />`
      : '';
    const backFallbackExt = (metrics.isExtended && !metrics.hasCustomBackLong)
      ? `<rect x="${rightStemX.toFixed(3)}" y="${(UNDERLINE_Y * scale).toFixed(3)}" width="${strokeW.toFixed(3)}" height="${((metrics.shiftY + UNDERLINE_HEIGHT) * scale).toFixed(3)}" />`
      : '';

    return {
      fInnerClean,
      bInnerClean,
      middlePaths,
      stemTopY,
      leftStemX,
      rightStemX,
      strokeW,
      frontFallbackExt,
      backFallbackExt
    };
  }

  /**
   * Compute synchronized box rail, bottom bar, and photo clip geometry at collapse progress p in [0, 1].
   * p = 0: full extended frame; p = 1: collapsed down cleanly into the standard baseline underline.
   */
  _computeFrameGeometry(metrics, scale, progress = 0) {
    const p = Math.min(1, Math.max(0, progress));
    const strokeW = metrics.strokeWidth * scale;
    const stemTopY = metrics.curUnderlineY * scale;
    const squareSizePx = metrics.squareSize * scale;
    const squareXPx = metrics.squareX * scale;
    const squareYPx = metrics.squareY * scale;
    const squareBottomPx = Math.max(metrics.squareBottom * scale, stemTopY + strokeW);

    const fullBarY = squareBottomPx - strokeW;
    const collapsedBarY = stemTopY;
    const bottomUnderlineY = collapsedBarY + (fullBarY - collapsedBarY) * (1 - p);
    const curFrameBottomY = bottomUnderlineY + strokeW;

    // Vertical rails start cleanly at stemTopY (curUnderlineY * scale) and stay flush with curFrameBottomY
    const stemHeight = Math.max(strokeW, curFrameBottomY - stemTopY);
    const clipMaskHeight = p >= 0.98 ? 0 : Math.max(0, curFrameBottomY - squareYPx);
    const imageOpacity = Math.max(0, Math.min(1, 1 - Math.max(0, (p - 0.5) / 0.45)));

    return {
      p,
      strokeW,
      stemTopY,
      squareSizePx,
      squareXPx,
      squareYPx,
      squareBottomPx,
      bottomUnderlineY,
      stemHeight,
      clipMaskHeight,
      imageOpacity
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
   * Render the complete final photo frame SVG (collapse progress p = 0).
   */
  renderFinalFrame(name, options = {}) {
    return this.renderAnimatedFrame(name, 0, options);
  }

  /**
   * Render the photo frame SVG at collapse animation progress p in [0, 1].
   */
  renderAnimatedFrame(name, progress = 0, options = {}) {
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

    const geom = this._computeFrameGeometry(metrics, scale, progress);
    const word = this._buildWordLayers(metrics, scale, textColor);

    // Outer card canvas size stays constant during animation so card framing doesn't jump
    const pad = geom.squareSizePx * cardPaddingRatio;
    const cardW = geom.squareSizePx + pad * 2;
    const cardH = cardW;

    const originShiftX = (cardW - geom.squareSizePx) / 2 - geom.squareXPx;
    const textTopPx = Math.abs(metrics.fTy * scale);
    const totalCompHeight = textTopPx + geom.squareBottomPx;
    const originShiftY = (cardH - totalCompHeight) / 2 + textTopPx - geom.squareYPx;

    const clipRectX = geom.squareXPx + originShiftX;
    const clipRectY = geom.squareYPx + originShiftY;
    const clipId = 'photoframe-clip-' + Math.random().toString(36).slice(2, 9);

    const imgPlacement = this.calculateImagePlacement(clipRectX, clipRectY, geom.squareSizePx, options);
    const borderStroke = showCardBorder
      ? `<rect x="1" y="1" width="${(cardW - 2).toFixed(2)}" height="${(cardH - 2).toFixed(2)}" fill="none" stroke="${strokeColor}" stroke-width="2" />`
      : '';

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" viewBox="0 0 ${cardW.toFixed(2)} ${cardH.toFixed(2)}" class="photo-frame-svg">
  <defs>
    <!-- Stationary Top, Collapsing Bottom Mask -->
    <clipPath id="${clipId}">
      <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${geom.squareSizePx.toFixed(3)}" height="${geom.clipMaskHeight.toFixed(3)}" />
    </clipPath>
  </defs>

  <!-- Background Artboard Card -->
  <rect x="0" y="0" width="${cardW.toFixed(2)}" height="${cardH.toFixed(2)}" fill="${bgColor}" />
  ${borderStroke}

  <!-- Layer 1: Clipped Image inside the collapsing square mask (Below Text) -->
  <g clip-path="url(#${clipId})">
    ${imageHref ? `
    <image href="${imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" opacity="${geom.imageOpacity.toFixed(3)}" />
    ` : `
    <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${geom.squareSizePx.toFixed(3)}" height="${geom.squareSizePx.toFixed(3)}" fill="#388e3c" opacity="${geom.imageOpacity.toFixed(3)}" />
    `}
  </g>

  <!-- Layer 2: Extended Frame & Typography (On Top of Image) -->
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="${textColor}">
    ${word.frontFallbackExt}
    ${word.backFallbackExt}

    <!-- Left vertical bracket rail: joins stemTopY flush down to bottom rail -->
    <rect x="${word.leftStemX.toFixed(3)}" y="${geom.stemTopY.toFixed(3)}" width="${geom.strokeW.toFixed(3)}" height="${geom.stemHeight.toFixed(3)}" />

    <!-- Bottom horizontal underline: rises up to curUnderlineY as p -> 1 -->
    <rect x="${geom.squareXPx.toFixed(3)}" y="${geom.bottomUnderlineY.toFixed(3)}" width="${geom.squareSizePx.toFixed(3)}" height="${geom.strokeW.toFixed(3)}" />

    <!-- Right vertical bracket rail: joins stemTopY flush down to bottom rail -->
    <rect x="${word.rightStemX.toFixed(3)}" y="${geom.stemTopY.toFixed(3)}" width="${geom.strokeW.toFixed(3)}" height="${geom.stemHeight.toFixed(3)}" />

    <!-- Front Letter with drop-stem anchor -->
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
      ${word.fInnerClean}
    </g>

    <!-- Middle Letters from Helvetica -->
    ${word.middlePaths.join('\n    ')}

    <!-- Back Letter with rise-stem anchor -->
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
      ${word.bInnerClean}
    </g>
  </g>
</svg>`.trim();
  }

  /**
   * Render side-by-side comparison view (Dark + Light cards), identical to reference image.
   */
  renderSideBySide(name, options = {}) {
    const progress = options.progress || 0;
    const darkCard = this.renderAnimatedFrame(name, progress, { ...options, theme: 'dark' });
    const lightCard = this.renderAnimatedFrame(name, progress, { ...options, theme: 'light' });

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

    const word = this._buildWordLayers(metrics, scale, '#000000');
    const baselineUnderlineY = word.stemTopY;
    const underlineHeightPx = strokeW;
    const wordMarkup = `
    ${word.frontFallbackExt}
    ${word.backFallbackExt}
    <rect x="${squareXPx.toFixed(3)}" y="${baselineUnderlineY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${underlineHeightPx.toFixed(3)}" />
    <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${word.fInnerClean}</g>
    ${word.middlePaths.join('')}
    <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">${word.bInnerClean}</g>`;

    if (stepNumber === 1) {
      // Step 1: Write the name in Nopitac Helvetica with normal signature underline
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${(totalH * 0.45).toFixed(2)}">
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    ${wordMarkup}
  </g>
</svg>`.trim();
    }

    if (stepNumber === 2) {
      // Step 2: Examine underline length and create square with that side length
      const sqY = originShiftY + baselineUnderlineY + underlineHeightPx + 8;
      return `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${totalW.toFixed(2)} ${totalH.toFixed(2)}">
  <g transform="translate(${originShiftX.toFixed(3)}, ${originShiftY.toFixed(3)})" fill="#000000">
    ${wordMarkup}
  </g>
  <!-- Square side length = underline length -->
  <rect x="${(originShiftX + squareXPx).toFixed(3)}" y="${sqY.toFixed(3)}" width="${squareSizePx.toFixed(3)}" height="${squareSizePx.toFixed(3)}" fill="#111111" />
  <!-- Dimension Callout -->
  <text x="${(originShiftX + squareXPx + squareSizePx / 2).toFixed(3)}" y="${(sqY + squareSizePx / 2).toFixed(3)}" fill="#ffffff" font-family="'Helvetica Neue', sans-serif" font-size="11" text-anchor="middle" dominant-baseline="middle">${squareSizePx.toFixed(1)}px × ${squareSizePx.toFixed(1)}px</text>
</svg>`.trim();
    }

    if (stepNumber === 3) {
      // Step 3: Square as clipping mask for submitted image
      const sqY = originShiftY + baselineUnderlineY + underlineHeightPx + 8;
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
    ${wordMarkup}
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
    ${wordMarkup}
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

