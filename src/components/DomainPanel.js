/**
 * DomainPanel Component
 * Extension panel for domain selection & creation attached to Add Person button.
 * 
 * Rules:
 *  - Opens when user clicks the "domain*" field in Add Person.
 *  - Top Edge (150.61 × 303.72 px): attaches to Left or Right side of Add Person based on available space.
 *  - Left Edge (285.52 × 171.27 px): attaches to Top or Bottom of Add Person based on available space.
 *  - Right Edge (285.52 × 171.27 px): attaches to Top or Bottom of Add Person based on available space.
 *  - Domain chips rendered using Nopitac DomainType engine:
 *      - Top edge: 'center' mode
 *      - Left edge: 'left' mode
 *      - Right edge: 'right' mode
 *  - New domain creation: enter domain name, pick color, click done -> immediately adds to domain list.
 *  - Selecting a domain passes the selected domain to Add Person and closes the panel.
 */

import DomainType from '../engine/domainType.js';

export const INITIAL_DOMAINS = [
  { name: 'artists', color: '#27ff83' },
  { name: 'copywriters', color: '#d8ff2a' },
  { name: 'music\ncomposers', color: '#f5003a' },
  { name: 'web\ndesigner', color: '#6a76ff' }
];

export const PRESET_COLORS = [
  '#27ff83', // green
  '#d8ff2a', // yellow-green
  '#f5003a', // red
  '#6a76ff', // blue
  '#ff8a00', // orange
  '#ff3bd4', // magenta
  '#00e5ff', // cyan
  '#a855f7'  // purple
];

export function normalizeDomainKey(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function formatMultilineDomain(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export class DomainPanel {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.edge = options.edge || 'top'; // 'top' | 'left' | 'right'
    this.side = options.side || 'left'; // 'left' | 'right' (top edge) or 'top' | 'bottom' (left/right edge)
    this.isOpen = false;
    this.emptyMode = Boolean(options.emptyMode);
    this.onSelect = options.onSelect || null;
    this.onAddDomain = options.onAddDomain || null;
    this.onUpdateDomain = options.onUpdateDomain || null;

    this.domains = this.emptyMode ? [] : [...INITIAL_DOMAINS];
    this.selectedColor = PRESET_COLORS[0];
    this.editingOriginalKey = null;

    this.init();
  }

  addDomain(domainObj) {
    if (!domainObj || !domainObj.name) return;
    const key = normalizeDomainKey(domainObj.name);
    if (!key) return;
    const formattedName = formatMultilineDomain(domainObj.name);
    const existing = this.domains.find((d) => normalizeDomainKey(d.name) === key);
    if (existing) {
      if (domainObj.color) existing.color = domainObj.color;
      existing.name = formattedName;
    } else {
      this.domains.push({
        name: formattedName,
        color: domainObj.color || PRESET_COLORS[0]
      });
    }
    if (this.isOpen) {
      this.renderDomainList();
    }
  }

  updateDomain(originalName, updatedObj) {
    if (!updatedObj || !updatedObj.name) return;
    const prevKey = normalizeDomainKey(originalName);
    const nextKey = normalizeDomainKey(updatedObj.name);
    const formattedName = formatMultilineDomain(updatedObj.name);
    const nextColor = updatedObj.color || PRESET_COLORS[0];

    const idx = this.domains.findIndex((d) => normalizeDomainKey(d.name) === prevKey);
    if (idx >= 0) {
      // Remove duplicate target if renaming onto another existing entry
      const dupIdx = this.domains.findIndex((d, i) => i !== idx && normalizeDomainKey(d.name) === nextKey);
      if (dupIdx >= 0) {
        this.domains.splice(dupIdx, 1);
      }
      const refreshedIdx = this.domains.findIndex((d) => normalizeDomainKey(d.name) === prevKey);
      if (refreshedIdx >= 0) {
        this.domains[refreshedIdx] = { name: formattedName, color: nextColor };
      }
    } else {
      this.domains.push({ name: formattedName, color: nextColor });
    }

    if (this.isOpen) {
      this.renderDomainList();
    }
  }

  init() {
    this.createElement();
    this.bindGlobalEvents();
  }

  createElement() {
    if (!this.widget) {
      this.widget = document.createElement('div');
      this.widget.id = 'domainPanelWidget';
      this.widget.className = 'domain-panel-widget';
      this.container.appendChild(this.widget);
    }
  }

  setEdgeAndSide(edge, side) {
    this.edge = edge;
    this.side = side;
  }

  /**
   * Calculates anchor position and attaches to Add Person.
   */
  updatePosition(addPersonRect, viewportWidth, usableHeight) {
    if (!this.widget) return;

    if (this.edge === 'top') {
      const panelW = 150.6111;
      const panelH = 303.7175;
      const spaceLeft = addPersonRect.left;
      const spaceRight = viewportWidth - (addPersonRect.left + addPersonRect.width);

      if (spaceLeft >= panelW && spaceLeft >= spaceRight) {
        this.side = 'left';
        this.widget.style.left = `${Math.round(addPersonRect.left - panelW + 0.75)}px`;
      } else {
        this.side = 'right';
        this.widget.style.left = `${Math.round(addPersonRect.left + addPersonRect.width - 0.75)}px`;
      }
      this.widget.style.top = `${Math.round(addPersonRect.top + 83.5)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    } else if (this.edge === 'left') {
      const panelW = 285.5236;
      const panelH = 171.2692;
      const spaceTop = addPersonRect.top;
      const spaceBottom = usableHeight - (addPersonRect.top + addPersonRect.height);

      if (spaceTop >= panelH && spaceTop >= spaceBottom) {
        this.side = 'top';
        this.widget.style.top = `${(addPersonRect.top - panelH + 0.75).toFixed(2)}px`;
      } else {
        this.side = 'bottom';
        this.widget.style.top = `${(addPersonRect.top + addPersonRect.height - 0.75).toFixed(2)}px`;
      }
      // Exactly matches left edge SVGs: left vertical border aligns with Col 1 inputs at +41.9777px from left screen edge
      // (polyline stroke center inside renderLeftEdge SVG is at x = 0.75)
      this.widget.style.left = `${(addPersonRect.left + 41.9777 - 0.75).toFixed(2)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    } else if (this.edge === 'right') {
      const panelW = 285.5236;
      const panelH = 171.2692;
      const spaceTop = addPersonRect.top;
      const spaceBottom = usableHeight - (addPersonRect.top + addPersonRect.height);

      if (spaceTop >= panelH && spaceTop >= spaceBottom) {
        this.side = 'top';
        this.widget.style.top = `${(addPersonRect.top - panelH + 0.75).toFixed(2)}px`;
      } else {
        this.side = 'bottom';
        this.widget.style.top = `${(addPersonRect.top + addPersonRect.height - 0.75).toFixed(2)}px`;
      }
      this.widget.style.left = `${(addPersonRect.left - 105.3871).toFixed(2)}px`;
      this.widget.style.right = 'auto';
      this.widget.style.bottom = 'auto';
      this.widget.style.width = `${panelW}px`;
      this.widget.style.height = `${panelH}px`;
    }

    this.widget.setAttribute('data-edge', this.edge);
    this.widget.setAttribute('data-side', this.side);
  }

  render(startOpen = this.isOpen) {
    if (!this.widget) return;

    this.widget.className = `domain-panel-widget is-edge-${this.edge} is-side-${this.side}${startOpen ? ' is-open' : ''}`;

    if (this.edge === 'top') {
      this.renderTopEdge();
    } else if (this.edge === 'left') {
      this.renderLeftEdge();
    } else if (this.edge === 'right') {
      this.renderRightEdge();
    }

    this.initOuterBorderLength();
    this.renderDomainList();
    this.bindInternalEvents();
  }

  /**
   * Computes exact stroke length of the outer border polyline so CSS stroke-dashoffset
   * draws the border continuously outward from Add Person around the corner.
   */
  initOuterBorderLength() {
    if (!this.widget) return;
    const borderEl = this.widget.querySelector('.domain-outer-border');
    if (borderEl && typeof borderEl.getTotalLength === 'function') {
      const len = Math.ceil(borderEl.getTotalLength()) + 2;
      borderEl.style.setProperty('--domain-border-len', `${len}`);
    }
  }

  /* -------------------------------------------------------------
     TOP EDGE TEMPLATE (150.61 × 303.72 px)
  ------------------------------------------------------------- */
  renderTopEdge() {
    // Outer border: starts at Add Person edge, goes horizontally to outer corner, then vertically down
    const outerPoints = (this.side === 'left')
      ? '150.6111 0.75 0.75 0.75 0.75 303.7175'
      : '0 0.75 149.8611 0.75 149.8611 303.7175';

    this.widget.innerHTML = `
      <div class="domain-panel-bg" aria-hidden="true"></div>
      <svg class="domain-panel-outer-svg" viewBox="0 0 150.6111 303.7175" xmlns="http://www.w3.org/2000/svg">
        <polyline points="${outerPoints}" class="domain-outer-border" />
        
        <!-- Layer 1: Domain List U-Bracket -->
        <g class="domain-anim-layer domain-stagger-1">
          <polyline points="14.8013 23.3327 14.8013 158.9409 136.0363 158.9399 136.0363 23.3327" class="domain-bracket" />
        </g>

        <!-- Layer 2: Domains Header & Divider -->
        <g class="domain-anim-layer domain-stagger-2">
          <text transform="translate(36.7262 30.8685)" class="domain-title">
            <tspan x="0" y="0">domains</tspan>
          </text>
          <line x1="15.0631" y1="32.9211" x2="136.298" y2="32.9211" class="domain-bracket-thin" />
          <polyline points="27.2156 34.832 27.2156 39.2615 15.0631 39.2615" class="domain-bracket-thin" />
        </g>

        <!-- Layer 3: New / Edit Domain Heading -->
        <g class="domain-anim-layer domain-stagger-3">
          <text id="domainModeHeading" x="75.4" y="191.5911" text-anchor="middle" class="domain-title">
            <tspan id="domainModeHeadingText" x="75.4" y="191.5911">new domain</tspan>
          </text>
        </g>

        <!-- Layer 4: Enter Domain Input Bracket -->
        <g id="domainEnterGroup" class="domain-anim-layer domain-stagger-4">
          <text id="placeholderEnterDomain" x="75.4" y="213.7391" text-anchor="middle" class="domain-input-placeholder">
            <tspan x="75.4" y="213.7391">enter domain</tspan>
          </text>
          <polyline points="14.8013 206.702 14.8695 220.4731 136.1044 220.4731 136.0363 206.702" class="domain-bracket" />
        </g>

        <!-- Layer 5: Choose Colour Selector Bracket -->
        <g id="domainColourGroup" class="domain-anim-layer domain-stagger-5">
          <text id="placeholderChooseColour" transform="translate(29.8891 247.0911)" class="domain-input-placeholder">
            <tspan x="0" y="0">choose colour</tspan>
          </text>
          <polyline points="14.8013 240.0543 14.8695 253.8254 136.1044 253.8254 136.0363 240.0543" class="domain-bracket" />
        </g>

        <!-- Layer 6: Done Button -->
        <g id="domainDoneGroup" class="domain-done-group domain-anim-layer domain-stagger-6">
          <text transform="translate(59.2895 281.7898)" class="domain-done-label">
            <tspan x="0" y="0">done</tspan>
          </text>
          <polyline points="14.8699 268.4457 14.8699 289.3685 136.1044 289.3687 136.1044 289.1871 136.1044 268.4458" class="domain-bracket" />
        </g>
      </svg>

      <!-- Scrollable Domain List HTML Overlay -->
      <div class="domain-list-scroll top-domain-list domain-anim-layer domain-stagger-2" id="domainListScroll" style="position: absolute; left: 16px; top: 35px; width: 119px; height: 122px; overflow-y: auto; overflow-x: hidden;"></div>

      <!-- HTML Interactive Inputs Overlay -->
      <input type="text" class="domain-html-input top-domain-name-input domain-anim-layer domain-stagger-4" id="domainNameInput" autocomplete="off" style="position: absolute; left: 17px; top: 202px; width: 117px; height: 18px;" />
      
      <!-- Color Picker Strip HTML Overlay -->
      <div class="domain-color-picker top-domain-color-picker" id="domainColorPicker" style="position: absolute; left: 17px; top: 236px; width: 117px; height: 18px; display: flex; align-items: center; justify-content: space-between;"></div>

      <!-- Done Action Button Overlay -->
      <button type="button" class="domain-done-btn top-domain-done-btn domain-anim-layer domain-stagger-6" id="domainDoneBtn" aria-label="Add new domain" style="position: absolute; left: 15px; top: 268px; width: 122px; height: 22px;"></button>
    `;
  }

  /* -------------------------------------------------------------
     LEFT EDGE TEMPLATE (285.52 × 171.27 px)
  ------------------------------------------------------------- */
  renderLeftEdge() {
    const outerPoints = (this.side === 'top')
      ? '0.75 171.2692 0.75 0.75 285.5236 0.75'
      : '0.75 0 0.75 170.5192 285.5236 170.5192';

    this.widget.innerHTML = `
      <div class="domain-panel-bg" aria-hidden="true"></div>
      <svg class="domain-panel-outer-svg" viewBox="0 0 285.5236 171.2692" xmlns="http://www.w3.org/2000/svg">
        <polyline points="${outerPoints}" class="domain-outer-border" />

        <!-- Layer 1: Col 1 Domain List Bracket -->
        <g class="domain-anim-layer domain-stagger-1">
          <polyline points="13.6738 157.6195 134.9087 157.6184 134.6067 13.7366" class="domain-bracket" />
        </g>

        <!-- Layer 2: Col 1 Domains Title & Divider -->
        <g class="domain-anim-layer domain-stagger-2">
          <text transform="translate(13.4317 29.4259)" class="domain-title">
            <tspan x="0" y="0">domains</tspan>
          </text>
          <line x1="13.6939" y1="31.5995" x2="134.9289" y2="31.5995" class="domain-bracket-thin" />
          <polyline points="132.5186 43.7521 128.0891 43.7521 128.0891 31.5995" class="domain-bracket-thin" />
        </g>

        <!-- Layer 3: Col 2 New / Edit Domain Heading -->
        <g class="domain-anim-layer domain-stagger-3">
          <text id="domainModeHeading" transform="translate(149.6032 27.8087)" class="domain-title">
            <tspan id="domainModeHeadingText" x="0" y="0">new domain</tspan>
          </text>
        </g>

        <!-- Layer 4: Enter Domain Input Bracket (Right-aligned on left edge) -->
        <g id="domainEnterGroup" class="domain-anim-layer domain-stagger-4">
          <text id="placeholderEnterDomain" x="267" y="49.9562" text-anchor="end" class="domain-input-placeholder">
            <tspan x="267" y="49.9562">enter domain</tspan>
          </text>
          <polyline points="149.5987 56.6904 270.8337 56.6904 270.7655 37.9584" class="domain-bracket" />
        </g>

        <!-- Layer 5: Choose Colour Selector Bracket -->
        <g id="domainColourGroup" class="domain-anim-layer domain-stagger-5">
          <text id="placeholderChooseColour" transform="translate(149.599 83.3087)" class="domain-input-placeholder">
            <tspan x="0" y="0">choose colour</tspan>
          </text>
          <polyline points="149.5987 90.0426 270.8337 90.0426 270.7655 76.2716" class="domain-bracket" />
        </g>

        <!-- Layer 6: Done Button -->
        <g id="domainDoneGroup" class="domain-done-group domain-anim-layer domain-stagger-6">
          <text transform="translate(194.0187 120.6759)" class="domain-done-label">
            <tspan x="0" y="0">done</tspan>
          </text>
          <polyline points="149.5991 107.3322 149.5991 128.2551 270.8337 128.2552 270.8337 128.0737 270.8336 107.3324" class="domain-bracket" />
        </g>
      </svg>

      <!-- Scrollable Domain List HTML Overlay (Col 1) -->
      <div class="domain-list-scroll left-domain-list domain-anim-layer domain-stagger-2" id="domainListScroll" style="position: absolute; left: 16px; top: 34px; width: 117px; height: 122px; overflow-y: auto; overflow-x: hidden;"></div>

      <!-- HTML Interactive Inputs Overlay (Col 2) -->
      <input type="text" class="domain-html-input left-domain-name-input domain-anim-layer domain-stagger-4" id="domainNameInput" autocomplete="off" style="position: absolute; left: 151px; top: 38px; width: 118px; height: 18px;" />
      
      <!-- Color Picker Strip HTML Overlay -->
      <div class="domain-color-picker left-domain-color-picker" id="domainColorPicker" style="position: absolute; left: 151px; top: 72px; width: 118px; height: 18px; display: flex; align-items: center; justify-content: space-between;"></div>

      <!-- Done Action Button Overlay -->
      <button type="button" class="domain-done-btn left-domain-done-btn domain-anim-layer domain-stagger-6" id="domainDoneBtn" aria-label="Add new domain" style="position: absolute; left: 150px; top: 107px; width: 122px; height: 22px;"></button>
    `;
  }

  /* -------------------------------------------------------------
     RIGHT EDGE TEMPLATE (285.52 × 171.27 px)
  ------------------------------------------------------------- */
  renderRightEdge() {
    const outerPoints = (this.side === 'top')
      ? '284.7736 171.2692 284.7736 0.75 0 0.75'
      : '284.7736 0 284.7736 170.5192 0 170.5192';

    this.widget.innerHTML = `
      <div class="domain-panel-bg" aria-hidden="true"></div>
      <svg class="domain-panel-outer-svg" viewBox="0 0 285.5236 171.2692" xmlns="http://www.w3.org/2000/svg">
        <polyline points="${outerPoints}" class="domain-outer-border" />

        <!-- Layer 1: Col 1 Domain List Bracket -->
        <g class="domain-anim-layer domain-stagger-1">
          <polyline points="134.1587 157.6195 12.9238 157.6184 13.2258 13.7366" class="domain-bracket" />
        </g>

        <!-- Layer 2: Col 1 Domains Title & Divider -->
        <g class="domain-anim-layer domain-stagger-2">
          <text transform="translate(56.4872 29.4262)" class="domain-title">
            <tspan x="0" y="0">domains</tspan>
          </text>
          <line x1="134.1789" y1="31.5995" x2="12.9439" y2="31.5995" class="domain-bracket-thin" />
          <polyline points="15.3542 43.7521 19.7837 43.7521 19.7837 31.5995" class="domain-bracket-thin" />
        </g>

        <!-- Layer 3: Col 2 New / Edit Domain Heading -->
        <g class="domain-anim-layer domain-stagger-3">
          <text id="domainModeHeading" x="270" y="27.809" text-anchor="end" class="domain-title">
            <tspan id="domainModeHeadingText" x="270" y="27.809">new domain</tspan>
          </text>
        </g>

        <!-- Layer 4: Enter Domain Input Bracket (Left-aligned on right edge) -->
        <g id="domainEnterGroup" class="domain-anim-layer domain-stagger-4">
          <text id="placeholderEnterDomain" x="152" y="49.9564" text-anchor="start" class="domain-input-placeholder">
            <tspan x="152" y="49.9564">enter domain</tspan>
          </text>
          <polyline points="270.0837 56.6904 148.8487 56.6904 148.9168 37.9584" class="domain-bracket" />
        </g>

        <!-- Layer 5: Choose Colour Selector Bracket -->
        <g id="domainColourGroup" class="domain-anim-layer domain-stagger-5">
          <text id="placeholderChooseColour" x="267" y="83.309" text-anchor="end" class="domain-input-placeholder">
            <tspan x="267" y="83.309">choose colour</tspan>
          </text>
          <polyline points="270.0837 90.0426 148.8487 90.0426 148.9168 76.2716" class="domain-bracket" />
        </g>

        <!-- Layer 6: Done Button -->
        <g id="domainDoneGroup" class="domain-done-group domain-anim-layer domain-stagger-6">
          <text transform="translate(193.2687 120.6762)" class="domain-done-label">
            <tspan x="0" y="0">done</tspan>
          </text>
          <polyline points="148.8491 107.3322 148.8491 128.2551 270.0837 128.2552 270.0837 128.0737 270.0836 107.3324" class="domain-bracket" />
        </g>
      </svg>

      <!-- Scrollable Domain List HTML Overlay (Col 1) -->
      <div class="domain-list-scroll right-domain-list domain-anim-layer domain-stagger-2" id="domainListScroll" style="position: absolute; left: 15px; top: 34px; width: 119px; height: 122px; overflow-y: auto; overflow-x: hidden;"></div>

      <!-- HTML Interactive Inputs Overlay (Col 2) -->
      <input type="text" class="domain-html-input right-domain-name-input domain-anim-layer domain-stagger-4" id="domainNameInput" autocomplete="off" style="position: absolute; left: 150px; top: 38px; width: 120px; height: 18px;" />
      
      <!-- Color Picker Strip HTML Overlay -->
      <div class="domain-color-picker right-domain-color-picker" id="domainColorPicker" style="position: absolute; left: 150px; top: 72px; width: 120px; height: 18px; display: flex; align-items: center; justify-content: space-between;"></div>

      <!-- Done Action Button Overlay -->
      <button type="button" class="domain-done-btn right-domain-done-btn domain-anim-layer domain-stagger-6" id="domainDoneBtn" aria-label="Add new domain" style="position: absolute; left: 149px; top: 107px; width: 122px; height: 22px;"></button>
    `;
  }

  /**
   * Renders the list of domain badges using DomainType.
   * Mode: 'center' on top, 'left' on left edge, 'right' on right edge.
   */
  renderDomainList() {
    const listContainer = this.widget.querySelector('#domainListScroll');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const mode = (this.edge === 'top') ? 'center' : (this.edge === 'left' ? 'left' : 'right');

    this.domains.forEach((item) => {
      const chipEl = document.createElement('div');
      const itemKey = normalizeDomainKey(item.name);
      const isEditingThis = this.editingOriginalKey && this.editingOriginalKey === itemKey;
      chipEl.className = `domain-chip-wrapper${isEditingThis ? ' is-selected' : ''}`;
      chipEl.setAttribute('data-domain', item.name);
      chipEl.setAttribute('data-domain-key', itemKey);
      chipEl.title = isEditingThis
        ? `Click again to assign ${itemKey}`
        : `Select ${itemKey}`;

      // Multi-word domain names automatically place each word onto a new line
      const multilineText = formatMultilineDomain(item.name);

      // Use DomainType engine to compute exact layout and inward partial outline
      const comp = DomainType.compute(multilineText, {
        mode: mode,
        bgColor: item.color,
        textColor: '#030021',
        fontSize: 16
      });

      const svgHtml = DomainType.toSVG(comp);
      chipEl.innerHTML = svgHtml;

      chipEl.onclick = (e) => {
        e.stopPropagation();
        this.handleChipClick(item);
      };

      listContainer.appendChild(chipEl);
    });
  }

  handleChipClick(item) {
    const clickedKey = normalizeDomainKey(item.name);
    // Second click on the already-selected domain assigns it directly
    if (this.editingOriginalKey === clickedKey) {
      this.assignDomain(item.name, item.color);
      return;
    }

    // First click loads the existing domain into "edit domain" mode
    this.enterEditDomainMode(item);
  }

  enterEditDomainMode(item) {
    const key = normalizeDomainKey(item.name);
    this.editingOriginalKey = key;
    this.selectedColor = item.color || PRESET_COLORS[0];

    if (this.widget) {
      this.widget.classList.add('is-editing');
    }

    const headingSpan = this.widget?.querySelector('#domainModeHeadingText');
    if (headingSpan) {
      headingSpan.textContent = 'edit domain';
    }

    const input = this.widget?.querySelector('#domainNameInput');
    const placeholder = this.widget?.querySelector('#placeholderEnterDomain');
    if (input) {
      input.value = key;
    }
    if (placeholder) {
      placeholder.style.opacity = '0';
    }

    const colorPlaceholder = this.widget?.querySelector('#placeholderChooseColour');
    if (colorPlaceholder) {
      colorPlaceholder.style.fill = this.selectedColor;
      colorPlaceholder.style.opacity = '0';
    }

    this.renderColorPicker();
    this.renderDomainList();
  }

  resetToNewDomainMode() {
    this.editingOriginalKey = null;
    this.selectedColor = PRESET_COLORS[0];

    if (this.widget) {
      this.widget.classList.remove('is-editing');
    }

    const headingSpan = this.widget?.querySelector('#domainModeHeadingText');
    if (headingSpan) {
      headingSpan.textContent = 'new domain';
    }

    const input = this.widget?.querySelector('#domainNameInput');
    const placeholder = this.widget?.querySelector('#placeholderEnterDomain');
    if (input) {
      input.value = '';
    }
    if (placeholder) {
      placeholder.style.opacity = '1';
    }

    const colorPlaceholder = this.widget?.querySelector('#placeholderChooseColour');
    if (colorPlaceholder) {
      colorPlaceholder.style.fill = '#808080';
      colorPlaceholder.style.opacity = '1';
    }

    this.renderColorPicker();
    this.renderDomainList();
  }

  renderColorPicker() {
    const picker = this.widget.querySelector('#domainColorPicker');
    if (!picker) return;

    picker.innerHTML = '';

    PRESET_COLORS.forEach((color) => {
      const dot = document.createElement('div');
      dot.className = `domain-color-dot ${color === this.selectedColor ? 'is-selected' : ''}`;
      dot.style.backgroundColor = color;
      dot.setAttribute('data-color', color);
      dot.title = color;

      dot.onclick = (e) => {
        e.stopPropagation();
        this.selectedColor = color;
        this.renderColorPicker();
        const placeholder = this.widget.querySelector('#placeholderChooseColour');
        if (placeholder) {
          placeholder.style.fill = color;
        }
      };

      picker.appendChild(dot);
    });

    // Native color input for custom colors
    const nativeColorWrapper = document.createElement('label');
    nativeColorWrapper.className = 'domain-color-native-label';
    nativeColorWrapper.title = 'Custom color';
    nativeColorWrapper.innerHTML = `
      <span class="custom-color-icon">+</span>
      <input type="color" value="${this.selectedColor}" class="domain-native-color-input" />
    `;

    const nativeInput = nativeColorWrapper.querySelector('input');
    nativeInput.onchange = (e) => {
      this.selectedColor = e.target.value;
      this.renderColorPicker();
      const placeholder = this.widget.querySelector('#placeholderChooseColour');
      if (placeholder) {
        placeholder.style.fill = this.selectedColor;
      }
    };

    picker.appendChild(nativeColorWrapper);
  }

  bindInternalEvents() {
    const input = this.widget.querySelector('#domainNameInput');
    const placeholder = this.widget.querySelector('#placeholderEnterDomain');
    const doneBtn = this.widget.querySelector('#domainDoneBtn');
    const listContainer = this.widget.querySelector('#domainListScroll');

    if (listContainer) {
      listContainer.onwheel = (e) => {
        e.stopPropagation();
        listContainer.scrollTop += e.deltaY;
        e.preventDefault();
      };
    }

    if (input && placeholder) {
      const updatePlaceholder = () => {
        placeholder.style.opacity = input.value.trim().length > 0 ? '0' : '1';
      };
      input.oninput = updatePlaceholder;
      input.onchange = updatePlaceholder;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleAddDomain();
        }
      };
    }

    this.renderColorPicker();

    if (doneBtn) {
      doneBtn.onclick = (e) => {
        e.stopPropagation();
        this.handleAddDomain();
      };
    }
  }

  handleAddDomain() {
    const input = this.widget.querySelector('#domainNameInput');
    if (!input) return;

    const singleLineName = normalizeDomainKey(input.value);
    if (!singleLineName) return;

    const multilineName = formatMultilineDomain(singleLineName);
    const chosenColor = this.selectedColor || PRESET_COLORS[0];

    if (this.editingOriginalKey) {
      const originalKey = this.editingOriginalKey;
      this.updateDomain(originalKey, { name: multilineName, color: chosenColor });
      if (typeof this.onUpdateDomain === 'function') {
        this.onUpdateDomain({
          originalName: originalKey,
          name: multilineName,
          color: chosenColor
        });
      }
      this.assignDomain(singleLineName, chosenColor);
      return;
    }

    // Creating or picking in 'new domain' mode: finalize on Done click
    const existing = this.domains.find((d) => normalizeDomainKey(d.name) === singleLineName);
    let finalColor = chosenColor;
    if (!existing) {
      const newDomain = {
        name: multilineName,
        color: chosenColor
      };
      this.domains.push(newDomain);
      if (typeof this.onAddDomain === 'function') {
        this.onAddDomain(newDomain);
      }
    } else {
      finalColor = existing.color || chosenColor;
    }

    this.assignDomain(singleLineName, finalColor);
  }

  assignDomain(name, explicitColor = null) {
    const formatted = normalizeDomainKey(name);
    const found = this.domains.find((d) => normalizeDomainKey(d.name) === formatted);
    const color = explicitColor || (found ? found.color : null);
    if (typeof this.onSelect === 'function') {
      this.onSelect(formatted, color);
    }
    this.close();
  }

  selectDomain(name) {
    this.assignDomain(name);
  }

  open(addPersonRect, viewportWidth, usableHeight, initialDomainName = '') {
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    this.isOpen = true;
    this.updatePosition(addPersonRect, viewportWidth, usableHeight);

    const existingKey = normalizeDomainKey(initialDomainName);
    const matched = existingKey
      ? this.domains.find((d) => normalizeDomainKey(d.name) === existingKey)
      : null;

    if (matched) {
      this.editingOriginalKey = existingKey;
      this.selectedColor = matched.color || PRESET_COLORS[0];
    } else {
      this.editingOriginalKey = null;
      this.selectedColor = PRESET_COLORS[0];
    }

    // Render in closed initial animation state first so border draw-in & stagger transitions fire cleanly
    this.render(false);
    if (matched) {
      this.enterEditDomainMode(matched);
    } else {
      this.resetToNewDomainMode();
    }
    this.widget.style.display = 'block';

    // Force layout flush so the closed start state is committed before adding .is-open
    void this.widget.offsetWidth;

    // Trigger exact After Effects draw-in + staggered layer reveal
    requestAnimationFrame(() => {
      if (this.widget && this.isOpen) {
        this.widget.classList.add('is-open');
      }
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.widget) {
      this.widget.classList.remove('is-open');
      this._closeTimer = setTimeout(() => {
        if (!this.isOpen && this.widget) {
          this.widget.style.display = 'none';
        }
      }, 320);
    }
  }

  toggle(addPersonRect, viewportWidth, usableHeight) {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(addPersonRect, viewportWidth, usableHeight);
    }
  }

  bindGlobalEvents() {
    if (this._hasGlobalClick) return;
    this._hasGlobalClick = true;

    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      // Do not close if clicking inside domain widget or inside AddPerson widget
      if (this.widget && this.widget.contains(e.target)) return;
      const addPersonWidget = document.getElementById('addPersonWidget');
      if (addPersonWidget && addPersonWidget.contains(e.target)) return;

      this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  destroy() {
    if (this.widget && this.widget.parentNode) {
      this.widget.parentNode.removeChild(this.widget);
    }
  }
}
