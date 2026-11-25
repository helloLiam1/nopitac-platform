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
import { nopitacService } from './lib/nopitacService.js';

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
    this.btnElements = {};
    this.showingSavedOnly = false;

    this.nameRenderer = new NopitacRenderer(null);

    // Track state for revolving edge buttons ("to your board" & "to saved boards")
    this.scrollOffset = 0;
    this.targetScrollOffset = 0;
    this.isTicking = false;
    this.buttonConfigs = [
      {
        id: 'your-board',
        label: 'to your board',
        length: 182.7375,
        breadth: 32.231,
        // Top edge at x = 184.0646px (stroke center 184.8146 in commnuity new.svg)
        edge: 'top',
        edgeFrac: 184.0646 / (1440 - 182.7375),
        currentEdge: 'top',
        action: () => {
          window.location.href = '/board.html';
        }
      },
      {
        id: 'saved-boards',
        label: 'to saved boards',
        length: 208.1066,
        breadth: 32.231,
        // Right edge at y = 60.4449px (stroke center 61.1949 in commnuity new.svg)
        edge: 'right',
        edgeFrac: 60.4449 / (800.8216 - 208.1066),
        currentEdge: 'right',
        action: () => {
          this.toggleSavedBoardsView();
        }
      }
    ];

    // Tooltip dwell timer
    this.tooltipTimer = null;
    this.currentMousePos = { x: 0, y: 0 };

    this.init();
  }

  async init() {
    this.communityUsers = [...COMMUNITY_USERS];
    this.remoteSavedNames = null;

    this.measureDimensions();
    this.updatePlatformUserCount();
    this.renderCommunityUsers();
    this.createRevolvingButtons();
    this.setupUserSignature();
    this.bindEvents();
    this.updateButtons();

    // Hydrate registered users & saved boards from Supabase
    try {
      const [dbUsers, sbUser] = await Promise.all([
        nopitacService.fetchCommunityUsers(),
        nopitacService.getCurrentUser()
      ]);
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        const merged = [...COMMUNITY_USERS];
        const existing = new Set(merged.map((u) => u.name.toLowerCase()));
        dbUsers.forEach((u) => {
          if (!existing.has(u.name.toLowerCase())) {
            merged.push(u);
          }
        });
        this.communityUsers = merged;
      }
      if (sbUser?.id) {
        this.remoteSavedNames = await nopitacService.getSavedBoardNames(sbUser.id);
      }
      this.updatePlatformUserCount();
      this.renderCommunityUsers();
    } catch (e) {}
  }

  updatePlatformUserCount() {
    const countEl = document.getElementById('communityPlatformCount');
    if (countEl) {
      countEl.textContent = String((this.communityUsers || COMMUNITY_USERS).length);
    }
  }

  measureDimensions() {
    this.viewportWidth = window.innerWidth || 1440;
    this.viewportHeight = window.innerHeight || 900;
    // Bounded at the bottom guideline at y = 800.82px
    this.bottomBarY = Math.max(300, this.viewportHeight - 99.1784);
    this.usableHeight = this.bottomBarY;

    // Shared reference track segments so both buttons revolve at identical speed without drifting
    this.refLength = 208.1066;
    this.segLeft = Math.max(100, this.usableHeight - this.refLength);
    this.segTop = Math.max(100, this.viewportWidth - this.refLength);
    this.segRight = Math.max(100, this.usableHeight - this.refLength);
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

    // Use DomainType engine to compute exact metrics with 1px inward outline
    const comp = DomainType.compute(domain.name, {
      mode: 'left',
      fontSize: fontSize,
      outlineWidth: 1,
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
        <path d="${outlineD}" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="10" />
      </svg>
    `;
  }

  getSavedBoardNames() {
    try {
      const raw = localStorage.getItem('nopitac_saved_boards');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  getSavedBoardProfiles() {
    try {
      const raw = localStorage.getItem('nopitac_saved_board_profiles');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {}
    return {};
  }

  toggleSavedBoardsView() {
    this.showingSavedOnly = !this.showingSavedOnly;
    this.renderCommunityUsers();
  }

  renderCommunityUsers() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    const allUsers = this.communityUsers || COMMUNITY_USERS;
    const savedNames = this.remoteSavedNames || this.getSavedBoardNames();
    const savedProfiles = this.getSavedBoardProfiles();
    let visibleUsers = allUsers;
    if (this.showingSavedOnly) {
      const baseMatched = allUsers.filter((u) => savedNames.includes(u.name.toLowerCase()));
      const matchedSet = new Set(baseMatched.map((u) => u.name.toLowerCase()));
      const extraSaved = savedNames
        .filter((name) => !matchedSet.has(name) && savedProfiles[name])
        .map((name) => savedProfiles[name]);
      visibleUsers = [...baseMatched, ...extraSaved];
    }

    if (visibleUsers.length === 0) {
      this.listContainer.innerHTML = '<div class="community-empty-state">no saved boards yet</div>';
      this.bindTooltips();
      return;
    }

    visibleUsers.forEach((user) => {
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
          return `
            <div class="community-domain-chip" data-tooltip="people in their board">
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
        <div class="community-col-count" data-tooltip="${user.peopleCount} people in their board">
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

  createRevolvingButtons() {
    this.buttonConfigs.forEach((cfg) => {
      const btn = document.createElement('div');
      btn.className = `community-revolving-btn btn-${cfg.id}`;
      btn.id = `communityBtn_${cfg.id}`;
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', cfg.label);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        cfg.action();
      });

      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cfg.action();
        }
      });

      this.viewport.appendChild(btn);
      this.btnElements[cfg.id] = btn;
    });
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
      this.updateButtons();
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
      if (target.dataset.tooltipBound === '1') return;
      target.dataset.tooltipBound = '1';

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
      this.updateButtons();
      requestAnimationFrame(() => this.tick());
    } else {
      this.scrollOffset = this.targetScrollOffset;
      this.updateButtons();
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

  getButtonSvg(edge, cfg) {
    const fontStyle = "font-family: 'Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 21px; font-weight: 700; letter-spacing: -0.025em;";
    const L = cfg.length;
    const B = cfg.breadth; // 32.231

    if (edge === 'top') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${B}" viewBox="0 0 ${L} ${B}">
          <polyline points="${(L - 0.75).toFixed(4)} 0 ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} 0.75 ${(B - 0.75).toFixed(4)} 0.75 0" style="fill: #ffffff;"/>
          <text transform="translate(7.3433 21.5036)" style="${fontStyle}">
            <tspan x="0" y="0">${cfg.label}</tspan>
          </text>
          <polyline points="${(L - 0.75).toFixed(4)} 17.2203 ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} 0.75 ${(B - 0.75).toFixed(4)} 0.75 0" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    } else if (edge === 'right') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${L}" viewBox="0 0 ${B} ${L}">
          <polyline points="${B} 0.75 0.75 0.75 0.75 ${(L - 0.75).toFixed(4)} ${B} ${(L - 0.75).toFixed(4)}" style="fill: #ffffff;"/>
          <text transform="translate(10.7274 7.3433) rotate(90)" style="${fontStyle}">
            <tspan x="0" y="0">${cfg.label}</tspan>
          </text>
          <polyline points="${B} 0.75 0.75 0.75 0.75 ${(L - 0.75).toFixed(4)} 15.0107 ${(L - 0.75).toFixed(4)}" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    } else {
      // Left edge
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${L}" viewBox="0 0 ${B} ${L}">
          <polyline points="0 ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} 0.75 0 0.75" style="fill: #ffffff;"/>
          <text transform="translate(21.5036 ${(L - 7.3433).toFixed(4)}) rotate(-90)" style="${fontStyle}">
            <tspan x="0" y="0">${cfg.label}</tspan>
          </text>
          <polyline points="0 ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} ${(L - 0.75).toFixed(4)} ${(B - 0.75).toFixed(4)} 0.75 17.2203 0.75" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 1.5px;"/>
        </svg>
      `;
    }
  }

  getInitialTrackPos(cfg) {
    if (cfg.edge === 'top') {
      return this.segLeft + cfg.edgeFrac * this.segTop;
    } else if (cfg.edge === 'right') {
      return this.segLeft + this.segTop + cfg.edgeFrac * this.segRight;
    } else {
      return cfg.edgeFrac * this.segLeft;
    }
  }

  updateButtons() {
    this.buttonConfigs.forEach((cfg) => {
      const initialOffset = this.getInitialTrackPos(cfg);
      const trackPos = initialOffset + this.scrollOffset;
      const pos = this.calculatePosition(cfg, trackPos);
      const isEdgeChange = cfg.currentEdge !== pos.edge;
      cfg.currentEdge = pos.edge;

      const el = this.btnElements[cfg.id];
      if (!el) return;

      if (isEdgeChange || !el.innerHTML) {
        el.innerHTML = this.getButtonSvg(pos.edge, cfg);
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
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.communityApp = new CommunityApp();
});
