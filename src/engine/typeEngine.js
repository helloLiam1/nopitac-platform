/**
 * NOPITAC Type Engine
 * Calculates signature underline geometry connecting the first letter to the last letter.
 */

import { DEFAULT_ANCHORS, loadCustomAnchors } from './opticalAnchors.js';

export class TypeEngine {
  constructor(options = {}) {
    this.options = {
      fontSize: 96,
      fontWeight: 500,
      letterSpacing: -0.01, // in em
      strokeWeight: null,   // null = auto (~8.3% of fontSize)
      baselineGap: 30,      // gap below baseline when no descenders
      descenderClearance: 22, // gap below descender when descenders present
      autoClearDescenders: true,
      cornerStyle: 'miter', // 'miter' (90° sharp) or 'round'
      cornerRadius: 0,
      scope: 'full',        // 'full' | 'word'
      animationMode: 'ink', // 'ink' (flowing draw) | 'snap'
      animationDuration: 450, // ms
      ...options
    };

    this.anchors = loadCustomAnchors();
  }

  setOption(key, value) {
    this.options[key] = value;
  }

  setOptions(opts) {
    this.options = { ...this.options, ...opts };
  }

  updateAnchor(char, data) {
    this.anchors[char] = { ...(this.anchors[char] || DEFAULT_ANCHORS[char]), ...data };
  }

  getAutoStrokeWeight(fontSize, fontWeight = 500) {
    const weightRatios = {
      300: 0.058, // Light
      400: 0.075, // Regular
      500: 0.088, // Medium (matches reference)
      600: 0.105, // SemiBold
      700: 0.125  // Bold
    };
    const ratio = weightRatios[fontWeight] || 0.088;
    return Math.max(2, Math.round(fontSize * ratio));
  }

  /**
   * Computes underline geometry from an SVG <text> DOM element.
   * Uses SVG text character extent measurement for exact sub-pixel precision.
   */
  computeUnderline(svgTextElement, customText = null) {
    const text = customText !== null ? customText : (svgTextElement?.textContent || '');
    if (!text || !text.trim() || !svgTextElement) {
      return { paths: [], totalLength: 0, bounds: null, segments: [] };
    }

    const {
      fontSize,
      fontWeight,
      baselineGap,
      descenderClearance,
      autoClearDescenders,
      cornerStyle,
      cornerRadius,
      scope
    } = this.options;

    const sw = this.options.strokeWeight || this.getAutoStrokeWeight(fontSize, fontWeight);

    if (scope === 'word') {
      return this._computePerWord(svgTextElement, text, sw);
    } else {
      return this._computeSingleSpan(svgTextElement, text, 0, text.length - 1, sw);
    }
  }

  _computeSingleSpan(svgTextElement, text, spanStartIdx, spanEndIdx, sw) {
    // Find first non-whitespace character in span
    let firstIdx = -1;
    for (let i = spanStartIdx; i <= spanEndIdx; i++) {
      if (text[i] && text[i].trim() !== '') {
        firstIdx = i;
        break;
      }
    }

    // Find last non-whitespace character in span
    let lastIdx = -1;
    for (let i = spanEndIdx; i >= spanStartIdx; i--) {
      if (text[i] && text[i].trim() !== '') {
        lastIdx = i;
        break;
      }
    }

    if (firstIdx === -1 || lastIdx === -1) {
      return { paths: [], totalLength: 0, bounds: null, segments: [] };
    }

    const totalChars = text.length;
    let charBoxes = [];
    try {
      const numChars = svgTextElement.getNumberOfChars();
      for (let i = 0; i < numChars; i++) {
        charBoxes.push(svgTextElement.getExtentOfChar(i));
      }
    } catch (e) {
      // Fallback if SVG text metrics fail in non-rendered state
      console.warn('SVG getExtentOfChar fallback', e);
      return this._fallbackComputation(text, sw);
    }

    if (!charBoxes[firstIdx] || !charBoxes[lastIdx]) {
      return this._fallbackComputation(text, sw);
    }

    const firstChar = text[firstIdx];
    const lastChar = text[lastIdx];

    const firstAnchor = this.anchors[firstChar] || DEFAULT_ANCHORS[firstChar] || { left: 0.1, right: 0.9 };
    const lastAnchor = this.anchors[lastChar] || DEFAULT_ANCHORS[lastChar] || { left: 0.1, right: 0.9 };

    const firstBox = charBoxes[firstIdx];
    const lastBox = charBoxes[lastIdx];

    // Compute startX (left drop line center)
    // The left edge of the letter's stem is firstBox.x + firstBox.width * firstAnchor.left
    const leftEdge = firstBox.x + (firstBox.width * firstAnchor.left);
    const startX = leftEdge + (sw / 2);

    // Compute endX (right rise line center)
    // The right edge of the letter's stem/spur is lastBox.x + lastBox.width * lastAnchor.right
    const rightEdge = lastBox.x + (lastBox.width * lastAnchor.right);
    const endX = Math.max(startX + sw, rightEdge - (sw / 2));

    // Baseline calculation from character boxes
    // For standard uppercase or letters like 'H', 'E', 'x', bottom is baseline
    // Let's sample characters in the span
    const spanBoxes = charBoxes.slice(firstIdx, lastIdx + 1).filter(Boolean);
    const spanText = text.slice(firstIdx, lastIdx + 1);

    // Check descenders in this span
    const hasDescender = /[gjpqyQ]/.test(spanText);
    let maxCharBottom = -Infinity;
    let approxBaseline = -Infinity;

    spanBoxes.forEach((b, idx) => {
      const ch = spanText[idx] || '';
      const bottom = b.y + b.height;
      if (bottom > maxCharBottom) maxCharBottom = bottom;
      // letters without descenders give reliable baseline
      if (/[a-fh-or-tv-xzA-PR-Z0-9]/.test(ch)) {
        if (bottom > approxBaseline) approxBaseline = bottom;
      }
    });

    if (approxBaseline === -Infinity) {
      approxBaseline = maxCharBottom;
    }

    let underlineY;
    if (this.options.autoClearDescenders && hasDescender) {
      // Scale gap proportionally with font size
      const scale = this.options.fontSize / 96;
      underlineY = maxCharBottom + (this.options.descenderClearance * scale) + (sw / 2);
    } else {
      const scale = this.options.fontSize / 96;
      underlineY = approxBaseline + (this.options.baselineGap * scale) + (sw / 2);
    }

    // Determine startY (where left stroke drops from)
    // Connects flush to baseline or bottom of first char
    let startY = approxBaseline;
    if (firstAnchor.hasDescender) {
      startY = firstBox.y + firstBox.height;
    }

    // Determine endY (where right stroke rises into)
    let endY = approxBaseline;
    if (lastAnchor.hasDescender) {
      endY = lastBox.y + lastBox.height;
    }

    // Single letter special handling:
    // If only one letter is typed (e.g. 't'), give a neat signature underline under that single letter!
    if (firstIdx === lastIdx) {
      // Underline extends under the letter's width
    }

    const radius = this.options.cornerStyle === 'round' ? Math.min(this.options.cornerRadius || 8, (endX - startX) / 2, (underlineY - startY) / 2) : 0;

    let pathD = '';
    let totalLength = 0;

    if (radius <= 0) {
      // Crisp 90° miter joins as in the reference image
      pathD = `M ${startX.toFixed(2)} ${startY.toFixed(2)} ` +
              `L ${startX.toFixed(2)} ${underlineY.toFixed(2)} ` +
              `L ${endX.toFixed(2)} ${underlineY.toFixed(2)} ` +
              `L ${endX.toFixed(2)} ${endY.toFixed(2)}`;
      
      const leg1 = Math.abs(underlineY - startY);
      const span = Math.abs(endX - startX);
      const leg2 = Math.abs(underlineY - endY);
      totalLength = leg1 + span + leg2;
    } else {
      // Rounded fillet corners
      const r = radius;
      pathD = `M ${startX.toFixed(2)} ${startY.toFixed(2)} ` +
              `L ${startX.toFixed(2)} ${(underlineY - r).toFixed(2)} ` +
              `Q ${startX.toFixed(2)} ${underlineY.toFixed(2)} ${(startX + r).toFixed(2)} ${underlineY.toFixed(2)} ` +
              `L ${(endX - r).toFixed(2)} ${underlineY.toFixed(2)} ` +
              `Q ${endX.toFixed(2)} ${underlineY.toFixed(2)} ${endX.toFixed(2)} ${(underlineY - r).toFixed(2)} ` +
              `L ${endX.toFixed(2)} ${endY.toFixed(2)}`;
      
      const leg1 = Math.abs(underlineY - startY - r);
      const span = Math.abs(endX - startX - (2 * r));
      const leg2 = Math.abs(underlineY - endY - r);
      totalLength = leg1 + span + leg2 + (Math.PI * r);
    }

    return {
      paths: [{
        d: pathD,
        startX,
        endX,
        startY,
        endY,
        underlineY,
        length: totalLength,
        strokeWidth: sw,
        firstChar,
        lastChar
      }],
      totalLength,
      strokeWidth: sw,
      bounds: {
        minX: startX - (sw / 2),
        maxX: endX + (sw / 2),
        minY: Math.min(startY, endY),
        maxY: underlineY + (sw / 2)
      }
    };
  }

  _computePerWord(svgTextElement, text, sw) {
    const words = [];
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      words.push({
        start: match.index,
        end: match.index + match[0].length - 1,
        word: match[0]
      });
    }

    if (words.length === 0) {
      return { paths: [], totalLength: 0, bounds: null };
    }

    const allPaths = [];
    let combinedLength = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const w of words) {
      const res = this._computeSingleSpan(svgTextElement, text, w.start, w.end, sw);
      if (res.paths.length > 0) {
        allPaths.push(res.paths[0]);
        combinedLength += res.totalLength;
        if (res.bounds) {
          minX = Math.min(minX, res.bounds.minX);
          maxX = Math.max(maxX, res.bounds.maxX);
          minY = Math.min(minY, res.bounds.minY);
          maxY = Math.max(maxY, res.bounds.maxY);
        }
      }
    }

    return {
      paths: allPaths,
      totalLength: combinedLength,
      strokeWidth: sw,
      bounds: { minX, maxX, minY, maxY }
    };
  }

  _fallbackComputation(text, sw) {
    const scale = this.options.fontSize / 96;
    const estCharWidth = this.options.fontSize * 0.55;
    const firstChar = text.trim()[0] || 'a';
    const lastChar = text.trim()[text.trim().length - 1] || 'a';
    const startX = 20;
    const endX = 20 + Math.max(60, text.length * estCharWidth);
    const startY = 100;
    const endY = 100;
    const underlineY = 100 + (this.options.baselineGap * scale);

    const d = `M ${startX} ${startY} L ${startX} ${underlineY} L ${endX} ${underlineY} L ${endX} ${endY}`;
    const len = (underlineY - startY) + (endX - startX) + (underlineY - endY);

    return {
      paths: [{ d, startX, endX, startY, endY, underlineY, length: len, strokeWidth: sw, firstChar, lastChar }],
      totalLength: len,
      strokeWidth: sw,
      bounds: { minX: startX, maxX: endX, minY: startY, maxY: underlineY }
    };
  }
}
