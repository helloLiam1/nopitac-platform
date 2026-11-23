/**
 * CommunityApp - Interactive Community Page Application
 * Pixel-accurate implementation of Illustrator artboards:
 *  - community page no guides.svg
 *  - community page_with guides.svg
 *  - name box no guides.svg
 *  - button__your board.svg
 *
 * Rules:
 *  - Username rendered in Nopitac Helvetica 36px, -25 kerning with continuous signature underline.
 *  - Three containers per user row: (1) Icon & Name, (2) Domains list, (3) Number of people.
 *  - Domains styled in 28pt Helvetica Neue Regular (-25 kerning) using DomainType Left setting.
 *  - Number of people styled in 18pt Helvetica Neue Bold (-25 kerning).
 *  - Dwell hover tooltip appears near cursor after hovering for ~400ms on domains or count.
 *  - Revolving "your board" button moves along Left -> Top -> Right edges (1:1 scroll responsiveness)
 *    and skips bottom edge at y = 800.82px where the fixed bottom bar lives.
 *  - Clicking any username routes to their board (/board.html?user=<name>&mode=empty).
 */

import { NopitacRenderer, FONT_SIZE } from './engine/nopitacRenderer.js';
import DomainType from './engine/domainType.js';

const COMMUNITY_USERS = [
  {
    name: 'henry who',
    composition: 'circle',
    domains: [
      { name: 'artists', color: '#27ff83' },
      { name: 'copywriters', color: '#d8ff2a' },
      { name: 'music\ncomposers', color: '#f5003a' },
      { name: 'web\ndesigner', color: '#6a76ff' }
    ],
    peopleCount: 21
  }
];

export class CommunityApp {
  constructor() {
    this.viewport = document.getElementById('communityViewport');
    this.listContainer = document.getElementById('communityList');
    this.scrollContainer = document.getElementById('communityScrollContainer');
    this.tooltipEl = document.getElementById('communityTooltip');
    this.btnElement = null;

    this.nameRenderer = new NopitacRenderer(null);

    // Track state for revolving "your board" button
    this.scrollOffset = 0;
    this.targetScrollOffset = 0;
    this.isTicking = false;
    this.buttonConfig = {
      id: 'your-board',
      label: 'your board',
      length: 198.3979,
      breadth: 38.9074,
      initialTau: 0, // Computed dynamically based on 179.23px on top edge
      currentEdge: 'top'
    };

    // Tooltip dwell timer
    this.tooltipTimer = null;
    this.currentMousePos = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.measureDimensions();
    this.renderCommunityUsers();
    this.createRevolvingButton();
    this.setupUserSignature();
    this.bindEvents();
    this.updateButton();
  }

  measureDimensions() {
    this.viewportWidth = window.innerWidth || 1440;
    this.viewportHeight = window.innerHeight || 900;
    // Bounded at the bottom guideline at y = 800.82px
    this.bottomBarY = Math.max(300, this.viewportHeight - 99.1784);
    this.usableHeight = this.bottomBarY;

    // Track segments: Left (up) -> Top (right) -> Right (down)
    const L = this.buttonConfig.length;
    this.segLeft = Math.max(100, this.usableHeight - L);
    this.segTop = Math.max(100, this.viewportWidth - L);
    this.segRight = Math.max(100, this.usableHeight - L);
    this.trackLength = this.segLeft + this.segTop + this.segRight;
  }

  /**
   * Generates the composition icons matching Illustrator vector fidelity
   */
  getCompositionIconSvg(type) {
    if (type === 'circle') {
      return `
        <svg width="56" height="56" viewBox="0 0 62 62">
          <circle cx="31" cy="31" r="30.1208" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/>
          <circle cx="31" cy="31" r="14.2069" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/>
        </svg>
      `;
    } else if (type === 'square') {
      return `
        <svg width="56" height="56" viewBox="0 0 56 56">
          <rect x="0.5" y="0.5" width="55" height="55" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/>
          <rect x="15.4" y="15.4" width="25.2" height="25.2" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/>
        </svg>
      `;
    } else {
      // 16 horizontal parallel lines
      const lines = [];
      for (let i = 0; i < 16; i++) {
        const y = (i * 3.48 + 1.7).toFixed(2);
        lines.push(`<line x1="0" y1="${y}" x2="56" y2="${y}" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/>`);
      }
      return `
        <svg width="56" height="56" viewBox="0 0 56 56">
          ${lines.join('')}
        </svg>
      `;
    }
  }

  /**
   * Generates DomainType Left-mode chip matching Illustrator specs:
   *  - 28pt (29.33px) Helvetica Neue Regular (-25 tracking)
   *  - Colored rectangle box
   *  - Outline: 0.5px black polyline covering bottom edge + entire right edge
   */
  getDomainChipSvg(domain) {
    const lines = domain.name.split('\n');
    const isMultiLine = lines.length > 1;
    const fontSize = 29.33;
    const textColor = domain.textColor || '#030021';
    const bgColor = domain.color;

    // Use DomainType engine to compute exact metrics
    const comp = DomainType.compute(domain.name, {
      mode: 'left',
      fontSize: fontSize,
      bgColor: bgColor,
      textColor: textColor,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif"
    });

    const w = comp.box.width.toFixed(2);
    const h = comp.box.height.toFixed(2);
    const outlineD = comp.outline.pathD;

    return `
      <svg width="${w}" height="${h}" viewBox="${comp.box.x.toFixed(2)} ${comp.box.y.toFixed(2)} ${w} ${h}">
        <rect x="${comp.box.x.toFixed(2)}" y="${comp.box.y.toFixed(2)}" width="${w}" height="${h}" fill="${bgColor}" />
        <text style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: ${fontSize}px; font-weight: 400; letter-spacing: -0.025em; fill: ${textColor};">
          ${comp.lines.map((l) => `<tspan x="${l.x.toFixed(2)}" y="${l.baselineY.toFixed(2)}">${l.text}</tspan>`).join('')}
        </text>
        <path d="${outlineD}" fill="none" stroke="#000000" stroke-width="0.5" stroke-miterlimit="10" />
      </svg>
    `;
  }

  renderCommunityUsers() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    COMMUNITY_USERS.forEach((user) => {
      const row = document.createElement('div');
      row.className = 'community-row-box';
      row.setAttribute('data-username', user.name);

      // 1. Container 1: Icon and Username (rendered in authentic Nopitac Helvetica with underline)
      const iconSvg = this.getCompositionIconSvg(user.composition);
      const renderedName = this.nameRenderer.render(user.name, 0);
      const targetScale = 36 / FONT_SIZE;
      
      // Extract clean vector artwork without selectable text or nested svg
      const cleanArtwork = (renderedName.svgString || '')
        .replace(/<svg\b[^>]*>/i, '')
        .replace(/<\/svg>\s*$/i, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<text\b[^>]*class="nopitac-selectable-text"[\s\S]*?<\/text>/gi, '')
        .trim();

      // Tight bounding box for henry who: optical center Y = -10, centered vertically
      const nameW = Math.round(204 * targetScale);
      const nameH = Math.round(48 * targetScale);
      const nameSvg = `
        <svg viewBox="0 -34 204 48" width="${nameW}" height="${nameH}" class="community-username-svg">
          ${cleanArtwork}
        </svg>
      `;

      // 2. Container 2: Domain chips (no guide blocks, pure spacing between chips)
      const domainsHtml = user.domains
        .map((d) => {
          const chipSvg = this.getDomainChipSvg(d);
          const cleanName = d.name.replace(/\n+/g, ' ');
          return `
            <div class="community-domain-chip" data-tooltip="domain: ${cleanName}">
              ${chipSvg}
            </div>
          `;
        })
        .join('');

      row.innerHTML = `
        <!-- Container 1: Icon & Name -->
        <div class="community-col-user" title="Open ${user.name}'s board" role="button" tabindex="0">
          <div class="community-user-icon">${iconSvg}</div>
          <div class="community-username-wrap">${nameSvg}</div>
        </div>

        <!-- Container 2: Domains -->
        <div class="community-col-domains">
          <div class="community-domains-flex">
            ${domainsHtml}
          </div>
        </div>

        <!-- Container 3: Number of People -->
        <div class="community-col-count" data-tooltip="${user.peopleCount} people in board">
          <span class="community-count-text">${user.peopleCount}</span>
        </div>
      `;

      // Clicking username routes to their board
      const userCol = row.querySelector('.community-col-user');
      const targetUrl = user.name === 'henry who'
        ? `/board.html?user=${encodeURIComponent(user.name)}`
        : `/board.html?user=${encodeURIComponent(user.name)}&mode=empty`;

      userCol.addEventListener('click', () => {
        window.location.href = targetUrl;
      });
      userCol.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.href = targetUrl;
        }
      });

      this.listContainer.appendChild(row);
    });

    this.bindTooltips();
  }

  createRevolvingButton() {
    const cfg = this.buttonConfig;
    const btn = document.createElement('div');
    btn.className = `community-revolving-btn btn-${cfg.id}`;
    btn.id = `communityBtn_${cfg.id}`;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', cfg.label);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/board.html';
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = '/board.html';
      }
    });

    this.viewport.appendChild(btn);
    this.btnElement = btn;
  }

  setupUserSignature() {
    let username = 'new user';
    try {
      const stored = localStorage.getItem('nopitac_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user && user.name) username = user.name;
        else if (user && user.email) username = user.email.split('@')[0];
      }
    } catch (e) {}

    const nameEl = document.getElementById('communityUserName');
    if (nameEl) {
      nameEl.textContent = username;
    }
  }

  bindEvents() {
    // Wheel / scroll event drives revolving button
    const onWheel = (e) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 20;
      else if (e.deltaMode === 2) dy *= window.innerHeight;

      this.targetScrollOffset += dy;
      this.requestTick();
    };
    window.addEventListener('wheel', onWheel, { passive: true });

    // Touch swipe
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const dy = touchStartY - e.touches[0].clientY;
        touchStartY = e.touches[0].clientY;
        this.targetScrollOffset += dy;
        this.requestTick();
      }
    }, { passive: true });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        this.targetScrollOffset += 60;
        this.requestTick();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        this.targetScrollOffset -= 60;
        this.requestTick();
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.measureDimensions();
      this.updateButton();
    });

    // Track mouse coordinates for tooltip
    window.addEventListener('mousemove', (e) => {
      this.currentMousePos.x = e.clientX;
      this.currentMousePos.y = e.clientY;
      if (this.tooltipEl && this.tooltipEl.classList.contains('is-visible')) {
        this.positionTooltip(e.clientX, e.clientY);
      }
    });
  }

  bindTooltips() {
    const tooltipTargets = document.querySelectorAll('[data-tooltip]');
    tooltipTargets.forEach((target) => {
      target.addEventListener('mouseenter', (e) => {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        // Clear any existing timer
        if (this.tooltipTimer) clearTimeout(this.tooltipTimer);

        // Dwell duration: 400ms before appearing
        this.tooltipTimer = setTimeout(() => {
          this.showTooltip(text, this.currentMousePos.x, this.currentMousePos.y);
        }, 400);
      });

      target.addEventListener('mouseleave', () => {
        if (this.tooltipTimer) {
          clearTimeout(this.tooltipTimer);
          this.tooltipTimer = null;
        }
        this.hideTooltip();
      });
    });
  }

  showTooltip(text, x, y) {
    if (!this.tooltipEl) return;
    this.tooltipEl.textContent = text;
    this.positionTooltip(x, y);
    this.tooltipEl.classList.add('is-visible');
  }

  positionTooltip(x, y) {
    if (!this.tooltipEl) return;
    const offset = 14;
    let posX = x + offset;
    let posY = y + offset;

    // Prevent clipping past viewport right or bottom
    const ttW = this.tooltipEl.offsetWidth || 120;
    const ttH = this.tooltipEl.offsetHeight || 30;
    if (posX + ttW > window.innerWidth - 10) {
      posX = x - ttW - 8;
    }
    if (posY + ttH > window.innerHeight - 10) {
      posY = y - ttH - 8;
    }

    this.tooltipEl.style.left = `${posX}px`;
    this.tooltipEl.style.top = `${posY}px`;
  }

  hideTooltip() {
    if (!this.tooltipEl) return;
    this.tooltipEl.classList.remove('is-visible');
  }

  requestTick() {
    if (!this.isTicking) {
      this.isTicking = true;
      requestAnimationFrame(() => this.tick());
    }
  }

  tick() {
    const diff = this.targetScrollOffset - this.scrollOffset;
    if (Math.abs(diff) > 0.1) {
      this.scrollOffset += diff * 0.45;
      this.updateButton();
      requestAnimationFrame(() => this.tick());
    } else {
      this.scrollOffset = this.targetScrollOffset;
      this.updateButton();
      this.isTicking = false;
    }
  }

  /**
   * Continuous track circulation:
   * Left edge (moves UP) -> Top edge (moves RIGHT) -> Right edge (moves DOWN) -> skips bottom line at y = 800.82px -> Left
   */
  calculatePosition(cfg, trackPos) {
    const H = this.usableHeight;
    const W = this.viewportWidth;
    const L = cfg.length;
    const total = this.trackLength;

    const s = ((trackPos % total) + total) % total;

    if (s < this.segLeft) {
      // Left edge: moves UP
      const f = s / this.segLeft;
      const y = (1 - f) * (H - L);
      return { edge: 'left', x: 0, y: Math.max(0, Math.min(H - L, y)) };
    } else if (s < this.segLeft + this.segTop) {
      // Top edge: moves RIGHT
      const f = (s - this.segLeft) / this.segTop;
      const x = f * (W - L);
      return { edge: 'top', x: Math.max(0, Math.min(W - L, x)), y: 0 };
    } else {
      // Right edge: moves DOWN
      const f = (s - (this.segLeft + this.segTop)) / this.segRight;
      const y = f * (H - L);
      return { edge: 'right', x: W - cfg.breadth, y: Math.max(0, Math.min(H - L, y)) };
    }
  }

  getButtonSvg(edge) {
    const fontStyle = "font-family: 'Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;";

    if (edge === 'top') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="198.3979" height="38.9074" viewBox="0 0 198.3979 38.9074">
          <polyline points="197.6479 0 197.6479 38.1574 .75 38.1574 .75 0" style="fill: #ffffff;"/>
          <text transform="translate(9.9202 27.028)" style="${fontStyle}">
            <tspan x="0" y="0">your board</tspan>
          </text>
          <polyline points="197.6479 14.3913 197.6479 38.1574 .75 38.1574 .75 0" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    } else if (edge === 'right') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="38.9074" height="198.3979" viewBox="0 0 38.9074 198.3979">
          <polyline points="38.9074 0 0 0 0 197.6479 38.9074 197.6479" style="fill: #ffffff;"/>
          <text transform="translate(11.8794 9.9202) rotate(90)" style="${fontStyle}">
            <tspan x="0" y="0">your board</tspan>
          </text>
          <polyline points="38.9074 0.75 0.75 0.75 0.75 197.6479 24.5 197.6479" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    } else {
      // Left edge
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="38.9074" height="198.3979" viewBox="0 0 38.9074 198.3979">
          <polyline points="0 197.6479 38.1574 197.6479 38.1574 0 0 0" style="fill: #ffffff;"/>
          <text transform="translate(27.028 188.4777) rotate(-90)" style="${fontStyle}">
            <tspan x="0" y="0">your board</tspan>
          </text>
          <polyline points="0 197.6479 38.1574 197.6479 38.1574 0.75 14.3913 0.75" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    }
  }

  updateButton() {
    const cfg = this.buttonConfig;
    // Initial position on top edge at x = 179.2263px (matching Illustrator artboard)
    const initialOffset = this.segLeft + 179.2263;
    const trackPos = initialOffset + this.scrollOffset;
    const pos = this.calculatePosition(cfg, trackPos);
    const isEdgeChange = cfg.currentEdge !== pos.edge;
    cfg.currentEdge = pos.edge;

    const el = this.btnElement;
    if (!el) return;

    if (isEdgeChange || !el.innerHTML) {
      el.innerHTML = this.getButtonSvg(pos.edge);
      el.className = `community-revolving-btn btn-${cfg.id} is-${pos.edge}`;
    }

    if (pos.edge === 'top') {
      el.style.top = '0px';
      el.style.left = `${Math.round(pos.x)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else if (pos.edge === 'left') {
      el.style.top = `${Math.round(pos.y)}px`;
      el.style.left = '0px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else if (pos.edge === 'right') {
      el.style.top = `${Math.round(pos.y)}px`;
      el.style.left = 'auto';
      el.style.right = '0px';
      el.style.bottom = 'auto';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.communityApp = new CommunityApp();
});
