/**
 * NOPITAC SVG & PNG Exporter Suite
 * Allows 1-click vector export for Figma, Illustrator, Glyphs, and Retina PNGs
 */

export class Exporter {
  /**
   * Generates a clean standalone SVG string from the render canvas
   */
  static generateSVGString(svgElement, options = {}) {
    const {
      backgroundColor = 'transparent', // 'transparent' or '#606060'
      padding = 48,
      includeMetadata = true
    } = options;

    const bbox = svgElement.getBBox();
    const viewBoxX = Math.floor(bbox.x - padding);
    const viewBoxY = Math.floor(bbox.y - padding);
    const viewBoxW = Math.ceil(bbox.width + (padding * 2));
    const viewBoxH = Math.ceil(bbox.height + (padding * 2));

    const textEl = svgElement.querySelector('text');
    const pathEls = svgElement.querySelectorAll('.signature-path');

    let pathsMarkup = '';
    pathEls.forEach(p => {
      const d = p.getAttribute('d');
      const sw = p.getAttribute('stroke-width');
      const stroke = p.getAttribute('stroke') || '#151515';
      pathsMarkup += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4" />\n`;
    });

    const fontFamilies = textEl ? textEl.getAttribute('font-family') : 'Inter, Helvetica, sans-serif';
    const fontSize = textEl ? textEl.getAttribute('font-size') : '96';
    const fontWeight = textEl ? textEl.getAttribute('font-weight') : '500';
    const letterSpacing = textEl ? textEl.getAttribute('letter-spacing') : '0';
    const textFill = textEl ? (textEl.getAttribute('fill') || '#151515') : '#151515';
    const textX = textEl ? textEl.getAttribute('x') : '0';
    const textY = textEl ? textEl.getAttribute('y') : '0';
    const textContent = textEl ? textEl.textContent : '';

    const bgRect = backgroundColor !== 'transparent'
      ? `  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxW}" height="${viewBoxH}" fill="${backgroundColor}" />\n`
      : '';

    const metadata = includeMetadata
      ? `  <!-- NOPITAC Typeface System: Signature Underline Asset -->\n  <!-- Generated for: ${textContent} -->\n`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}" width="${viewBoxW}" height="${viewBoxH}">
${metadata}${bgRect}  <text x="${textX}" y="${textY}" font-family="${fontFamilies}" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}" fill="${textFill}">${textContent}</text>
${pathsMarkup}</svg>`;
  }

  /**
   * Downloads an SVG file
   */
  static downloadSVG(svgElement, filename = 'nopitac-signature.svg', options = {}) {
    const svgString = this.generateSVGString(svgElement, options);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Copies SVG markup to clipboard for pasting directly into Figma/Illustrator
   */
  static async copySVGToClipboard(svgElement, options = {}) {
    const svgString = this.generateSVGString(svgElement, options);
    try {
      await navigator.clipboard.writeText(svgString);
      return true;
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
      return false;
    }
  }

  /**
   * Exports high-resolution PNG (scale = 1, 2, or 4 for Retina)
   */
  static async downloadPNG(svgElement, filename = 'nopitac-signature.png', scale = 2, options = {}) {
    const svgString = this.generateSVGString(svgElement, options);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
          resolve(true);
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  }
}
