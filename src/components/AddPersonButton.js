/**
 * AddPersonButton Component
 * Supports dynamic rendering and animation across all 3 edges (Top, Left, Right).
 * Matches Illustrator SVGs and After Effects animation curves:
 *  - Top:   146.12 × 29.95 px (closed) -> 181.66 × 500.66 px (expanded)
 *  - Left:  29.95 × 146.12 px (closed) -> 575.99 × 157.25 px (expanded)
 *  - Right: 29.95 × 146.12 px (closed) -> 579.87 × 157.25 px (expanded)
 * 
 * 2-Stage Choreographed Expansion:
 *  - Stage 1: Cross-dimension expansion (145ms, cubic-bezier(0.3, 0, 0.2, 1))
 *  - Stage 2: Main unroll expansion (272ms, cubic-bezier(0.12, 1, 0.25, 1))
 *  - Stage 3: Cascaded 8-layer form slide-in starting at frame 10 (417ms) with 1-frame stagger (41.7ms)
 */

import { DomainPanel } from './DomainPanel.js';
import { PhotoPanel } from './PhotoPanel.js';

/**
 * Precise Cubic Bezier solver using binary search (zero dependencies, zero allocation).
 */
function solveCubicBezier(p1x, p1y, p2x, p2y, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0, high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) * 0.5;
    const cx = 3 * (1 - mid) * (1 - mid) * mid * p1x + 3 * (1 - mid) * mid * mid * p2x + mid * mid * mid;
    if (cx < x) low = mid;
    else high = mid;
  }
  const t = (low + high) * 0.5;
  return 3 * (1 - t) * (1 - t) * t * p1y + 3 * (1 - t) * t * t * p2y + t * t * t;
}

export class AddPersonButton {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.edge = options.edge || 'top'; // 'top' | 'left' | 'right'
    this.isExpanded = false;
    this.isAnimating = false;
    this.emptyMode = Boolean(options.emptyMode);
    this.onDone = options.onDone || null;
    this.onAddDomain = options.onAddDomain || null;
    this.onUpdateDomain = options.onUpdateDomain || null;
    this.editingPersonId = null;
    this.isEditMode = false;

    // Shared form data state across edges
    this.formData = {
      fullName: '',
      domain: '',
      year: '',
      whyCool: '',
      place: '',
      links: '',
      photos: [null],
      photo: null
    };

    // Initialize DomainPanel extension
    this.domainPanel = new DomainPanel({
      container: this.container,
      edge: this.edge,
      emptyMode: this.emptyMode,
      onSelect: (domain, color) => {
        this.formData.domain = domain;
        this.formData.domainColor = color || null;
        if (this.inputDomain) {
          this.inputDomain.value = domain;
        }
        if (this.labelDomain) {
          this.labelDomain.style.opacity = '0';
        }
      },
      onAddDomain: (newDomain) => {
        if (typeof this.onAddDomain === 'function') {
          this.onAddDomain(newDomain);
        }
      },
      onUpdateDomain: (updatedDomain) => {
        if (typeof this.onUpdateDomain === 'function') {
          this.onUpdateDomain(updatedDomain);
        }
      }
    });

    // Initialize PhotoPanel extension
    this.photoPanel = new PhotoPanel({
      container: this.container,
      edge: this.edge,
      onDone: (photoData) => {
        this.formData.photo = photoData;
        this.formData.photos = [photoData.imageHref];
        if (this.photoPreview1) {
          this.photoPreview1.src = photoData.imageHref;
          this.photoPreview1.style.display = 'block';
        }
        if (this.plusIcon1) {
          this.plusIcon1.style.opacity = '0';
        }
      }
    });

    this.init();
  }

  init() {
    this.render();
    this.cacheElements();
    this.bindEvents();
    this.updateBorderPoints();
  }

  setEdge(edge) {
    if (this.edge === edge) return;
    const wasExpanded = this.isExpanded;
    if (wasExpanded) {
      this.close(true); // immediate close if changing edge while expanded
    }
    this.edge = edge;
    if (this.domainPanel) {
      this.domainPanel.setEdgeAndSide(edge);
      if (this.domainPanel.isOpen) {
        this.domainPanel.close();
      }
    }
    if (this.photoPanel) {
      this.photoPanel.setEdgeAndSide(edge);
      if (this.photoPanel.isOpen) {
        this.photoPanel.close();
      }
    }

    // Suppress any CSS transitions during edge corner switch so it never morphs or jumps
    if (this.widget) {
      this.widget.classList.add('no-transition');

      // Update positioning attributes immediately for the target edge
      if (edge === 'right') {
        this.widget.style.left = 'auto';
        this.widget.style.right = '0px';
      } else if (edge === 'left') {
        this.widget.style.left = '0px';
        this.widget.style.right = 'auto';
      } else if (edge === 'top') {
        this.widget.style.top = '0px';
        this.widget.style.right = 'auto';
      }
    }

    this.render();
    this.cacheElements();
    this.bindEvents();
    this.syncAllInputs();
    this.updateBorderPoints();

    // Force layout flush so new edge dimensions and vectors apply instantaneously
    if (this.widget) {
      void this.widget.offsetWidth;
      requestAnimationFrame(() => {
        if (this.widget) this.widget.classList.remove('no-transition');
      });
    }
  }

  render() {
    if (!this.widget) {
      this.widget = document.createElement('div');
      this.widget.id = 'addPersonWidget';
      this.container.appendChild(this.widget);
    }

    const hasNoTransition = this.widget.classList.contains('no-transition');
    this.widget.className = `add-person-widget is-edge-${this.edge}${this.isExpanded ? ' is-expanded' : ''}${hasNoTransition ? ' no-transition' : ''}`;
    this.widget.setAttribute('aria-expanded', this.isExpanded ? 'true' : 'false');
    this.widget.setAttribute('data-edge', this.edge);

    if (this.edge === 'top') {
      this.renderTopEdge();
    } else if (this.edge === 'left') {
      this.renderLeftEdge();
    } else if (this.edge === 'right') {
      this.renderRightEdge();
    }
  }

  /* -------------------------------------------------------------
     TOP EDGE TEMPLATE (181.66 × 500.66 px)
  ------------------------------------------------------------- */
  renderTopEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="add-person-outer-svg" id="addPersonOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="addPersonBorderLine" 
          class="add-person-border-line" 
          points="145.3723 10.5705 145.3723 28.0268 .75 28.0268 .75 0" 
        />
        <text 
          id="addPersonSvgText" 
          transform="translate(7.1814 20.001)" 
          style="font-family: 'Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 21px; font-weight: 700; fill: #000000; pointer-events: none; user-select: none;"
        >
          <tspan x="0" y="0">add name</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar -->
      <div class="add-person-header" id="addPersonHeader" title="Click to add name" aria-label="Add name"></div>

      <!-- Expandable Form Content -->
      <div class="add-person-content" id="addPersonContent">
        <svg class="add-person-inner-svg" viewBox="0 0 181.6649 491.3488" xmlns="http://www.w3.org/2000/svg">
          <!-- 1. Full Name -->
          <g class="add-person-layer layer-stagger-1">
            <polyline points="166.5859 50.1504 166.5859 60.9014 15.0791 60.9003 15.0791 50.1504" class="inner-bracket"/>
            <text id="labelFullName" transform="translate(54.4399 55.8813)" class="svg-field-label is-bold"><tspan x="0" y="0">full name* </tspan></text>
          </g>

          <!-- 2. Domain -->
          <g class="add-person-layer layer-stagger-2">
            <polyline points="166.5859 83.5031 166.5859 94.2541 15.0791 94.253 15.0791 83.5031" class="inner-bracket"/>
            <text id="labelDomain" transform="translate(60.3511 89.2338)" class="svg-field-label is-bold"><tspan x="0" y="0">domain*</tspan></text>
          </g>

          <!-- 3. Year of Birth -->
          <g class="add-person-layer layer-stagger-3">
            <polyline points="166.5859 116.8558 166.5859 127.6068 15.0791 127.6057 15.0791 116.8558" class="inner-bracket"/>
            <text id="labelYear" transform="translate(50.4155 122.5864)" class="svg-field-label is-regular"><tspan x="0" y="0">year of birth</tspan></text>
          </g>

          <!-- 4. Why do you think they are cool? -->
          <g class="add-person-layer layer-stagger-4">
            <polyline points="166.5859 150.2207 166.5859 266.9081 15.0791 266.907 15.0791 150.2207" class="inner-bracket"/>
            <line x1="15.2034" y1="174.5831" x2="166.4615" y2="174.5831" class="inner-divider-thin"/>
            <polyline points="27.2316 176.2911 27.2316 180.7206 15.0791 180.7206" class="inner-divider-thin"/>
            <text id="labelWhyCool" transform="translate(29.1704 155.9394)" class="svg-field-label is-bold">
              <tspan x="0" y="0">why do you think</tspan>
              <tspan x="5.3359" y="14">they are cool ?*</tspan>
            </text>
          </g>

          <!-- 5. Place of Birth -->
          <g class="add-person-layer layer-stagger-5">
            <polyline points="166.5859 289.5098 166.5859 300.2608 15.0791 300.2597 15.0791 289.5098" class="inner-bracket"/>
            <text id="labelPlace" transform="translate(46.4634 295.2402)" class="svg-field-label is-regular"><tspan x="0" y="0">place of birth</tspan></text>
          </g>

          <!-- 6. Links -->
          <g class="add-person-layer layer-stagger-6">
            <polyline points="166.5859 322.8981 166.5859 356.1913 15.0791 356.1902 15.0791 322.8981" class="inner-bracket"/>
            <line x1="15.3244" y1="329.9938" x2="166.5824" y2="329.9938" class="inner-divider-thin"/>
            <polyline points="164.7921 340.2673 160.3626 340.2673 160.3626 329.9938" class="inner-divider-thin"/>
            <text id="labelLinks" transform="translate(75.477 328.5932)" class="svg-field-label is-regular"><tspan x="0" y="0">links</tspan></text>
          </g>

          <!-- 7. Photos -->
          <g class="add-person-layer layer-stagger-7">
            <polyline points="166.4758 412.9434 166.4758 440.7253 14.969 440.7242 14.969 412.9434" class="inner-bracket"/>
            <text id="labelPhotos" transform="translate(49.2982 384.5246)" class="svg-field-label is-regular"><tspan x="0" y="0">add photo</tspan></text>
            <g id="svgPhotoBox1">
              <rect x="70.317" y="392.326" width="41.2348" height="41.2348" class="photo-box-outline"/>
              <path id="svgPlusIcon1" d="M94.4668,412.467v.9521h-3.0518v3.0659h-.9521v-3.0659h-3.0518v-.9521h3.0518v-3.0659h.9521v3.0659h3.0518Z" class="photo-plus-icon"/>
            </g>
          </g>

          <!-- 8. Done -->
          <g class="add-person-layer layer-stagger-8">
            <polyline points="15.1811 455.3468 15.1811 476.2696 166.6881 476.2697 166.6881 476.0882 166.6881 455.3469" class="inner-bracket"/>
            <text id="svgLabelDone" transform="translate(72.4224 470.4047)" class="svg-field-label is-bold is-done-label"><tspan x="0" y="0">done</tspan></text>
          </g>
        </svg>

        <!-- HTML Interactive Inputs Overlay -->
        <input type="text" class="field-input-box top-input-name" data-field="fullName" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box top-input-domain" data-field="domain" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box top-input-year" data-field="year" placeholder="" autocomplete="off" />
        <textarea class="field-input-box top-input-why" data-field="whyCool" placeholder=""></textarea>
        <input type="text" class="field-input-box top-input-place" data-field="place" placeholder="" autocomplete="off" />
        <textarea class="field-input-box top-input-links" data-field="links" placeholder=""></textarea>

        <!-- Photo Upload Targets -->
        <div class="photos-container top-photos">
          <div class="photo-slot top-photo-1" data-slot="1">
            <img class="photo-preview-img" id="photoPreview1" alt="" />
            <input type="file" accept="image/*" class="photo-file-input" id="photoFileInput1" />
            <button type="button" class="photo-slot-btn" aria-label="Upload photo"></button>
          </div>
        </div>

        <!-- Done Action Button -->
        <button type="button" class="done-action-btn top-done-btn" id="doneActionBtn" aria-label="Submit add name"></button>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     LEFT EDGE TEMPLATE (575.99 × 157.25 px)
  ------------------------------------------------------------- */
  renderLeftEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="add-person-outer-svg" id="addPersonOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="addPersonBorderLine" 
          class="add-person-border-line" 
          points="10.5705 .75 28.0268 .75 28.0268 145.3723 0 145.3723" 
        />
        <text 
          id="addPersonSvgText" 
          transform="translate(19.8519 138.6398) rotate(-90)" 
          style="font-family: 'Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 21px; font-weight: 700; fill: #000000; pointer-events: none; user-select: none;"
        >
          <tspan x="0" y="0">add name</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar (Vertical strip on left edge) -->
      <div class="add-person-header is-vertical is-left" id="addPersonHeader" title="Click to add name" aria-label="Add name"></div>

      <!-- Expandable Form Content -->
      <div class="add-person-content is-left-content" id="addPersonContent">
        <svg class="add-person-inner-svg" viewBox="0 0 575.9889 157.2465" xmlns="http://www.w3.org/2000/svg">
          <!-- Col 1: Full Name -->
          <g class="add-person-layer layer-stagger-1">
            <polyline points="193.4861 13.7366 193.4865 35.4368 41.9778 35.4369" class="inner-bracket"/>
            <text id="labelFullName" transform="translate(41.7544 27.4482)" class="svg-field-label is-bold"><tspan x="0" y="0">*full name *</tspan></text>
          </g>

          <!-- Col 1: Domain -->
          <g class="add-person-layer layer-stagger-2">
            <polyline points="193.4861 50.0573 193.4865 71.7575 41.9778 71.7577" class="inner-bracket"/>
            <text id="labelDomain" transform="translate(41.7544 63.769)" class="svg-field-label is-bold"><tspan x="0" y="0">*domain *</tspan></text>
          </g>

          <!-- Col 1: Year -->
          <g class="add-person-layer layer-stagger-3">
            <polyline points="193.4864 86.378 193.4865 108.0779 41.9778 108.0774" class="inner-bracket"/>
            <text id="labelYear" transform="translate(41.978 100.0751)" class="svg-field-label is-regular"><tspan x="0" y="0">year of birth</tspan></text>
          </g>

          <!-- Col 1: Place -->
          <g class="add-person-layer layer-stagger-4">
            <polyline points="193.4865 121.0643 193.4865 142.7649 41.9778 142.7649" class="inner-bracket"/>
            <text id="labelPlace" transform="translate(41.0337 134.6723)" class="svg-field-label is-regular"><tspan x="0" y="0">place of birth </tspan></text>
          </g>

          <!-- Col 2: Why Cool -->
          <g class="add-person-layer layer-stagger-5">
            <polyline points="360.0117 13.7366 359.925 142.7649 208.1083 142.8411" class="inner-bracket"/>
            <line x1="208.7021" y1="45.0052" x2="359.9601" y2="45.0052" class="inner-divider-thin"/>
            <polyline points="358.5322 57.1577 354.1027 57.1577 354.1027 45.0052" class="inner-divider-thin"/>
            <text id="labelWhyCool" transform="translate(208.1084 27.4482)" class="svg-field-label is-bold">
              <tspan x="0" y="0">why do you think</tspan>
              <tspan x="0" y="14">they are cool? *</tspan>
            </text>
          </g>

          <!-- Col 3: Links -->
          <g class="add-person-layer layer-stagger-6">
            <polyline points="526.7075 13.7366 526.7075 56.6795 375.1756 57.05" class="inner-bracket"/>
            <line x1="376.2118" y1="27.1487" x2="527.4699" y2="27.1487" class="inner-divider-thin"/>
            <polyline points="524.9816 38.2409 520.5521 38.2409 520.5521 26.0883" class="inner-divider-thin"/>
            <text id="labelLinks" transform="translate(375.2075 25.1943)" class="svg-field-label is-regular"><tspan x="0" y="0">links</tspan></text>
          </g>

          <!-- Col 3: Photos -->
          <g class="add-person-layer layer-stagger-7">
            <polyline points="375.172 142.8411 526.7112 142.8411 526.7075 70.0376" class="inner-bracket"/>
            <text id="labelPhotos" transform="translate(375.2075 81.6918)" class="svg-field-label is-regular"><tspan x="0" y="0">add photo</tspan></text>
            <g id="svgPhotoBox1">
              <rect x="375.1515" y="92.164" width="41.2348" height="41.2348" class="photo-box-outline"/>
              <path id="svgPlusIcon1" d="M399.3002,112.3049v.9521h-3.0518v3.0659h-.9521v-3.0659h-3.0518v-.9521h3.0518v-3.0659h.9521v3.0659h3.0518Z" class="photo-plus-icon"/>
            </g>
          </g>

          <!-- Col 4: Done -->
          <g class="add-person-layer layer-stagger-8">
            <path d="M541.3293,142.8494s20.7505,0,20.9217-.0166l.0011-129.0963h-20.9228" class="inner-bracket"/>
            <text id="svgLabelDone" transform="translate(556.5945 94.4902) rotate(-90)" class="svg-field-label is-bold is-done-label"><tspan x="0" y="0">done</tspan></text>
          </g>
        </svg>

        <!-- HTML Interactive Inputs Overlay -->
        <input type="text" class="field-input-box left-input-name" data-field="fullName" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box left-input-domain" data-field="domain" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box left-input-year" data-field="year" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box left-input-place" data-field="place" placeholder="" autocomplete="off" />
        <textarea class="field-input-box left-input-why" data-field="whyCool" placeholder=""></textarea>
        <textarea class="field-input-box left-input-links" data-field="links" placeholder=""></textarea>

        <!-- Photo Upload Targets -->
        <div class="photos-container left-photos">
          <div class="photo-slot left-photo-1" data-slot="1">
            <img class="photo-preview-img" id="photoPreview1" alt="" />
            <input type="file" accept="image/*" class="photo-file-input" id="photoFileInput1" />
            <button type="button" class="photo-slot-btn" aria-label="Upload photo"></button>
          </div>
        </div>

        <!-- Done Action Button -->
        <button type="button" class="done-action-btn left-done-btn" id="doneActionBtn" aria-label="Submit add name"></button>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     RIGHT EDGE TEMPLATE (579.87 × 157.25 px)
  ------------------------------------------------------------- */
  renderRightEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="add-person-outer-svg" id="addPersonOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="addPersonBorderLine" 
          class="add-person-border-line" 
          points="19.3822 145.3723 0.7500 145.3723 0.7500 0.7500 29.9527 0.7500" 
        />
        <text 
          id="addPersonSvgText" 
          transform="translate(10.1006 7.4851) rotate(90)" 
          style="font-family: 'Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 21px; font-weight: 700; fill: #000000; pointer-events: none; user-select: none;"
        >
          <tspan x="0" y="0">add name</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar (Vertical strip on right edge) -->
      <div class="add-person-header is-vertical is-right" id="addPersonHeader" title="Click to add name" aria-label="Add name"></div>

      <!-- Expandable Form Content -->
      <div class="add-person-content is-right-content" id="addPersonContent">
        <svg class="add-person-inner-svg" viewBox="0 0 579.8732 157.2465" xmlns="http://www.w3.org/2000/svg">
          <!-- Col 1: Full Name -->
          <g class="add-person-layer layer-stagger-1">
            <polyline points="13.7372 13.7366 13.7368 35.4368 165.2455 35.4369" class="inner-bracket"/>
            <text id="labelFullName" transform="translate(81.6293 27.4479)" class="svg-field-label is-bold"><tspan x="0" y="0">*full name *</tspan></text>
          </g>

          <!-- Col 1: Domain -->
          <g class="add-person-layer layer-stagger-2">
            <polyline points="13.7372 50.0573 13.7368 71.7575 165.2455 71.7577" class="inner-bracket"/>
            <text id="labelDomain" transform="translate(93.4525 63.7687)" class="svg-field-label is-bold"><tspan x="0" y="0">*domain *</tspan></text>
          </g>

          <!-- Col 1: Year -->
          <g class="add-person-layer layer-stagger-3">
            <polyline points="13.7369 86.378 13.7368 108.0779 165.2455 108.0774" class="inner-bracket"/>
            <text id="labelYear" transform="translate(84.4135 99.986)" class="svg-field-label is-regular"><tspan x="0" y="0">year of birth</tspan></text>
          </g>

          <!-- Col 1: Place -->
          <g class="add-person-layer layer-stagger-4">
            <polyline points="13.7368 121.0643 13.7368 142.7649 165.2455 142.7649" class="inner-bracket"/>
            <text id="labelPlace" transform="translate(76.5092 134.7506)" class="svg-field-label is-regular"><tspan x="0" y="0">place of birth</tspan></text>
          </g>

          <!-- Col 2: Why Cool -->
          <g class="add-person-layer layer-stagger-5">
            <polyline points="180.1366 14.071 180.2232 143.0993 332.0399 143.1755" class="inner-bracket"/>
            <line x1="180.4592" y1="48.4406" x2="331.7173" y2="48.4406" class="inner-divider-thin"/>
            <polyline points="181.5612 65.6594 185.5442 65.6594 185.5442 48.4406" class="inner-divider-thin"/>
            <text id="labelWhyCool" transform="translate(202.7284 27.4479)" class="svg-field-label is-bold">
              <tspan x="0" y="0">*why do you think</tspan>
              <tspan x="16.7832" y="19.2002">they are cool? *</tspan>
            </text>
          </g>

          <!-- Col 3: Links -->
          <g class="add-person-layer layer-stagger-6">
            <polyline points="346.9346 13.7366 346.9346 56.6795 498.4665 57.05" class="inner-bracket"/>
            <line x1="498.3456" y1="29.317" x2="347.0875" y2="29.317" class="inner-divider-thin"/>
            <polyline points="348.5154 41.4695 352.945 41.4695 352.945 29.317" class="inner-divider-thin"/>
            <text id="labelLinks" transform="translate(467.7626 27.4479)" class="svg-field-label is-regular"><tspan x="0" y="0">links</tspan></text>
          </g>

          <!-- Col 3: Photos -->
          <g class="add-person-layer layer-stagger-7">
            <polyline points="498.4701 142.8411 346.931 142.8411 346.9346 70.0376" class="inner-bracket"/>
            <text id="labelPhotos" transform="translate(427.8588 83.4054)" class="svg-field-label is-regular"><tspan x="0" y="0">add photo</tspan></text>
            <g id="svgPhotoBox1">
              <rect x="457.2316" y="92.164" width="41.2348" height="41.2348" class="photo-box-outline"/>
              <path id="svgPlusIcon1" d="M481.3816,112.3049v.9521h-3.0518v3.0659h-.9521v-3.0659h-3.0518v-.9521h3.0518v-3.0659h.9521v3.0659h3.0518Z" class="photo-plus-icon"/>
            </g>
          </g>

          <!-- Col 4: Done -->
          <g class="add-person-layer layer-stagger-8">
            <path d="M534.4967,13.7365s-20.7505,0-20.9217.0166l-.001,129.0963h.1816s20.7413,0,20.7413,0" class="inner-bracket"/>
            <text id="svgLabelDone" transform="translate(521.1474 62.0928) rotate(90)" class="svg-field-label is-bold is-done-label"><tspan x="0" y="0">done</tspan></text>
          </g>
        </svg>

        <!-- HTML Interactive Inputs Overlay -->
        <input type="text" class="field-input-box right-input-name" data-field="fullName" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box right-input-domain" data-field="domain" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box right-input-year" data-field="year" placeholder="" autocomplete="off" />
        <input type="text" class="field-input-box right-input-place" data-field="place" placeholder="" autocomplete="off" />
        <textarea class="field-input-box right-input-why" data-field="whyCool" placeholder=""></textarea>
        <textarea class="field-input-box right-input-links" data-field="links" placeholder=""></textarea>

        <!-- Photo Upload Targets -->
        <div class="photos-container right-photos">
          <div class="photo-slot right-photo-1" data-slot="1">
            <img class="photo-preview-img" id="photoPreview1" alt="" />
            <input type="file" accept="image/*" class="photo-file-input" id="photoFileInput1" />
            <button type="button" class="photo-slot-btn" aria-label="Upload photo"></button>
          </div>
        </div>

        <!-- Done Action Button -->
        <button type="button" class="done-action-btn right-done-btn" id="doneActionBtn" aria-label="Submit add name"></button>
      </div>
    `;
  }

  cacheElements() {
    this.borderLine = this.widget.querySelector('#addPersonBorderLine');
    this.header = this.widget.querySelector('#addPersonHeader');
    this.content = this.widget.querySelector('#addPersonContent');
    this.svgText = this.widget.querySelector('#addPersonSvgText');

    this.inputFullName = this.widget.querySelector('[data-field="fullName"]');
    this.inputDomain = this.widget.querySelector('[data-field="domain"]');
    this.inputYear = this.widget.querySelector('[data-field="year"]');
    this.inputWhyCool = this.widget.querySelector('[data-field="whyCool"]');
    this.inputPlace = this.widget.querySelector('[data-field="place"]');
    this.inputLinks = this.widget.querySelector('[data-field="links"]');

    this.labelFullName = this.widget.querySelector('#labelFullName');
    this.labelDomain = this.widget.querySelector('#labelDomain');
    this.labelYear = this.widget.querySelector('#labelYear');
    this.labelWhyCool = this.widget.querySelector('#labelWhyCool');
    this.labelPlace = this.widget.querySelector('#labelPlace');
    this.labelLinks = this.widget.querySelector('#labelLinks');

    this.doneBtn = this.widget.querySelector('#doneActionBtn');

    this.photoFileInput1 = this.widget.querySelector('#photoFileInput1');
    this.photoPreview1 = this.widget.querySelector('#photoPreview1');
    this.plusIcon1 = this.widget.querySelector('#svgPlusIcon1');
  }

  bindEvents() {
    this.widget.onclick = (e) => {
      // If closed, clicking anywhere on the button expands it
      if (!this.isExpanded) {
        this.open();
        return;
      }
      // If expanded, clicking the header bar closes it
      if (this.header && (e.target === this.header || this.header.contains(e.target))) {
        this.close();
      }
    };

    // Input fields: typing hides grey placeholder text
    const bindInput = (input, label, key) => {
      if (!input) return;
      const updateLabel = () => {
        const val = input.value;
        this.formData[key] = val;
        if (label) {
          label.style.opacity = val.trim().length > 0 ? '0' : '1';
        }
      };
      input.oninput = updateLabel;
      input.onchange = updateLabel;
    };

    bindInput(this.inputFullName, this.labelFullName, 'fullName');
    
    // Domain field opens DomainPanel extension
    if (this.inputDomain) {
      this.inputDomain.style.cursor = 'pointer';
      this.inputDomain.setAttribute('readonly', 'readonly');
      this.inputDomain.onclick = (e) => {
        e.stopPropagation();
        this.toggleDomainPanel();
      };
    }

    const domainLayer = this.widget.querySelector('.layer-stagger-2');
    if (domainLayer) {
      domainLayer.style.cursor = 'pointer';
      domainLayer.onclick = (e) => {
        e.stopPropagation();
        this.toggleDomainPanel();
      };
    }

    bindInput(this.inputYear, this.labelYear, 'year');
    bindInput(this.inputWhyCool, this.labelWhyCool, 'whyCool');
    bindInput(this.inputPlace, this.labelPlace, 'place');
    bindInput(this.inputLinks, this.labelLinks, 'links');

    // Single photo upload & PhotoPanel tool trigger
    if (this.photoFileInput1) {
      const slot = this.widget.querySelector('.photo-slot[data-slot="1"]');
      const btn = slot ? slot.querySelector('.photo-slot-btn') : null;

      if (btn) {
        btn.onclick = () => {
          if (this.formData.photo && this.formData.photo.imageHref) {
            this.openPhotoPanel();
          } else {
            this.photoFileInput1.click();
          }
        };
      }

      this.photoFileInput1.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const url = evt.target.result;
            this.formData.photo = {
              imageHref: url,
              imageScale: 1.05,
              imagePanX: 0,
              imagePanY: 0,
              theme: 'dark'
            };
            this.formData.photos = [url];
            if (this.photoPreview1) {
              this.photoPreview1.src = url;
              this.photoPreview1.style.display = 'block';
            }
            if (this.plusIcon1) {
              this.plusIcon1.style.opacity = '0';
            }
            // Automatically open secondary Photo Panel tool when upload completes
            this.openPhotoPanel();
          };
          reader.readAsDataURL(file);
        }
      };
    }

    // Done button
    if (this.doneBtn) {
      this.doneBtn.onclick = (e) => {
        e.stopPropagation();
        this.handleDone();
      };
    }

    // Outside click closes panel
    if (!this._hasGlobalClick) {
      this._hasGlobalClick = true;
      document.addEventListener('click', (e) => {
        if (this.isExpanded && this.widget && !this.widget.contains(e.target)) {
          if (e.target.closest('.board-btn-edit')) {
            return;
          }
          if (this.domainPanel && this.domainPanel.widget && this.domainPanel.widget.contains(e.target)) {
            return;
          }
          if (this.photoPanel && this.photoPanel.widget && this.photoPanel.widget.contains(e.target)) {
            return;
          }
          this.close();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isExpanded) {
          this.close();
        }
      });
      window.addEventListener('nopitac:component-opened', (e) => {
        if (e.detail && e.detail.component !== 'add-person' && this.isExpanded) {
          this.close();
        }
      });
    }
  }

  /**
   * Sets exact vector polyline points and header text for given w and h
   * with ZERO DOM layout reflows (no offsetWidth/offsetHeight calls).
   */
  renderBorderPointsFor(w, h) {
    if (!this.borderLine) return;

    if (this.edge === 'top') {
      const t = Math.min(1, Math.max(0, (h - 29.9526) / (491.3488 - 29.9526)));
      const topY = 10.5705 + (20.001 - 10.5705) * t;
      const rightX = (w - 0.75).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      this.borderLine.setAttribute('points', `${rightX} ${topY.toFixed(4)} ${rightX} ${bottomY} 0.7500 ${bottomY} 0.7500 0`);
      if (this.svgText) {
        this.svgText.setAttribute('transform', 'translate(7.1814 20.001)');
      }
    } else if (this.edge === 'left') {
      const t = Math.min(1, Math.max(0, (w - 29.9523) / (575.9889 - 29.9523)));
      const notchX = 10.5705 + (19.8547 - 10.5705) * t;
      const rightX = (w - 0.75).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      this.borderLine.setAttribute('points', `${notchX.toFixed(4)} 0.7500 ${rightX} 0.7500 ${rightX} ${bottomY} 0 ${bottomY}`);
      if (this.svgText) {
        const textY = (h - 7.4825).toFixed(4);
        this.svgText.setAttribute('transform', `translate(19.8519 ${textY}) rotate(-90)`);
      }
    } else if (this.edge === 'right') {
      const t = Math.min(1, Math.max(0, (w - 29.9527) / (579.8732 - 29.9527)));
      const notchStub = 10.5705 + (19.8548 - 10.5705) * t;
      const notchX = (w - notchStub).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      const rightX = w.toFixed(4);
      this.borderLine.setAttribute('points', `${notchX} ${bottomY} 0.7500 ${bottomY} 0.7500 0.7500 ${rightX} 0.7500`);
      if (this.svgText) {
        const textX = (w - 19.8521).toFixed(4);
        this.svgText.setAttribute('transform', `translate(${textX} 7.4851) rotate(90)`);
      }
    }
  }

  /**
   * Recalculates exact vector polyline points matching the static resting state.
   */
  updateBorderPoints() {
    let w, h;
    if (this.edge === 'top') {
      w = this.isExpanded ? 181.6649 : 146.1223;
      h = this.isExpanded ? 491.3488 : 29.9526;
    } else if (this.edge === 'left') {
      w = this.isExpanded ? 575.9889 : 29.9523;
      h = this.isExpanded ? 157.2465 : 146.1223;
    } else if (this.edge === 'right') {
      w = this.isExpanded ? 579.8732 : 29.9527;
      h = this.isExpanded ? 157.2465 : 146.1223;
    }
    this.renderBorderPointsFor(w, h);
  }

  updateOuterPolyline() {
    this.updateBorderPoints();
  }

  /**
   * High-performance, zero-reflow mathematical rAF animator.
   * Tracks the exact cubic-bezier curve of the AE animation without reading
   * offsetWidth or offsetHeight from the DOM, ensuring silky 60fps/120fps motion.
   */
  animateBorder(opening = true) {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    const startTime = performance.now();
    const duration = opening ? 450 : 320;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const p = Math.min(1, Math.max(0, elapsed / duration));

      if (this.widget) {
        const box = this.widget.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          this.renderBorderPointsFor(box.width, box.height);
        }
      }

      if (p < 1) {
        this._animFrameId = requestAnimationFrame(tick);
      } else {
        this._animFrameId = null;
        this.updateBorderPoints();
      }
    };

    this._animFrameId = requestAnimationFrame(tick);
  }

  /**
   * Opens AddPersonButton pre-populated with an existing person's saved info for editing.
   */
  openForEdit(person) {
    if (!person) return;
    this.editingPersonId = person.id || (person.fullName || '').trim().toLowerCase();
    this.isEditMode = true;

    const existingPhotoHref = person.photo?.imageHref || (Array.isArray(person.photos) ? person.photos[0] : null) || null;
    this.formData = {
      fullName: person.fullName || '',
      domain: person.domain || '',
      domainColor: person.domainColor || null,
      year: person.year || '',
      whyCool: person.description || person.whyCool || '',
      place: person.place || '',
      links: person.links || '',
      photos: [existingPhotoHref],
      photo: person.photo ? { ...person.photo } : (existingPhotoHref ? { imageHref: existingPhotoHref, theme: 'dark' } : null)
    };

    this.syncAllInputs();
    if (!this.isExpanded) {
      this.open();
    }
  }

  open() {
    if (this.isExpanded) return;
    this.isExpanded = true;
    window.dispatchEvent(new CustomEvent('nopitac:component-opened', { detail: { component: 'add-person' } }));

    // Strict edge anchoring and bounding clamp
    if (this.edge === 'right') {
      this.widget.style.left = 'auto';
      this.widget.style.right = '0px';
      const curTop = parseFloat(this.widget.style.top) || 0;
      const maxTop = Math.max(0, window.innerHeight - 80 - 158);
      if (curTop > maxTop) {
        this.widget.style.top = `${maxTop}px`;
      }
    } else if (this.edge === 'left') {
      this.widget.style.left = '0px';
      this.widget.style.right = 'auto';
      const curTop = parseFloat(this.widget.style.top) || 0;
      if (curTop < 12) {
        this.widget.style.top = '12px';
      }
    } else if (this.edge === 'top') {
      this.widget.style.top = '0px';
      this.widget.style.right = 'auto';
      // Clamp left so expanding from 146px to 182px never overflows the right edge
      const curLeft = parseFloat(this.widget.style.left) || 0;
      const maxLeft = Math.max(0, window.innerWidth - 182);
      if (curLeft > maxLeft) {
        this.widget.style.left = `${maxLeft}px`;
      }
    }

    this.widget.classList.add('is-expanded');
    this.widget.setAttribute('aria-expanded', 'true');
    this.animateBorder(true);
  }

  close(immediate = false) {
    if (!this.isExpanded) return;
    const wasEditMode = this.isEditMode;
    this.isExpanded = false;
    this.editingPersonId = null;
    this.isEditMode = false;
    if (this.domainPanel) {
      this.domainPanel.close();
    }
    if (this.photoPanel) {
      this.photoPanel.close();
    }
    this.widget.classList.remove('is-expanded');
    this.widget.setAttribute('aria-expanded', 'false');

    if (wasEditMode) {
      this.clearForm();
    }

    if (immediate) {
      if (this._animFrameId) {
        cancelAnimationFrame(this._animFrameId);
        this._animFrameId = null;
      }
      this.widget.classList.add('no-transition');
      this.updateBorderPoints();
      void this.widget.offsetWidth;
      this.widget.classList.remove('no-transition');
    } else {
      this.animateBorder(false);
    }

    if (document.activeElement && this.widget.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  toggle() {
    if (this.isExpanded) {
      this.close();
    } else {
      this.open();
    }
  }

  toggleDomainPanel() {
    if (!this.domainPanel) return;
    if (this.domainPanel.isOpen) {
      this.domainPanel.close();
    } else {
      this.openDomainPanel();
    }
  }

  openDomainPanel() {
    if (!this.domainPanel || !this.widget) return;
    this.domainPanel.setEdgeAndSide(this.edge);
    const bRect = this.widget.getBoundingClientRect();
    const rect = {
      left: bRect.left || parseFloat(this.widget.style.left) || this.widget.offsetLeft || 0,
      top: bRect.top || parseFloat(this.widget.style.top) || this.widget.offsetTop || 0,
      width: bRect.width || this.widget.offsetWidth || (this.edge === 'top' ? 181.6649 : (this.edge === 'left' ? 575.9889 : 579.8732)),
      height: bRect.height || this.widget.offsetHeight || (this.edge === 'top' ? 491.3488 : 157.2465)
    };
    const viewportWidth = window.innerWidth;
    const usableHeight = window.innerHeight - 80;
    const currentDomain = this.inputDomain ? this.inputDomain.value.trim() : (this.formData.domain || '');
    this.domainPanel.open(rect, viewportWidth, usableHeight, currentDomain);
  }

  openPhotoPanel() {
    if (!this.photoPanel || !this.widget) return;
    this.photoPanel.setEdgeAndSide(this.edge);
    const bRect = this.widget.getBoundingClientRect();
    const rect = {
      left: bRect.left || parseFloat(this.widget.style.left) || this.widget.offsetLeft || 0,
      top: bRect.top || parseFloat(this.widget.style.top) || this.widget.offsetTop || 0,
      width: bRect.width || this.widget.offsetWidth || (this.edge === 'top' ? 181.6649 : (this.edge === 'left' ? 575.9889 : 579.8732)),
      height: bRect.height || this.widget.offsetHeight || (this.edge === 'top' ? 491.3488 : 157.2465)
    };
    const viewportWidth = window.innerWidth;
    const usableHeight = window.innerHeight - 80;
    const currentName = this.inputFullName ? this.inputFullName.value.trim() : (this.formData.fullName || '');

    this.photoPanel.open({
      imageHref: this.formData.photo ? this.formData.photo.imageHref : (this.formData.photos[0] || ''),
      personName: currentName || 'charlie maignan',
      theme: this.formData.photo ? this.formData.photo.theme : 'dark',
      imageScale: this.formData.photo ? this.formData.photo.imageScale : 1.05,
      imagePanX: this.formData.photo ? this.formData.photo.imagePanX : 0,
      imagePanY: this.formData.photo ? this.formData.photo.imagePanY : 0,
      addPersonRect: rect,
      viewportWidth,
      usableHeight,
      onDone: (photoData) => {
        this.formData.photo = photoData;
        this.formData.photos = [photoData.imageHref];
        if (this.photoPreview1) {
          this.photoPreview1.src = photoData.imageHref;
          this.photoPreview1.style.display = 'block';
        }
        if (this.plusIcon1) {
          this.plusIcon1.style.opacity = '0';
        }
      }
    });
  }

  handleDone() {
    const now = Date.now();
    const domainVal = this.inputDomain ? this.inputDomain.value.trim() : (this.formData.domain || '');
    let domainColorVal = this.formData.domainColor;
    if (!domainColorVal && this.domainPanel && this.domainPanel.domains) {
      const found = this.domainPanel.domains.find(
        (d) => d.name.replace(/\n+/g, ' ').toLowerCase() === domainVal.toLowerCase()
      );
      if (found) domainColorVal = found.color;
    }

    const data = {
      editingPersonId: this.editingPersonId,
      fullName: this.inputFullName ? this.inputFullName.value.trim() : '',
      domain: domainVal,
      domainColor: domainColorVal,
      year: this.inputYear ? this.inputYear.value.trim() : '',
      whyCool: this.inputWhyCool ? this.inputWhyCool.value.trim() : '',
      place: this.inputPlace ? this.inputPlace.value.trim() : '',
      links: this.inputLinks ? this.inputLinks.value.trim() : '',
      photos: [...this.formData.photos],
      photo: this.formData.photo ? { ...this.formData.photo } : null,
      dateAdded: now,
      dateAddedISO: new Date(now).toISOString()
    };

    this.editingPersonId = null;
    this.isEditMode = false;

    if (typeof this.onDone === 'function') {
      this.onDone(data);
    }

    if (this.domainPanel) {
      this.domainPanel.close();
    }
    if (this.photoPanel) {
      this.photoPanel.close();
    }

    this.clearForm();
    this.close();
  }

  syncAllInputs() {
    if (this.inputFullName) {
      this.inputFullName.value = this.formData.fullName;
      if (this.labelFullName) this.labelFullName.style.opacity = this.formData.fullName ? '0' : '1';
    }
    if (this.inputDomain) {
      this.inputDomain.value = this.formData.domain;
      if (this.labelDomain) this.labelDomain.style.opacity = this.formData.domain ? '0' : '1';
    }
    if (this.inputYear) {
      this.inputYear.value = this.formData.year;
      if (this.labelYear) this.labelYear.style.opacity = this.formData.year ? '0' : '1';
    }
    if (this.inputWhyCool) {
      this.inputWhyCool.value = this.formData.whyCool;
      if (this.labelWhyCool) this.labelWhyCool.style.opacity = this.formData.whyCool ? '0' : '1';
    }
    if (this.inputPlace) {
      this.inputPlace.value = this.formData.place;
      if (this.labelPlace) this.labelPlace.style.opacity = this.formData.place ? '0' : '1';
    }
    if (this.inputLinks) {
      this.inputLinks.value = this.formData.links;
      if (this.labelLinks) this.labelLinks.style.opacity = this.formData.links ? '0' : '1';
    }

    const url = this.formData.photo ? this.formData.photo.imageHref : this.formData.photos[0];
    if (this.photoPreview1 && this.plusIcon1) {
      if (url) {
        this.photoPreview1.src = url;
        this.photoPreview1.style.display = 'block';
        this.plusIcon1.style.opacity = '0';
      } else {
        this.photoPreview1.removeAttribute('src');
        this.photoPreview1.style.display = 'none';
        this.plusIcon1.style.opacity = '1';
      }
    }
  }

  clearForm() {
    this.formData = {
      fullName: '',
      domain: '',
      year: '',
      whyCool: '',
      place: '',
      links: '',
      photos: [null],
      photo: null
    };
    this.syncAllInputs();
  }

  destroy() {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this.domainPanel) {
      this.domainPanel.destroy();
    }
    if (this.photoPanel) {
      this.photoPanel.close();
    }
    if (this.widget && this.widget.parentNode) {
      this.widget.parentNode.removeChild(this.widget);
    }
  }
}
