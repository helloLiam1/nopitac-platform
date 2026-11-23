/**
 * PhotoPanel Component
 * Secondary extension tool panel attached to Add Name panel.
 * 
 * Implements pixel-accurate vector layout directly based on Illustrator SVGs:
 * 1. Top, Left, and Right edge attachments matching outer polylines.
 * 2. Photo frame centered in reference area (121.269 × 134.0408 px).
 *    (Blue reference rectangle is NOT rendered).
 * 3. Exact vector Nopitac name and rails from user Illustrator SVGs.
 * 4. Zoom in (+) and zoom out (-) via buttons only (no wheel zoom).
 *    Clamped strictly so image is never smaller than the stationary square mask (scale >= 1.0).
 * 5. Image panning via mouse drag, strictly clamped so image always completely covers the mask.
 * 6. Light/Dark mode switcher (/) with dark and light indicators.
 * 7. Vector 3-line instructional text ("zoom or drag the / image to your / desired position").
 * 8. "pick another" button to choose another image.
 * 9. "done" button to save photo state and close panel.
 */

import { PhotoFrameEngine } from '../engine/photoFrameEngine.js';
import {
  INSTRUCTION_TOP_PATHS,
  INSTRUCTION_LEFT_PATHS,
  INSTRUCTION_RIGHT_PATHS
} from './photoPanelInstructions.js';
import {
  CHARLIE_FRAME_TOP_PATHS,
  CHARLIE_FRAME_LEFT_PATHS,
  CHARLIE_FRAME_RIGHT_PATHS
} from './charlieFramePaths.js';

export class PhotoPanel {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.edge = options.edge || 'top';
    this.side = options.side || 'right'; // 'right' | 'left' (top) or 'bottom' | 'top' (left/right)
    this.isOpen = false;
    this.onDone = options.onDone || null;

    this.engine = new PhotoFrameEngine();

    // Photo tool state
    this.imageHref = '';
    this.imageNaturalWidth = 200;
    this.imageNaturalHeight = 200;
    this.imageScale = 1.05; // >= 1.0 always
    this.imagePanX = 0; // offset in percent of mask size
    this.imagePanY = 0;
    this.theme = 'dark'; // 'dark' | 'light'
    this.personName = 'charlie maignan';

    // Drag tracking
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.startPanX = 0;
    this.startPanY = 0;

    // Current mask info
    this.currentMask = { x: 0, y: 0, size: 100 };

    this.init();
  }

  init() {
    this.createElement();
    this.bindGlobalEvents();
  }

  createElement() {
    if (!this.widget) {
      this.widget = document.createElement('div');
      this.widget.id = 'photoPanelWidget';
      this.widget.className = 'photo-panel-widget';
      this.container.appendChild(this.widget);
    }
  }

  setEdgeAndSide(edge, side) {
    this.edge = edge;
    if (side) {
      this.side = side;
    }
  }

  /**
   * Update screen positioning attaching to the Add Name widget.
   */
  updatePosition(addPersonRect, viewportWidth, usableHeight) {
    if (!this.widget) return;

    if (this.edge === 'top') {
      const panelW = 150.3847;
      const panelH = 323.812;
      const spaceLeft = addPersonRect.left;
      const spaceRight = viewportWidth - (addPersonRect.left + addPersonRect.width);

      if (spaceLeft >= panelW && spaceLeft >= spaceRight) {
        this.side = 'left';
        this.widget.style.left = `${(addPersonRect.left - panelW + 0.75).toFixed(2)}px`;
      } else {
        this.side = 'right';
        this.widget.style.left = `${(addPersonRect.left + 180.8637).toFixed(2)}px`;
      }
      this.widget.style.top = `${(addPersonRect.top + 370.6942).toFixed(2)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    } else if (this.edge === 'left') {
      const panelW = 302.9202;
      const panelH = 162.3822;
      const spaceTop = addPersonRect.top;
      const spaceBottom = usableHeight - (addPersonRect.top + addPersonRect.height);

      if (spaceTop >= panelH && spaceTop >= spaceBottom) {
        this.side = 'top';
        this.widget.style.top = `${(addPersonRect.top - panelH + 0.75).toFixed(2)}px`;
      } else {
        this.side = 'bottom';
        this.widget.style.top = `${(addPersonRect.top + 156.4972).toFixed(2)}px`;
      }
      this.widget.style.left = `${(addPersonRect.left + 374.5528).toFixed(2)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    } else if (this.edge === 'right') {
      const panelW = 302.9202;
      const panelH = 162.3823;
      const spaceTop = addPersonRect.top;
      const spaceBottom = usableHeight - (addPersonRect.top + addPersonRect.height);

      if (spaceTop >= panelH && spaceTop >= spaceBottom) {
        this.side = 'top';
        this.widget.style.top = `${(addPersonRect.top - panelH + 0.75).toFixed(2)}px`;
      } else {
        this.side = 'bottom';
        this.widget.style.top = `${(addPersonRect.top + 156.4972).toFixed(2)}px`;
      }
      this.widget.style.left = `${(addPersonRect.left + 44.7608).toFixed(2)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    }

    this.widget.setAttribute('data-edge', this.edge);
    this.widget.setAttribute('data-side', this.side);
  }

  /**
   * Open the Photo Panel with an image and optional name.
   */
  open(options = {}) {
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    if (options.imageHref) {
      this.imageHref = options.imageHref;
    }
    if (options.personName) {
      this.personName = options.personName;
    }
    if (options.theme) {
      this.theme = options.theme;
    }
    if (options.imageScale !== undefined) {
      this.imageScale = Math.max(1.0, options.imageScale);
    }
    if (options.imagePanX !== undefined) {
      this.imagePanX = options.imagePanX;
    }
    if (options.imagePanY !== undefined) {
      this.imagePanY = options.imagePanY;
    }
    if (options.onDone) {
      this.onDone = options.onDone;
    }

    this.isOpen = true;
    this.isOpening = true;

    if (options.addPersonRect && options.viewportWidth && options.usableHeight) {
      this.updatePosition(options.addPersonRect, options.viewportWidth, options.usableHeight);
    }

    this.render();
    void this.widget.offsetWidth;
    requestAnimationFrame(() => {
      if (this.widget && this.isOpen) {
        this.widget.classList.remove('is-closing');
        this.widget.classList.add('is-open');
        this.isOpening = false;
      }
    });

    if (this.imageHref) {
      const img = new Image();
      img.onload = () => {
        this.imageNaturalWidth = img.naturalWidth || 200;
        this.imageNaturalHeight = img.naturalHeight || 200;
        if (!this.isOpening) {
          this.updateImageTransform();
        }
      };
      img.src = this.imageHref;
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isOpening = false;
    if (this.widget) {
      this.widget.classList.remove('is-open');
      this.widget.classList.add('is-closing');
      this._closeTimer = setTimeout(() => {
        if (!this.isOpen && this.widget) {
          this.widget.style.display = 'none';
          this.widget.classList.remove('is-closing');
        }
      }, 260);
    }
  }

  render() {
    if (!this.widget) return;
    this.widget.style.display = 'block';
    const isOpenClass = (this.isOpen && !this.isOpening) ? ' is-open' : '';
    this.widget.className = `photo-panel-widget is-edge-${this.edge} is-side-${this.side} is-theme-${this.theme}${isOpenClass}`;

    let svgHtml = '';
    if (this.edge === 'top') {
      svgHtml = this.renderTopSvg();
    } else if (this.edge === 'left') {
      svgHtml = this.renderLeftSvg();
    } else if (this.edge === 'right') {
      svgHtml = this.renderRightSvg();
    }

    this.widget.innerHTML = svgHtml;
    this.bindInnerEvents();
  }

  /* -----------------------------------------------------------------
     TOP EDGE SVG (150.3847 × 323.812 px)
  ----------------------------------------------------------------- */
  renderTopSvg() {
    const isRight = this.side === 'right';
    const borderPoints = isRight
      ? '0 .75 149.6347 .75 149.6347 323.812'
      : '150.3855 .75 .7508 .75 .7508 323.812';

    const isCharlie = !this.personName || this.personName.toLowerCase().trim() === 'charlie maignan';
    let frameDefs = '';
    let frameImageSvg = '';
    let frameTextSvg = '';

    if (isCharlie) {
      const maskX = 17.2703;
      const maskY = 31.0653;
      const maskSize = 117.0978;
      this.currentMask = { x: maskX, y: maskY, size: maskSize };
      const clipId = 'photo-clip-top';
      const imgPlacement = this.engine.calculateImagePlacement(maskX, maskY, maskSize, {
        imageNaturalWidth: this.imageNaturalWidth,
        imageNaturalHeight: this.imageNaturalHeight,
        imageScale: this.imageScale,
        imagePanX: this.imagePanX,
        imagePanY: this.imagePanY
      });
      frameDefs = `
        <clipPath id="${clipId}">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" />
        </clipPath>
      `;
      frameImageSvg = this.imageHref ? `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea" style="cursor: grab;">
          <image id="photoToolImage" href="${this.imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
        </g>
      ` : `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" fill="#222222" />
        </g>
      `;
      const textColor = this.theme === 'dark' ? '#ffffff' : '#000000';
      frameTextSvg = `
        <g class="nopitac-charlie-frame" fill="${textColor}" pointer-events="none">
          ${CHARLIE_FRAME_TOP_PATHS}
        </g>
      `;
    } else {
      const frame = this.engine.renderFrameGroup(
        this.personName,
        14.0507,
        14.802,
        121.269,
        134.0408,
        {
          theme: this.theme,
          imageHref: this.imageHref,
          imageNaturalWidth: this.imageNaturalWidth,
          imageNaturalHeight: this.imageNaturalHeight,
          imageScale: this.imageScale,
          imagePanX: this.imagePanX,
          imagePanY: this.imagePanY
        }
      );
      if (frame) {
        this.currentMask = frame.mask;
        frameDefs = frame.defs;
        frameImageSvg = frame.imageSvg;
        frameTextSvg = frame.textSvg;
      }
    }

    const stageBg = this.theme === 'dark'
      ? `
      <rect class="photo-stage-bg" x=".4998" y="1.2497" width="148.6348" height="160.6836" style="fill: #333333;" />
      <path class="photo-stage-border" d="M148.6348,1.7499v159.6831H1V1.7499h147.6348ZM149.6348.7499H0v161.6831h149.6348V.7499h0Z" fill="#000000" />`
      : `
      <rect class="photo-stage-bg" x=".75" y=".75" width="149.1363" height="161.6831" style="fill: #ffffff; stroke: #000000; stroke-width: 1.5px; stroke-miterlimit: 10;" />`;

    return `
      <svg class="photo-panel-svg" viewBox="0 0 150.3847 323.812" width="150.3847" height="323.812" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${frameDefs}
        </defs>

        <!-- White Panel Base -->
        <rect class="photo-panel-base" x="0" y="0" width="150.3847" height="323.812" fill="#ffffff" />

        <!-- Stage Box (Dark / Light) -->
        <g id="photoStageBoxGroup" class="photo-panel-layer photo-layer-stage">
          ${stageBg}
        </g>

        <!-- Photo Frame (Masked Image + Name + Rails) -->
        <g class="photo-panel-layer photo-layer-frame" id="photoFrameGroup">
          ${frameImageSvg}
          ${frameTextSvg}
          <rect id="photoStageHitArea" x="14.05" y="14.80" width="121.27" height="134.04" fill="transparent" style="cursor: grab;" />
        </g>

        <!-- Controls Row (+, -, /) -->
        <g class="photo-panel-layer photo-layer-controls" id="photoControlsGroup">
          <g id="photoBtnZoomIn" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="14.04" y="175" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="49.9112 185.2493 49.9112 196.0097 14.0411 196.0097 14.0411 185.2493" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(27.1756 190.9893)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">+</text>
          </g>

          <g id="photoBtnZoomOut" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="56.75" y="175" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="92.6216 185.2493 92.6216 196.0097 56.7514 196.0097 56.7514 185.2493" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(71.5743 190.9893)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">-</text>
          </g>

          <g id="photoBtnToggleTheme" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="99.46" y="175" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="135.332 185.2493 135.332 196.0097 99.4618 196.0097 99.4618 185.2493" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <rect x="103.7537" y="180.9384" width="8.6218" height="8.6218" fill="#000000" />
            ${this.theme === 'dark' ? '<rect x="106.56" y="183.74" width="3" height="3" fill="#ffffff" />' : ''}
            <text transform="translate(114.7327 190.9893)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">/</text>
            <rect x="122.7632" y="180.9384" width="8.6218" height="8.6218" fill="#ffffff" stroke="#000000" stroke-width="0.5px" stroke-miterlimit="10" />
            ${this.theme === 'light' ? '<rect x="125.57" y="183.74" width="3" height="3" fill="#000000" />' : ''}
          </g>
        </g>

        <!-- 3-Line Instructional Text -->
        <g class="photo-panel-layer photo-layer-instructions photo-instruction-text">
          ${INSTRUCTION_TOP_PATHS}
        </g>

        <!-- pick another Button -->
        <g id="photoBtnPickAnother" class="photo-panel-layer photo-layer-pick photo-svg-btn" style="cursor: pointer;">
          <rect x="14.05" y="255" width="121.27" height="25" class="hit-area" fill="transparent" />
          <polyline points="135.321 263.3436 135.321 274.0946 14.052 274.0946 14.052 263.3446" fill="none" stroke="#000000" stroke-miterlimit="10" />
          <text transform="translate(32.4312 269.0748)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">pick another</text>
        </g>

        <!-- done Button -->
        <g id="photoBtnDone" class="photo-panel-layer photo-layer-done photo-svg-btn" style="cursor: pointer;">
          <rect x="14.05" y="285" width="121.27" height="30" class="hit-area" fill="transparent" />
          <polyline points="14.052 288.837 14.052 309.7598 135.321 309.76 135.321 309.5784 135.321 288.8372" fill="none" stroke="#000000" stroke-miterlimit="10" />
          <text transform="translate(56.1749 303.8951)" fill="#000000" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="700">done</text>
        </g>

        <!-- Outer Border Polyline (attaches to Add Name button) -->
        <polyline points="${borderPoints}" fill="none" stroke="#000000" stroke-width="1.5px" stroke-miterlimit="10" class="photo-outer-border" />
      </svg>
    `.trim();
  }

  /* -----------------------------------------------------------------
     LEFT EDGE SVG (302.9202 × 162.3822 px)
  ----------------------------------------------------------------- */
  renderLeftSvg() {
    const isTop = this.side === 'top';
    const borderPoints = isTop
      ? '.75 162.3315 .75 .75 302.9202 .75'
      : '.75 .7507 .75 162.3323 302.9202 162.3323';

    const isCharlie = !this.personName || this.personName.toLowerCase().trim() === 'charlie maignan';
    let frameDefs = '';
    let frameImageSvg = '';
    let frameTextSvg = '';

    if (isCharlie) {
      const maskX = 24.9595;
      const maskY = 32.8583;
      const maskSize = 110.0448;
      this.currentMask = { x: maskX, y: maskY, size: maskSize };
      const clipId = 'photo-clip-left';
      const imgPlacement = this.engine.calculateImagePlacement(maskX, maskY, maskSize, {
        imageNaturalWidth: this.imageNaturalWidth,
        imageNaturalHeight: this.imageNaturalHeight,
        imageScale: this.imageScale,
        imagePanX: this.imagePanX,
        imagePanY: this.imagePanY
      });
      frameDefs = `
        <clipPath id="${clipId}">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" />
        </clipPath>
      `;
      frameImageSvg = this.imageHref ? `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea" style="cursor: grab;">
          <image id="photoToolImage" href="${this.imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
        </g>
      ` : `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" fill="#222222" />
        </g>
      `;
      const textColor = this.theme === 'dark' ? '#ffffff' : '#000000';
      frameTextSvg = `
        <g class="nopitac-charlie-frame" fill="${textColor}" pointer-events="none">
          ${CHARLIE_FRAME_LEFT_PATHS}
        </g>
      `;
    } else {
      const frame = this.engine.renderFrameGroup(
        this.personName,
        14.9328,
        14.5204,
        121.269,
        134.0408,
        {
          theme: this.theme,
          imageHref: this.imageHref,
          imageNaturalWidth: this.imageNaturalWidth,
          imageNaturalHeight: this.imageNaturalHeight,
          imageScale: this.imageScale,
          imagePanX: this.imagePanX,
          imagePanY: this.imagePanY
        }
      );
      if (frame) {
        this.currentMask = frame.mask;
        frameDefs = frame.defs;
        frameImageSvg = frame.imageSvg;
        frameTextSvg = frame.textSvg;
      }
    }

    const stageBg = this.theme === 'dark'
      ? `
      <rect class="photo-stage-bg" x="1.2496" y="1.1995" width="148.6348" height="160.6826" style="fill: #333333;" />
      <path class="photo-stage-border" d="M149.3847,1.699v159.6831H1.75V1.699h147.6348ZM150.3847.699H.75v161.6831h149.6348V.699h0Z" fill="#000000" />`
      : `
      <rect class="photo-stage-bg" x=".75" y=".75" width="150.614" height="161.583" style="fill: #ffffff; stroke: #000000; stroke-width: 1.5px; stroke-miterlimit: 10;" />`;

    return `
      <svg class="photo-panel-svg" viewBox="0 0 302.9202 162.3822" width="302.9202" height="162.3822" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${frameDefs}
        </defs>

        <!-- White Panel Base -->
        <rect class="photo-panel-base" x="0" y="0" width="302.9202" height="162.3822" fill="#ffffff" />

        <!-- Stage Box (Left Column) -->
        <g id="photoStageBoxGroup" class="photo-panel-layer photo-layer-stage">
          ${stageBg}
        </g>

        <!-- Photo Frame -->
        <g class="photo-panel-layer photo-layer-frame" id="photoFrameGroup">
          ${frameImageSvg}
          ${frameTextSvg}
          <rect id="photoStageHitArea" x="14.93" y="14.52" width="121.27" height="134.04" fill="transparent" style="cursor: grab;" />
        </g>

        <!-- Controls Row (+, -, /) -->
        <g class="photo-panel-layer photo-layer-controls" id="photoControlsGroup">
          <g id="photoBtnZoomIn" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="166.89" y="10" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="202.7612 14.8012 202.7612 33.5332 166.891 33.5332" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(166.8907 28.5135)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">+</text>
          </g>

          <g id="photoBtnZoomOut" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="209.11" y="10" width="36.36" height="25" class="hit-area" fill="transparent" />
            <polyline points="245.4716 14.8012 245.4716 33.5332 209.1066 33.5321" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(209.1063 28.5135)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">-</text>
          </g>

          <g id="photoBtnToggleTheme" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="252.31" y="10" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="288.1819 14.8012 288.1819 33.5332 252.3118 33.5332" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <rect x="252.3097" y="18.4619" width="8.6218" height="8.6218" fill="#000000" />
            ${this.theme === 'dark' ? '<rect x="255.12" y="21.27" width="3" height="3" fill="#ffffff" />' : ''}
            <text transform="translate(263.2899 28.5135)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">/</text>
            <rect x="271.3192" y="18.4619" width="8.6218" height="8.6218" fill="#ffffff" stroke="#000000" stroke-width="0.5px" stroke-miterlimit="10" />
            ${this.theme === 'light' ? '<rect x="274.13" y="21.27" width="3" height="3" fill="#000000" />' : ''}
          </g>
        </g>

        <!-- 3-Line Instructional Text -->
        <g class="photo-panel-layer photo-layer-instructions photo-instruction-text">
          ${INSTRUCTION_LEFT_PATHS}
        </g>

        <!-- pick another Button -->
        <g id="photoBtnPickAnother" class="photo-panel-layer photo-layer-pick photo-svg-btn" style="cursor: pointer;">
          <rect x="166.90" y="85" width="121.27" height="30" class="hit-area" fill="transparent" />
          <polyline points="288.171 93.8837 288.171 112.6156 166.902 112.6156" fill="none" stroke="#000000" stroke-miterlimit="10" />
          <text transform="translate(166.9015 107.5955)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">pick another</text>
        </g>

        <!-- done Button -->
        <g id="photoBtnDone" class="photo-panel-layer photo-layer-done photo-svg-btn" style="cursor: pointer;">
          <rect x="166.90" y="120" width="121.27" height="32" class="hit-area" fill="transparent" />
          <polyline points="166.902 127.3581 166.902 148.2809 288.171 148.281 288.171 148.0995 288.171 127.3582" fill="none" stroke="#000000" stroke-miterlimit="10" />
          <text transform="translate(209.025 142.4163)" fill="#000000" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="700">done</text>
        </g>

        <!-- Outer Border Polyline -->
        <polyline points="${borderPoints}" fill="none" stroke="#000000" stroke-width="1.5px" stroke-miterlimit="10" class="photo-outer-border" />
      </svg>
    `.trim();
  }

  /* -----------------------------------------------------------------
     RIGHT EDGE SVG (302.9202 × 162.3823 px)
  ----------------------------------------------------------------- */
  renderRightSvg() {
    const isTop = this.side === 'top';
    const borderPoints = isTop
      ? '302.1702 162.3315 302.1702 .75 0 .75'
      : '302.1702 .5007 302.1702 162.0823 0 162.0823';

    const isDefaultRight = !this.personName || this.personName.toLowerCase().trim() === 'charlie maignan';
    let frameDefs = '';
    let frameImageSvg = '';
    let frameTextSvg = '';

    if (isDefaultRight) {
      const maskX = 166.8887;
      const maskY = 26.4582;
      const maskSize = 119.1336;
      this.currentMask = { x: maskX, y: maskY, size: maskSize };
      const clipId = 'photo-clip-right';
      const imgPlacement = this.engine.calculateImagePlacement(maskX, maskY, maskSize, {
        imageNaturalWidth: this.imageNaturalWidth,
        imageNaturalHeight: this.imageNaturalHeight,
        imageScale: this.imageScale,
        imagePanX: this.imagePanX,
        imagePanY: this.imagePanY
      });
      frameDefs = `
        <clipPath id="${clipId}">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" />
        </clipPath>
      `;
      frameImageSvg = this.imageHref ? `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea" style="cursor: grab;">
          <image id="photoToolImage" href="${this.imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" />
        </g>
      ` : `
        <g clip-path="url(#${clipId})" id="photoStageClippedArea">
          <rect x="${maskX}" y="${maskY}" width="${maskSize}" height="${maskSize}" fill="#222222" />
        </g>
      `;
      const textColor = this.theme === 'dark' ? '#ffffff' : '#000000';
      frameTextSvg = `
        <g class="nopitac-charlie-frame" fill="${textColor}" pointer-events="none">
          ${CHARLIE_FRAME_RIGHT_PATHS}
        </g>
      `;
    } else {
      const frame = this.engine.renderFrameGroup(
        this.personName,
        165.7576,
        14.5204,
        121.269,
        134.0408,
        {
          theme: this.theme,
          imageHref: this.imageHref,
          imageNaturalWidth: this.imageNaturalWidth,
          imageNaturalHeight: this.imageNaturalHeight,
          imageScale: this.imageScale,
          imagePanX: this.imagePanX,
          imagePanY: this.imagePanY
        }
      );
      if (frame) {
        this.currentMask = frame.mask;
        frameDefs = frame.defs;
        frameImageSvg = frame.imageSvg;
        frameTextSvg = frame.textSvg;
      }
    }

    const stageBg = this.theme === 'dark'
      ? `
      <rect class="photo-stage-bg" x="153.3808" y="1.199" width="148.6348" height="160.6836" style="fill: #333333;" />
      <path class="photo-stage-border" d="M301.5154,1.6992v159.6831h-147.6345V1.6992h147.6345ZM302.5154.6992h-149.6345v161.6831h149.6345V.6992h0Z" fill="#000000" />`
      : `
      <rect class="photo-stage-bg" x="151.0851" y=".5" width="150.614" height="161.583" style="fill: #ffffff; stroke: #000000; stroke-width: 1.5px; stroke-miterlimit: 10;" />`;

    return `
      <svg class="photo-panel-svg" viewBox="0 0 302.9202 162.3823" width="302.9202" height="162.3823" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${frameDefs}
        </defs>

        <!-- White Panel Base -->
        <rect class="photo-panel-base" x="0" y="0" width="302.9202" height="162.3823" fill="#ffffff" />

        <!-- Controls Row on Left Column (/ , - , +) -->
        <g class="photo-panel-layer photo-layer-controls" id="photoControlsGroup">
          <g id="photoBtnToggleTheme" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="15.06" y="10" width="36.36" height="25" class="hit-area" fill="transparent" />
            <polyline points="15.056 14.8009 15.056 33.5328 51.4209 33.5317" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <rect x="23.4326" y="18.4619" width="8.6218" height="8.6218" fill="#000000" />
            ${this.theme === 'dark' ? '<rect x="26.24" y="21.27" width="3" height="3" fill="#ffffff" />' : ''}
            <text transform="translate(34.4134 28.513)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">/</text>
            <rect x="42.4421" y="18.4619" width="8.6218" height="8.6218" fill="#ffffff" stroke="#000000" stroke-width="0.5px" stroke-miterlimit="10" />
            ${this.theme === 'light' ? '<rect x="45.25" y="21.27" width="3" height="3" fill="#000000" />' : ''}
          </g>

          <g id="photoBtnZoomOut" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="57.77" y="10" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="57.7663 14.8009 57.7663 33.5328 93.6365 33.5328" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(87.4126 28.513)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">-</text>
          </g>

          <g id="photoBtnZoomIn" class="photo-svg-btn" style="cursor: pointer;">
            <rect x="100.48" y="10" width="35.87" height="25" class="hit-area" fill="transparent" />
            <polyline points="100.4767 14.8009 100.4767 33.5328 136.3469 33.5328" fill="none" stroke="#000000" stroke-miterlimit="10" />
            <text transform="translate(126.7469 28.513)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="500">+</text>
          </g>
        </g>

        <!-- 3-Line Instructional Text -->
        <g class="photo-panel-layer photo-layer-instructions photo-instruction-text">
          ${INSTRUCTION_RIGHT_PATHS}
        </g>

        <!-- pick another Button -->
        <g id="photoBtnPickAnother" class="photo-panel-layer photo-layer-pick photo-svg-btn" style="cursor: pointer;">
          <rect x="15.07" y="85" width="121.27" height="30" class="hit-area" fill="transparent" />
          <polyline points="15.0669 93.8833 15.0669 112.6153 136.3359 112.6153" fill="none" stroke="#000000" stroke-miterlimit="10" />
          <text transform="translate(51.8241 107.595)" fill="#333333" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px">pick another</text>
        </g>

        <!-- done Button -->
        <g id="photoBtnDone" class="photo-panel-layer photo-layer-done photo-svg-btn" style="cursor: pointer;">
          <rect x="15.07" y="120" width="121.27" height="32" class="hit-area" fill="transparent" />
          <polyline points="15.0669 127.3577 15.0669 148.2805 136.3359 148.2807 136.3359 148.0991 136.3359 127.3578" fill="none" stroke="#000000" stroke-width="1.5px" stroke-miterlimit="10" />
          <text transform="translate(57.1898 142.4158)" fill="#000000" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="16px" font-weight="700">done</text>
        </g>

        <!-- Stage Box (Right Column) -->
        <g id="photoStageBoxGroup" class="photo-panel-layer photo-layer-stage">
          ${stageBg}
        </g>

        <!-- Photo Frame -->
        <g class="photo-panel-layer photo-layer-frame" id="photoFrameGroup">
          ${frameImageSvg}
          ${frameTextSvg}
          <rect id="photoStageHitArea" x="165.76" y="14.52" width="121.27" height="134.04" fill="transparent" style="cursor: grab;" />
        </g>

        <!-- Outer Border Polyline -->
        <polyline points="${borderPoints}" fill="none" stroke="#000000" stroke-width="1.5px" stroke-miterlimit="10" class="photo-outer-border" />
      </svg>
    `.trim();
  }

  /* -----------------------------------------------------------------
     EVENT BINDINGS & DRAG / ZOOM / THEME LOGIC
  ----------------------------------------------------------------- */
  bindGlobalEvents() {
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
  }

  bindInnerEvents() {
    if (!this.widget) return;

    this.widget.onwheel = (e) => e.preventDefault();

    const hitArea = this.widget.querySelector('#photoStageHitArea');
    if (hitArea) {
      hitArea.onmousedown = (e) => this.onMouseDown(e);
    }

    const btnZoomIn = this.widget.querySelector('#photoBtnZoomIn');
    if (btnZoomIn) {
      btnZoomIn.onclick = (e) => {
        e.stopPropagation();
        this.zoomIn();
      };
    }

    const btnZoomOut = this.widget.querySelector('#photoBtnZoomOut');
    if (btnZoomOut) {
      btnZoomOut.onclick = (e) => {
        e.stopPropagation();
        this.zoomOut();
      };
    }

    const btnToggleTheme = this.widget.querySelector('#photoBtnToggleTheme');
    if (btnToggleTheme) {
      btnToggleTheme.onclick = (e) => {
        e.stopPropagation();
        this.toggleTheme();
      };
    }

    const btnPickAnother = this.widget.querySelector('#photoBtnPickAnother');
    if (btnPickAnother) {
      btnPickAnother.onclick = (e) => {
        e.stopPropagation();
        this.pickAnother();
      };
    }

    const btnDone = this.widget.querySelector('#photoBtnDone');
    if (btnDone) {
      btnDone.onclick = (e) => {
        e.stopPropagation();
        this.handleDone();
      };
    }
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.startPanX = this.imagePanX;
    this.startPanY = this.imagePanY;
    document.body.style.cursor = 'grabbing';
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    const maskSize = this.currentMask.size || 100;
    this.imagePanX = this.startPanX + (dx / maskSize) * 100;
    this.imagePanY = this.startPanY + (dy / maskSize) * 100;
    this.updateImageTransform();
  }

  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      document.body.style.cursor = '';
    }
  }

  zoomIn() {
    this.imageScale = Math.min(3.5, this.imageScale + 0.15);
    this.updateImageTransform();
  }

  zoomOut() {
    this.imageScale = Math.max(1.0, this.imageScale - 0.15);
    this.updateImageTransform();
  }

  updateImageTransform() {
    const imgEl = this.widget ? this.widget.querySelector('#photoToolImage') : null;
    if (!imgEl) return;

    const placement = this.engine.calculateImagePlacement(
      this.currentMask.x,
      this.currentMask.y,
      this.currentMask.size,
      {
        imageNaturalWidth: this.imageNaturalWidth,
        imageNaturalHeight: this.imageNaturalHeight,
        imageScale: this.imageScale,
        imagePanX: this.imagePanX,
        imagePanY: this.imagePanY
      }
    );

    imgEl.setAttribute('x', placement.x.toFixed(3));
    imgEl.setAttribute('y', placement.y.toFixed(3));
    imgEl.setAttribute('width', placement.width.toFixed(3));
    imgEl.setAttribute('height', placement.height.toFixed(3));
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.render();
  }

  pickAnother() {
    let input = this.widget.querySelector('#photoPanelHiddenInput');
    if (!input) {
      input = document.createElement('input');
      input.id = 'photoPanelHiddenInput';
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      this.widget.appendChild(input);
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            this.imageHref = re.target.result;
            this.imageScale = 1.05;
            this.imagePanX = 0;
            this.imagePanY = 0;
            const img = new Image();
            img.onload = () => {
              this.imageNaturalWidth = img.naturalWidth || 200;
              this.imageNaturalHeight = img.naturalHeight || 200;
              this.render();
            };
            img.src = this.imageHref;
          };
          reader.readAsDataURL(file);
        }
      };
    }
    input.click();
  }

  handleDone() {
    if (typeof this.onDone === 'function') {
      this.onDone({
        imageHref: this.imageHref,
        theme: this.theme,
        imageScale: this.imageScale,
        imagePanX: this.imagePanX,
        imagePanY: this.imagePanY,
        imageNaturalWidth: this.imageNaturalWidth,
        imageNaturalHeight: this.imageNaturalHeight
      });
    }
    this.close();
  }
}
