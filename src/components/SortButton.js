/**
 * SortButton Component (16pt Redesign + DomainType Chips)
 * Supports dynamic rendering, revolving around edges, and choreographed expansion across:
 *  - Top Edge:   79.40 × 29.46 px (closed) -> 134.10 × 293.41 px (expanded)
 *  - Left Edge:  29.46 × 79.40 px (closed) -> 355.98 × 114.40 px (expanded)
 *  - Right Edge: 29.46 × 79.40 px (closed) -> 355.98 × 114.40 px (expanded)
 *
 * Keeps exact AE expansion timing, motion graphs, gradual bold thickening of "sort",
 * zero-bounce left edge bottom anchoring, and live DOM border tracking.
 */

import DomainType from '../engine/domainType.js';
import { INITIAL_DOMAINS } from './DomainPanel.js';

export class SortButton {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.edge = options.edge || 'right'; // 'top' | 'left' | 'right'
    this.isExpanded = false;
    this.emptyMode = Boolean(options.emptyMode);
    this.onBeforeOpen = options.onBeforeOpen || null;
    this.onSortChange = options.onSortChange || null;

    // Shared domain list (synced with DomainPanel)
    this.domains = this.emptyMode ? [] : [...INITIAL_DOMAINS];

    // Persisted selected state across edge rotations
    this.selectedOptions = {
      sortBy: null, // 'name' | 'domains' | 'date-added' | null
      domains: new Set() // selected domain keys
    };

    this.init();
  }

  init() {
    this.render();
    this.cacheElements();
    this.renderDomainChips();
    this.bindEvents();
    this.syncSelection();
    this.updateBorderPoints();
  }

  addDomain(domainObj) {
    if (!domainObj || !domainObj.name) return;
    const norm = domainObj.name.replace(/\s+/g, ' ').trim().toLowerCase();
    const exists = this.domains.some(
      (d) => d.name.replace(/\s+/g, ' ').trim().toLowerCase() === norm
    );
    if (!exists) {
      this.domains.push({ name: domainObj.name, color: domainObj.color });
      this.renderDomainChips();
      this.syncSelection();
    }
  }

  setEdge(edge) {
    if (this.edge === edge) return;
    const wasExpanded = this.isExpanded;
    if (wasExpanded) {
      this.close(true);
    }
    this.edge = edge;

    // Suppress CSS transitions during corner transition so it snaps cleanly
    if (this.widget) {
      this.widget.classList.add('no-transition');

      if (edge === 'right') {
        this.widget.style.left = 'auto';
        this.widget.style.right = '0px';
        this.widget.style.bottom = 'auto';
      } else if (edge === 'left') {
        this.widget.style.left = '0px';
        this.widget.style.right = 'auto';
        this.widget.style.top = 'auto';
      } else if (edge === 'top') {
        this.widget.style.top = '0px';
        this.widget.style.right = 'auto';
        this.widget.style.bottom = 'auto';
      }
    }

    this.render();
    this.cacheElements();
    this.renderDomainChips();
    this.bindEvents();
    this.syncSelection();
    this.updateBorderPoints();

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
      this.widget.id = 'sortWidget';
      this.container.appendChild(this.widget);
    }

    const hasNoTransition = this.widget.classList.contains('no-transition');
    this.widget.className = `sort-widget is-edge-${this.edge}${this.isExpanded ? ' is-expanded' : ''}${hasNoTransition ? ' no-transition' : ''}`;
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
     TOP EDGE TEMPLATE (134.10 × 293.41 px) — matches new__sort top edge.svg
  ------------------------------------------------------------- */
  renderTopEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="sort-outer-svg" id="sortOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="sortBorderLine" 
          class="sort-border-line" 
          points="78.6522 10.5404 78.6522 27.9967 .75 28.0268 .75 0" 
        />
        <text 
          id="sortSvgText" 
          class="sort-header-text"
          transform="translate(7.4882 19.3559)" 
        >
          <tspan x="0" y="0">sort</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar -->
      <div class="sort-header" id="sortHeader" title="Click to sort" aria-label="Sort"></div>

      <!-- Expandable Sort Options Content -->
      <div class="sort-content is-top-content" id="sortContent">
        <svg class="sort-inner-svg" viewBox="0 0 134.1015 293.414" xmlns="http://www.w3.org/2000/svg">
          <!-- Section 1: sort by -->
          <g class="sort-layer sort-stagger-1">
            <polyline points="119.0382 47.8077 119.0386 120.1877 15.0562 120.1866 15.0562 47.8077" class="inner-bracket"/>
            <text transform="translate(42.5954 53.5219)" class="sort-section-title"><tspan x="0" y="0">sort by</tspan></text>
          </g>

          <!-- Option: name -->
          <g class="sort-option-row sort-layer sort-stagger-2" data-option="name" data-group="sortBy">
            <path class="sort-tick-rect" d="M41.6703,74.0809v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="41.4203 75.0809 50.5006 75.0809"/>
            <text transform="translate(54.4878 73.9518)" class="sort-option-label"><tspan x="0" y="0">name</tspan></text>
            <rect class="sort-option-hitbox" x="18" y="61" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: domains -->
          <g class="sort-option-row sort-layer sort-stagger-3" data-option="domains" data-group="sortBy">
            <path class="sort-tick-rect" d="M31.0095,90.9083v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="30.7595 91.9083 39.8398 91.9083"/>
            <text transform="translate(44.2541 90.9081)" class="sort-option-label"><tspan x="0" y="0">domains</tspan></text>
            <rect class="sort-option-hitbox" x="18" y="78" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: date added -->
          <g class="sort-option-row sort-layer sort-stagger-4" data-option="date-added" data-group="sortBy">
            <path class="sort-tick-rect" d="M21.3583,107.7368v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="21.1083 108.7368 30.1886 108.7368"/>
            <text transform="translate(34.6569 107.6908)" class="sort-option-label"><tspan x="0" y="0">date added</tspan></text>
            <rect class="sort-option-hitbox" x="18" y="95" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Section 2: domains -->
          <g class="sort-layer sort-stagger-5">
            <polyline points="15.0562 142.7429 15.0562 278.3512 119.0386 278.3512 119.0386 141.8414" class="inner-bracket"/>
            <line x1="15.0562" y1="152.0009" x2="119.0386" y2="152.0009" class="inner-divider-thin"/>
            <polyline points="27.2087 152.0009 27.2087 156.4304 15.0562 156.4304" class="inner-divider-thin"/>
            <text transform="translate(28.3551 149.9486)" class="sort-domains-title-large"><tspan x="0" y="0">domains</tspan></text>
          </g>
        </svg>

        <!-- Scrollable DomainType Chips (Centered stack) -->
        <div class="sort-domains-list sort-domains-top sort-layer sort-stagger-6" id="sortDomainsList" style="position: absolute; left: 17px; top: 155px; width: 100px; height: 121px;"></div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     LEFT EDGE TEMPLATE (360.94 × 114.40 px) — matches panel_sort left edge.svg
  ------------------------------------------------------------- */
  renderLeftEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="sort-outer-svg" id="sortOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="sortBorderLine" 
          class="sort-border-line" 
          points="10.5404 .75 27.9967 .75 28.0268 78.6522 0 78.6522" 
        />
        <text 
          id="sortSvgText" 
          class="sort-header-text"
          transform="translate(19.3559 71.9141) rotate(-90)" 
        >
          <tspan x="0" y="0">sort</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar (Vertical strip on left edge) -->
      <div class="sort-header is-vertical is-left" id="sortHeader" title="Click to sort" aria-label="Sort"></div>

      <!-- Expandable Sort Options Content -->
      <div class="sort-content is-left-content" id="sortContent">
        <svg class="sort-inner-svg" viewBox="0 0 360.9404 114.3995" xmlns="http://www.w3.org/2000/svg">
          <!-- Section 1: sort by (title left-aligned, vertical bracket on right) -->
          <g class="sort-layer sort-stagger-1">
            <polyline points="144.4259 15.0892 144.4259 99.3102 40.0555 99.3103" class="inner-bracket"/>
            <text transform="translate(40.4409 28.8521)" class="sort-section-title"><tspan x="0" y="0">sort by</tspan></text>
          </g>

          <!-- Option: name -->
          <g class="sort-option-row sort-layer sort-stagger-2" data-option="name" data-group="sortBy">
            <text transform="translate(87.3592 49.1268)" class="sort-option-label"><tspan x="0" y="0">name</tspan></text>
            <path class="sort-tick-rect" d="M130.2282,49.2559v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="129.9782 50.2559 139.0585 50.2559"/>
            <rect class="sort-option-hitbox" x="42" y="37" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: domains -->
          <g class="sort-option-row sort-layer sort-stagger-3" data-option="domains" data-group="sortBy">
            <text transform="translate(66.4639 66.083)" class="sort-option-label"><tspan x="0" y="0">domains</tspan></text>
            <path class="sort-tick-rect" d="M130.2282,66.0833v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="129.9782 67.0833 139.0585 67.0833"/>
            <rect class="sort-option-hitbox" x="42" y="54" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: date added -->
          <g class="sort-option-row sort-layer sort-stagger-4" data-option="date-added" data-group="sortBy">
            <text transform="translate(47.2163 82.8657)" class="sort-option-label"><tspan x="0" y="0">date added</tspan></text>
            <path class="sort-tick-rect" d="M130.2282,82.8655v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="129.9782 83.8655 139.0585 83.8655"/>
            <rect class="sort-option-hitbox" x="42" y="71" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Section 2: domains (title left-aligned, vertical bracket on right) -->
          <g class="sort-layer sort-stagger-5">
            <polyline points="346.8291 15.0892 346.8303 99.3102 158.6611 99.3103" class="inner-bracket"/>
            <line x1="158.6311" y1="31.1111" x2="346.8303" y2="31.1111" class="inner-divider-thin"/>
            <text transform="translate(158.6611 28.8071)" class="sort-section-title"><tspan x="0" y="0">domains</tspan></text>
          </g>
        </svg>

        <!-- Scrollable DomainType Chips (2-col right-aligned grid) -->
        <div class="sort-domains-list sort-domains-left sort-layer sort-stagger-6" id="sortDomainsList" style="position: absolute; left: 162px; top: 34px; width: 181px; height: 63px;"></div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     RIGHT EDGE TEMPLATE (360.94 × 114.40 px) — matches panel_sort right edge.svg
  ------------------------------------------------------------- */
  renderRightEdge() {
    this.widget.innerHTML = `
      <!-- Outer Dynamic Border SVG -->
      <svg class="sort-outer-svg" id="sortOuterSvg" xmlns="http://www.w3.org/2000/svg">
        <polyline 
          id="sortBorderLine" 
          class="sort-border-line" 
          points="18.9150 78.6522 0.7500 78.6522 0.7500 0.7500 29.4553 0.7500" 
        />
        <text 
          id="sortSvgText" 
          class="sort-header-text"
          transform="translate(10.1006 7.4881) rotate(90)" 
        >
          <tspan x="0" y="0">sort</tspan>
        </text>
      </svg>

      <!-- Clickable Header Bar (Vertical strip on right edge) -->
      <div class="sort-header is-vertical is-right" id="sortHeader" title="Click to sort" aria-label="Sort"></div>

      <!-- Expandable Sort Options Content -->
      <div class="sort-content is-right-content" id="sortContent">
        <svg class="sort-inner-svg" viewBox="0 0 360.9398 114.3995" xmlns="http://www.w3.org/2000/svg">
          <!-- Section 1: sort by (title right-aligned, vertical bracket on left) -->
          <g class="sort-layer sort-stagger-1">
            <polyline points="14.6168 15.0892 14.6168 99.3102 118.9872 99.3103" class="inner-bracket"/>
            <text transform="translate(70.1078 28.8519)" class="sort-section-title"><tspan x="0" y="0">sort by</tspan></text>
          </g>

          <!-- Option: name -->
          <g class="sort-option-row sort-layer sort-stagger-2" data-option="name" data-group="sortBy">
            <path class="sort-tick-rect" d="M20.5189,49.3565v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="20.2689 50.3565 29.3492 50.3565"/>
            <text transform="translate(32.9423 49.392)" class="sort-option-label"><tspan x="0" y="0">name</tspan></text>
            <rect class="sort-option-hitbox" x="16" y="37" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: domains -->
          <g class="sort-option-row sort-layer sort-stagger-3" data-option="domains" data-group="sortBy">
            <path class="sort-tick-rect" d="M20.5189,66.1839v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="20.2689 67.1839 29.3492 67.1839"/>
            <text transform="translate(33.2411 66.184)" class="sort-option-label"><tspan x="0" y="0">domains</tspan></text>
            <rect class="sort-option-hitbox" x="16" y="54" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Option: date added -->
          <g class="sort-option-row sort-layer sort-stagger-4" data-option="date-added" data-group="sortBy">
            <path class="sort-tick-rect" d="M20.5189,82.9662v-8.5803h8.5803v8.5803h-8.5803Z"/>
            <polyline class="sort-tick-underline" points="20.2689 83.9662 29.3492 83.9662"/>
            <text transform="translate(33.2411 82.9662)" class="sort-option-label"><tspan x="0" y="0">date added</tspan></text>
            <rect class="sort-option-hitbox" x="16" y="71" width="98" height="16" fill="transparent"/>
          </g>

          <!-- Section 2: domains (title right-aligned, vertical bracket on left) -->
          <g class="sort-layer sort-stagger-5">
            <polyline points="133.2235 15.0892 133.2224 99.3102 321.3916 99.3103" class="inner-bracket"/>
            <line x1="133.1924" y1="31.1111" x2="321.3916" y2="31.1111" class="inner-divider-thin"/>
            <text transform="translate(260.3671 28.807)" class="sort-section-title"><tspan x="0" y="0">domains</tspan></text>
          </g>
        </svg>

        <!-- Scrollable DomainType Chips (2-col left-aligned grid) -->
        <div class="sort-domains-list sort-domains-right sort-layer sort-stagger-6" id="sortDomainsList" style="position: absolute; left: 138px; top: 34px; width: 181px; height: 63px;"></div>
      </div>
    `;
  }

  /**
   * Renders DomainType colored chips inside the Sort panel's domains section:
   *  - Top edge: 'center' mode (vertical centered list)
   *  - Left edge: 'left' mode (bottom+right outline, 2-col right-aligned grid)
   *  - Right edge: 'right' mode (bottom+left outline, 2-col left-aligned grid)
   */
  renderDomainChips() {
    if (!this.widget) return;
    const listContainer = this.widget.querySelector('#sortDomainsList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const mode = this.edge === 'top' ? 'center' : (this.edge === 'left' ? 'left' : 'right');

    // Match the exact ordering shown in the 16pt SVGs for left/right 2-col grid vs top list
    const orderedDomains = this.edge === 'top'
      ? this.domains
      : this.getGridOrderedDomains();

    orderedDomains.forEach((item) => {
      const optionKey = item.name.replace(/\s+/g, ' ').trim().toLowerCase();
      const chipEl = document.createElement('div');
      chipEl.className = 'sort-option-row sort-domain-chip';
      chipEl.setAttribute('data-option', optionKey);
      chipEl.setAttribute('data-group', 'domains');
      chipEl.title = `Filter by ${optionKey}`;

      const comp = DomainType.compute(item.name, {
        mode,
        align: mode === 'center' ? 'center' : 'left',
        outlineWidth: 0.5,
        bgColor: item.color,
        textColor: '#030021',
        fontSize: 16
      });
      chipEl.innerHTML = DomainType.toSVG(comp);
      listContainer.appendChild(chipEl);
    });
  }

  /**
   * For Left & Right 2-column grids, places taller 2-line chips on row 1 (music composers, web designer)
   * and 1-line chips on row 2 (artists, copywriters) matching new__sort left/right edge SVGs,
   * followed by any custom user-added domains.
   */
  getGridOrderedDomains() {
    const byKey = new Map();
    this.domains.forEach((d) => {
      byKey.set(d.name.replace(/\s+/g, ' ').trim().toLowerCase(), d);
    });
    const preferredOrder = ['music composers', 'web designer', 'artists', 'copywriters'];
    const result = [];
    const seen = new Set();
    preferredOrder.forEach((k) => {
      if (byKey.has(k)) {
        result.push(byKey.get(k));
        seen.add(k);
      }
    });
    this.domains.forEach((d) => {
      const k = d.name.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!seen.has(k)) result.push(d);
    });
    return result;
  }

  cacheElements() {
    this.borderLine = this.widget.querySelector('#sortBorderLine');
    this.header = this.widget.querySelector('#sortHeader');
    this.content = this.widget.querySelector('#sortContent');
    this.svgText = this.widget.querySelector('#sortSvgText');
    if (this.svgText) {
      this.svgText.style.stroke = '#000000';
      this.svgText.style.paintOrder = 'stroke fill';
      this.svgText.style.strokeLinejoin = 'round';
      this.svgText.style.strokeLinecap = 'round';
      this.svgText.style.strokeWidth = this.isExpanded ? '0.85px' : '0px';
    }
  }

  bindEvents() {
    this.widget.onclick = (e) => {
      // If closed, click expands
      if (!this.isExpanded) {
        this.open();
        return;
      }

      // If clicked on an option row or domain chip, toggle it
      const optionRow = e.target.closest('.sort-option-row');
      if (optionRow) {
        const option = optionRow.getAttribute('data-option');
        const group = optionRow.getAttribute('data-group');
        this.toggleOption(group, option);
        return;
      }

      // If clicked on header bar, "sort" text, or header strip, close and contract
      if (
        (this.header && (e.target === this.header || this.header.contains(e.target))) ||
        (this.svgText && (e.target === this.svgText || this.svgText.contains(e.target))) ||
        (e.target && e.target.closest && (e.target.closest('#sortHeader') || e.target.closest('#sortSvgText') || e.target.closest('#sortOuterSvg')))
      ) {
        this.close();
        return;
      }

      // Coordinate check: clicking anywhere in the header strip closes and contracts
      const rect = this.widget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      if (
        (this.edge === 'top' && clickY <= 32) ||
        (this.edge === 'left' && clickX <= 32) ||
        (this.edge === 'right' && clickX >= rect.width - 32)
      ) {
        this.close();
        return;
      }
    };

    // Outside click closes panel
    if (!this._hasGlobalClick) {
      this._hasGlobalClick = true;
      document.addEventListener('click', (e) => {
        if (this.isExpanded && this.widget && !this.widget.contains(e.target)) {
          this.close();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isExpanded) {
          this.close();
        }
      });
      window.addEventListener('nopitac:component-opened', (e) => {
        if (e.detail && e.detail.component !== 'sort' && this.isExpanded) {
          this.close();
        }
      });
    }
  }

  toggleOption(group, option) {
    if (group === 'sortBy') {
      // Radio selection for sort by
      this.selectedOptions.sortBy = (this.selectedOptions.sortBy === option) ? null : option;
    } else if (group === 'domains') {
      // Toggle multi-select for domains
      if (this.selectedOptions.domains.has(option)) {
        this.selectedOptions.domains.delete(option);
      } else {
        this.selectedOptions.domains.add(option);
      }
    }

    this.syncSelection();

    if (typeof this.onSortChange === 'function') {
      this.onSortChange({
        sortBy: this.selectedOptions.sortBy,
        domains: Array.from(this.selectedOptions.domains)
      });
    }
  }

  syncSelection() {
    if (!this.widget) return;
    const rows = this.widget.querySelectorAll('.sort-option-row');
    rows.forEach((row) => {
      const option = row.getAttribute('data-option');
      const group = row.getAttribute('data-group');
      let isSel = false;
      if (group === 'sortBy') {
        isSel = this.selectedOptions.sortBy === option;
      } else if (group === 'domains') {
        isSel = this.selectedOptions.domains.has(option);
      }

      if (isSel) {
        row.classList.add('is-selected');
      } else {
        row.classList.remove('is-selected');
      }
    });
  }

  /**
   * Sets exact vector polyline points and header text for given w and h.
   * Live DOM tracking ensures zero gap against screen edge and zero bounce.
   */
  renderBorderPointsFor(w, h) {
    if (!this.borderLine) return;

    if (this.edge === 'top') {
      const t = Math.min(1, Math.max(0, (h - 29.4567) / (293.414 - 29.4567)));
      const stubY = 10.5404 + (19.3558 - 10.5404) * t;
      const rightX = (w - 0.75).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      this.borderLine.setAttribute('points', `${rightX} ${stubY.toFixed(4)} ${rightX} ${bottomY} 0.7500 ${bottomY} 0.7500 0`);
      if (this.svgText) {
        const textX = this.isExpanded ? 7.0085 : 7.4882;
        this.svgText.setAttribute('transform', `translate(${textX} 19.3559)`);
      }
    } else if (this.edge === 'left') {
      const t = Math.min(1, Math.max(0, (w - 29.4562) / (360.9404 - 29.4562)));
      const stubX = 10.5404 + (16.9293 - 10.5404) * t;
      const rightX = (w - 0.75).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      this.borderLine.setAttribute('points', `${stubX.toFixed(4)} 0.7500 ${rightX} 0.7500 ${rightX} ${bottomY} 0 ${bottomY}`);
      if (this.svgText) {
        const textX = (19.3559 + (16.9287 - 19.3559) * t).toFixed(4);
        const textY = (h - (7.4881 + (6.6841 - 7.4881) * t)).toFixed(4);
        this.svgText.setAttribute('transform', `translate(${textX} ${textY}) rotate(-90)`);
      }
    } else if (this.edge === 'right') {
      const t = Math.min(1, Math.max(0, (w - 29.4553) / (360.9398 - 29.4553)));
      const notchStub = 10.5403 + (16.9287 - 10.5403) * t;
      const notchX = (w - notchStub).toFixed(4);
      const bottomY = (h - 0.75).toFixed(4);
      const rightX = w.toFixed(4);
      this.borderLine.setAttribute('points', `${notchX} ${bottomY} 0.7500 ${bottomY} 0.7500 0.7500 ${rightX} 0.7500`);
      if (this.svgText) {
        const textX = (w - (19.3558 + (16.9287 - 19.3558) * t)).toFixed(4);
        const textY = (7.4881 + (6.6846 - 7.4881) * t).toFixed(4);
        this.svgText.setAttribute('transform', `translate(${textX} ${textY}) rotate(90)`);
      }
    }
  }

  updateBorderPoints() {
    let w, h;
    if (this.edge === 'top') {
      w = this.isExpanded ? 134.1015 : 79.4022;
      h = this.isExpanded ? 293.414 : 29.4567;
    } else if (this.edge === 'left') {
      w = this.isExpanded ? 360.9404 : 29.4562;
      h = this.isExpanded ? 114.3995 : 79.4022;
    } else if (this.edge === 'right') {
      w = this.isExpanded ? 360.9398 : 29.4553;
      h = this.isExpanded ? 114.3995 : 79.4022;
    }
    this.renderBorderPointsFor(w, h);
  }

  animateBorder(opening = true) {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    const startTime = performance.now();
    const duration = opening ? 417 : 280;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const p = Math.min(1, elapsed / duration);

      if (this.widget) {
        const box = this.widget.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          this.renderBorderPointsFor(box.width, box.height);
        }
      }

      if (this.svgText) {
        // Continuous, smooth font-weight thickening from regular (0px stroke) to bold (0.85px stroke)
        const t = p;
        const eased = opening
          ? 1 - Math.pow(1 - t, 2.8)
          : Math.pow(1 - t, 2.5);
        const strokeVal = 0.85 * eased;
        this.svgText.style.strokeWidth = `${Math.max(0, strokeVal).toFixed(4)}px`;
      }

      if (p < 1) {
        this._animFrameId = requestAnimationFrame(tick);
      } else {
        this._animFrameId = null;
        if (this.svgText) {
          this.svgText.style.strokeWidth = opening ? '0.85px' : '0px';
        }
        this.updateBorderPoints();
      }
    };

    this._animFrameId = requestAnimationFrame(tick);
  }

  open() {
    if (this.isExpanded) return;
    if (typeof this.onBeforeOpen === 'function') {
      this.onBeforeOpen();
    }
    this.isExpanded = true;
    window.dispatchEvent(new CustomEvent('nopitac:component-opened', { detail: { component: 'sort' } }));

    // Strict edge anchoring and bounding clamp
    if (this.edge === 'right') {
      this.widget.style.left = 'auto';
      this.widget.style.right = '0px';
      this.widget.style.bottom = 'auto';
      const curTop = parseFloat(this.widget.style.top) || 0;
      const maxTop = Math.max(0, window.innerHeight - 80 - 115);
      if (curTop > maxTop) {
        this.widget.style.top = `${maxTop}px`;
      }
    } else if (this.edge === 'left') {
      this.widget.style.left = '0px';
      this.widget.style.right = 'auto';
      this.widget.style.top = 'auto';
      const curBottom = parseFloat(this.widget.style.bottom);
      if (!isNaN(curBottom)) {
        const maxBottom = window.innerHeight - 114.40 - 5;
        if (curBottom > maxBottom) {
          this.widget.style.bottom = `${maxBottom.toFixed(4)}px`;
        }
      }
    } else if (this.edge === 'top') {
      this.widget.style.top = '0px';
      this.widget.style.bottom = 'auto';
      this.widget.style.right = 'auto';
      const curLeft = parseFloat(this.widget.style.left) || 0;
      const maxLeft = Math.max(0, window.innerWidth - 135);
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
    this.isExpanded = false;
    this.widget.classList.remove('is-expanded');
    this.widget.setAttribute('aria-expanded', 'false');

    if (immediate) {
      if (this._animFrameId) {
        cancelAnimationFrame(this._animFrameId);
        this._animFrameId = null;
      }
      if (this.svgText) {
        this.svgText.style.strokeWidth = '0px';
      }
      this.widget.classList.add('no-transition');
      this.updateBorderPoints();
      void this.widget.offsetWidth;
      this.widget.classList.remove('no-transition');
    } else {
      this.animateBorder(false);
    }
  }

  toggle() {
    if (this.isExpanded) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy() {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this.widget && this.widget.parentNode) {
      this.widget.parentNode.removeChild(this.widget);
    }
  }
}
