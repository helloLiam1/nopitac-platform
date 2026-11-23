/**
 * DomainType - Nopitac Helvetica Domain Typographic Engine
 *
 * Typographic Specifications:
 * - Font: Helvetica Neue Regular (400)
 * - Letter spacing (tracking): -25 in Illustrator = -0.025em
 * - Leading (line height): 12px at 16px font size (ratio: 12/16 = 0.75)
 * - Box padding: 2.5px
 * - Inward outline width: 1.0px (when fontSize is 16px, strictly inside colored box)
 * - Canvas background: always white
 *
 * Modes:
 * - 'center': text is centered; outline covers bottom edge and reaches half the length of lowercase 'l' from baseline on both left and right edges.
 * - 'left': text is left-aligned; outline covers bottom edge and full right edge.
 * - 'right': text is right-aligned; outline covers bottom edge and full left edge.
 */

var _DomainTypeInstance;
(function (root, factory) {
  _DomainTypeInstance = factory();
  if (typeof window !== 'undefined') {
    window.DomainType = _DomainTypeInstance;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard typographic ratios for Helvetica Neue relative to fontSize
  var HELVETICA_RATIOS = {
    lAscent: 0.714,       // lowercase 'l' height above baseline (~11.424px at 16px)
    xHeight: 0.517,       // lowercase 'x' / 'o' / 'm' height above baseline (~8.272px at 16px)
    pDescent: 0.207,      // lowercase 'p' descender depth below baseline (~3.312px at 16px)
    lineHeightRatio: 12 / 16, // 12px line height at 16px font size
    letterSpacingEm: -0.025   // -25 tracking in Illustrator
  };

  // Letters that have ascenders in Latin alphabet
  var ASCENDER_REGEX = /[bdfhklA-Z0-9]/;
  // Letters that have descenders
  var DESCENDER_REGEX = /[gjpqy]/;

  var _sharedCanvas = null;
  var _sharedCtx = null;

  function getCanvasContext() {
    if (!_sharedCtx) {
      if (typeof document !== 'undefined' && document.createElement) {
        _sharedCanvas = document.createElement('canvas');
        _sharedCtx = _sharedCanvas.getContext('2d');
      }
    }
    return _sharedCtx;
  }

  /**
   * Measure font metrics for given font size and family
   */
  function measureFontMetrics(fontSize, fontFamily, fontWeight) {
    fontSize = fontSize || 16;
    fontWeight = fontWeight || '400';
    var fontStr = fontWeight + ' ' + fontSize + 'px ' + (fontFamily || '"Helvetica Neue", Helvetica, Arial, sans-serif');
    var ctx = getCanvasContext();

    if (ctx) {
      ctx.font = fontStr;
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '-0.025em';
      }
      var ml = ctx.measureText('l');
      var mx = ctx.measureText('x');
      var mp = ctx.measureText('p');

      var lAscent = ml.actualBoundingBoxAscent || (fontSize * HELVETICA_RATIOS.lAscent);
      var xHeight = mx.actualBoundingBoxAscent || (fontSize * HELVETICA_RATIOS.xHeight);
      var pDescent = mp.actualBoundingBoxDescent || (fontSize * HELVETICA_RATIOS.pDescent);

      return {
        lAscent: lAscent,
        xHeight: xHeight,
        pDescent: pDescent,
        halfLAscent: lAscent * 0.5,
        fontStr: fontStr
      };
    }

    var lAsc = fontSize * HELVETICA_RATIOS.lAscent;
    var xH = fontSize * HELVETICA_RATIOS.xHeight;
    var pD = fontSize * HELVETICA_RATIOS.pDescent;
    return {
      lAscent: lAsc,
      xHeight: xH,
      pDescent: pD,
      halfLAscent: lAsc * 0.5,
      fontStr: fontStr
    };
  }

  /**
   * Measure a line of text with -25 letter spacing (-0.025em)
   */
  function measureLine(text, fontStr, fontSize) {
    var ctx = getCanvasContext();
    var trackingOffset = text.length > 1 ? (text.length - 1) * (fontSize * HELVETICA_RATIOS.letterSpacingEm) : 0;

    if (ctx) {
      ctx.font = fontStr;
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '-0.025em';
        var m = ctx.measureText(text);
        return {
          width: m.width,
          actualLeft: m.actualBoundingBoxLeft !== undefined ? -m.actualBoundingBoxLeft : 0,
          actualRight: m.actualBoundingBoxRight !== undefined ? m.actualBoundingBoxRight : m.width,
          actualAscent: m.actualBoundingBoxAscent !== undefined ? m.actualBoundingBoxAscent : fontSize * 0.714,
          actualDescent: m.actualBoundingBoxDescent !== undefined ? m.actualBoundingBoxDescent : fontSize * 0.2
        };
      } else {
        var m = ctx.measureText(text);
        var trackedWidth = Math.max(0, m.width + trackingOffset);
        return {
          width: trackedWidth,
          actualLeft: 0,
          actualRight: trackedWidth,
          actualAscent: m.actualBoundingBoxAscent || (fontSize * 0.714),
          actualDescent: m.actualBoundingBoxDescent || (fontSize * 0.2)
        };
      }
    }

    var approxWidth = (text.length * fontSize * 0.52) + trackingOffset;
    return {
      width: approxWidth,
      actualLeft: 0,
      actualRight: approxWidth,
      actualAscent: fontSize * 0.714,
      actualDescent: fontSize * 0.2
    };
  }

  /**
   * Check whether a string contains ascenders
   */
  function checkAscender(text) {
    if (ASCENDER_REGEX.test(text)) return true;
    if (text.indexOf('t') !== -1) return true;
    return false;
  }

  /**
   * Check whether a string contains descenders
   */
  function checkDescender(text) {
    return DESCENDER_REGEX.test(text);
  }

  /**
   * Core computation function
   * @param {string} text - The input text, may contain newlines for multi-line words
   * @param {Object} options - Configuration options
   */
  function compute(text, options) {
    options = options || {};
    var cleanText = (text === undefined || text === null) ? 'copywriters' : String(text);
    var lines = cleanText.split('\n');

    var mode = options.mode || 'center'; // 'left' | 'center' | 'right'
    var fontSize = options.fontSize || 16;
    var fontFamily = options.fontFamily || '"Helvetica Neue", Helvetica, Arial, sans-serif';
    var fontWeight = '400'; // always regular
    var padding = 2.5; // fixed 2.5px spec padding
    // 1px inward outline when fontSize is 16px (scalable with font size)
    var outlineWidth = options.outlineWidth !== undefined
      ? options.outlineWidth
      : (fontSize ? (fontSize / 16) * 1.0 : 1.0);
    var letterSpacing = '-0.025em'; // -25 tracking in Illustrator

    // Line height is 12px when fontSize is 16px (scalable with font size)
    var lineSpacing = options.lineHeight !== undefined ? options.lineHeight : (fontSize * HELVETICA_RATIOS.lineHeightRatio);
    var align = options.align || mode;

    var bgColor = options.bgColor || '#e2ff1b';
    var textColor = options.textColor || '#000000';
    var outlineColor = options.outlineColor || '#000000';

    // 1. Measure font properties
    var fontMetrics = measureFontMetrics(fontSize, fontFamily, fontWeight);

    // 2. Measure each line with -25 letter spacing
    var measuredLines = lines.map(function (lineText) {
      var m = measureLine(lineText, fontMetrics.fontStr, fontSize);
      return {
        text: lineText,
        width: m.width,
        actualLeft: m.actualLeft,
        actualRight: m.actualRight,
        actualAscent: m.actualAscent,
        actualDescent: m.actualDescent,
        hasAscender: checkAscender(lineText),
        hasDescender: checkDescender(lineText)
      };
    });

    var maxLineWidth = Math.max.apply(Math, measuredLines.map(function (l) { return l.width; }));
    if (maxLineWidth <= 0) maxLineWidth = 1;

    // 3. Overall ascender / descender presence
    var hasAscenders = measuredLines.some(function (l) { return l.hasAscender; });
    var bottomLine = measuredLines[measuredLines.length - 1];
    var hasDescenders = bottomLine ? bottomLine.hasDescender : false;

    // 4. Calculate Baselines (line spacing = 12px at 16px font size)
    var baselineFirst = 0;
    var baselineLast = (measuredLines.length - 1) * lineSpacing;

    // 5. Vertical Bounding Box calculation
    var boxTop;
    if (hasAscenders) {
      boxTop = baselineFirst - fontMetrics.lAscent - padding;
    } else {
      var topGlyphAscent = Math.max(fontMetrics.xHeight, measuredLines[0].actualAscent);
      boxTop = baselineFirst - topGlyphAscent - padding;
    }

    var boxBottom;
    if (hasDescenders) {
      boxBottom = baselineLast + fontMetrics.pDescent + padding;
    } else {
      boxBottom = baselineLast + padding;
    }

    var boxHeight = boxBottom - boxTop;

    // 6. Horizontal layout of each line based on alignment mode
    measuredLines.forEach(function (l) {
      if (align === 'left') {
        l.x = 0;
      } else if (align === 'right') {
        l.x = maxLineWidth - l.width;
      } else {
        l.x = (maxLineWidth - l.width) / 2;
      }
    });

    var minTextLeft = 0;
    var maxTextRight = maxLineWidth;

    var boxLeft = minTextLeft - padding;
    var boxRight = maxTextRight + padding;
    var boxWidth = boxRight - boxLeft;

    // 7. Calculate 1px Inward Outline coordinates (strictly inside colored box)
    var halfStroke = outlineWidth / 2;
    var inLeft = boxLeft + halfStroke;
    var inRight = boxRight - halfStroke;
    var inTop = boxTop + halfStroke;
    var inBottom = boxBottom - halfStroke;

    var outlinePathD = '';
    var outlineStartY = inBottom;

    if (mode === 'left') {
      // Left mode: bottom edge + entire right edge
      outlinePathD = 'M ' + inRight.toFixed(3) + ' ' + inTop.toFixed(3) + ' L ' + inRight.toFixed(3) + ' ' + inBottom.toFixed(3) + ' L ' + inLeft.toFixed(3) + ' ' + inBottom.toFixed(3);
      outlineStartY = inTop;
    } else if (mode === 'right') {
      // Right mode: bottom edge + entire left edge
      outlinePathD = 'M ' + inLeft.toFixed(3) + ' ' + inTop.toFixed(3) + ' L ' + inLeft.toFixed(3) + ' ' + inBottom.toFixed(3) + ' L ' + inRight.toFixed(3) + ' ' + inBottom.toFixed(3);
      outlineStartY = inTop;
    } else {
      // Center mode: bottom edge + reaches half lowercase 'l' on left and right
      var halfL_Y = baselineFirst - fontMetrics.halfLAscent;
      var reachTop = Math.max(inTop, halfL_Y);
      outlineStartY = reachTop;
      outlinePathD = 'M ' + inLeft.toFixed(3) + ' ' + reachTop.toFixed(3) + ' L ' + inLeft.toFixed(3) + ' ' + inBottom.toFixed(3) + ' L ' + inRight.toFixed(3) + ' ' + inBottom.toFixed(3) + ' L ' + inRight.toFixed(3) + ' ' + reachTop.toFixed(3);
    }

    return {
      text: cleanText,
      lines: measuredLines.map(function (l, idx) {
        return Object.assign({}, l, { baselineY: idx * lineSpacing });
      }),
      mode: mode,
      align: align,
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: fontWeight,
      letterSpacing: letterSpacing,
      lineHeightPx: lineSpacing,
      padding: padding,
      outlineWidth: outlineWidth,
      lineSpacing: lineSpacing,
      bgColor: bgColor,
      textColor: textColor,
      outlineColor: outlineColor,
      hasAscenders: hasAscenders,
      hasDescenders: hasDescenders,
      fontMetrics: fontMetrics,
      box: {
        x: boxLeft,
        y: boxTop,
        width: boxWidth,
        height: boxHeight,
        top: boxTop,
        bottom: boxBottom,
        left: boxLeft,
        right: boxRight
      },
      outline: {
        pathD: outlinePathD,
        mode: mode,
        inLeft: inLeft,
        inRight: inRight,
        inTop: inTop,
        inBottom: inBottom,
        startY: outlineStartY
      }
    };
  }

  /**
   * Generate clean SVG string for embedding or export
   */
  function toSVG(result, options) {
    options = options || {};
    var scale = options.scale || 1;
    var margin = 0; // completely clean, no guides or squares

    var viewBoxX = (result.box.x - margin);
    var viewBoxY = (result.box.y - margin);
    var viewBoxW = (result.box.width + margin * 2);
    var viewBoxH = (result.box.height + margin * 2);

    var widthPx = viewBoxW * scale;
    var heightPx = viewBoxH * scale;

    var clipId = 'domain-clip-' + Math.random().toString(36).slice(2, 9);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBoxX.toFixed(2) + ' ' + viewBoxY.toFixed(2) + ' ' + viewBoxW.toFixed(2) + ' ' + viewBoxH.toFixed(2) + '" width="' + widthPx.toFixed(2) + '" height="' + heightPx.toFixed(2) + '">\n' +
      '  <defs>\n' +
      '    <style>\n' +
      '      .domain-text {\n' +
      '        font-family: ' + result.fontFamily + ';\n' +
      '        font-size: ' + result.fontSize + 'px;\n' +
      '        font-weight: 400;\n' +
      '        letter-spacing: -0.025em;\n' +
      '        fill: ' + result.textColor + ';\n' +
      '        text-rendering: geometricPrecision;\n' +
      '      }\n' +
      '    </style>\n' +
      '    <clipPath id="' + clipId + '">\n' +
      '      <rect x="' + result.box.x.toFixed(3) + '" y="' + result.box.y.toFixed(3) + '" width="' + result.box.width.toFixed(3) + '" height="' + result.box.height.toFixed(3) + '" />\n' +
      '    </clipPath>\n' +
      '  </defs>\n\n' +
      '  <!-- Background Fill Box -->\n' +
      '  <rect class="domain-box" style="fill: ' + result.bgColor + ';" x="' + result.box.x.toFixed(3) + '" y="' + result.box.y.toFixed(3) + '" width="' + result.box.width.toFixed(3) + '" height="' + result.box.height.toFixed(3) + '" />\n\n' +
      '  <!-- Partial Inward Outline (strictly contained inside colored box) -->\n' +
      '  <path class="domain-outline" clip-path="url(#' + clipId + ')" style="fill: none; stroke: ' + result.outlineColor + '; stroke-width: ' + result.outlineWidth + 'px; stroke-linecap: square; stroke-linejoin: miter;" d="' + result.outline.pathD + '" />\n\n' +
      '  <!-- Text Lines -->\n' +
      '  <g class="domain-text">';

    result.lines.forEach(function (line) {
      svg += '\n    <text x="' + line.x.toFixed(3) + '" y="' + line.baselineY.toFixed(3) + '" letter-spacing="-0.025em">' + escapeXml(line.text) + '</text>';
    });

    svg += '\n  </g>\n</svg>';
    return svg;
  }

  function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  var DomainType = {
    compute: compute,
    toSVG: toSVG,
    measureFontMetrics: measureFontMetrics,
    measureLine: measureLine,
    getCanvasContext: getCanvasContext,
    HELVETICA_RATIOS: HELVETICA_RATIOS,
    checkAscender: checkAscender,
    checkDescender: checkDescender
  };

  return DomainType;
});

export default _DomainTypeInstance;
export const compute = _DomainTypeInstance.compute;
export const toSVG = _DomainTypeInstance.toSVG;
export const measureFontMetrics = _DomainTypeInstance.measureFontMetrics;
export const measureLine = _DomainTypeInstance.measureLine;
export const getCanvasContext = _DomainTypeInstance.getCanvasContext;
export const HELVETICA_RATIOS = _DomainTypeInstance.HELVETICA_RATIOS;
export const checkAscender = _DomainTypeInstance.checkAscender;
export const checkDescender = _DomainTypeInstance.checkDescender;
