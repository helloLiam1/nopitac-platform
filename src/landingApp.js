/**
 * LandingApp
 * Controls the After Sign-Up / Post-Login screen:
 *  - Centers the exact vector statement card from after sign up.svg
 *  - Circulates the two edge buttons around the screen on scroll:
 *      1. "create your own \n nopitac board" (button-04.svg)
 *      2. "explore boards by \n other users " (button-05.svg)
 *  - Text styling: Helvetica Neue Bold 28px, -25 kerning (-0.025em), line gap 28px
 *  - Direct 1:1 responsiveness, endless modulo scrolling along Left -> Top -> Right edges
 */

export class LandingApp {
  constructor() {
    this.viewport = document.getElementById('landingViewport');
    this.centerCard = document.getElementById('landingCenterCard');

    // Read active accent color (from URL query param or localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    this.accentColor = urlParams.get('color') || localStorage.getItem('nopitac_accent_color') || '#6a76ff';
    if (this.viewport) {
      this.viewport.style.setProperty('--landing-accent-color', this.accentColor);
    }

    // Button definitions matching button-04.svg and button-05.svg
    this.buttonConfigs = [
      {
        id: 'create-board',
        line1: 'create your own',
        line2: 'nopitac board',
        length: 312.8205,
        breadth: 95.7589,
        // In 1440x900 artboard: Top edge at x = 163.8782px
        initialTau: 0.3263,
        currentEdge: 'top',
        action: () => {
          try {
            localStorage.setItem('nopitac_board_mode', 'empty');
          } catch (e) {}
          window.location.replace('/board.html?mode=empty');
        }
      },
      {
        id: 'explore-boards',
        line1: 'explore boards by',
        line2: 'other users ',
        length: 312.8205,
        breadth: 95.7589,
        // In 1440x900 artboard: Right edge at y = 495.0884px
        initialTau: 0.9600,
        currentEdge: 'right',
        action: () => {
          window.location.replace('/community.html');
        }
      }
    ];

    this.elements = {};
    this.scrollOffset = 0;
    this.targetScrollOffset = 0;
    this.isTicking = false;

    this.init();
  }

  init() {
    this.measureDimensions();
    this.createButtons();
    this.bindEvents();
    this.update();
  }

  measureDimensions() {
    this.viewportWidth = window.innerWidth || 1440;
    this.viewportHeight = window.innerHeight || 900;

    // Track setup matching BoardButtonsManager
    this.refLength = 312.8205;
    this.segLeft = Math.max(100, this.viewportHeight - this.refLength);
    this.segTop = Math.max(100, this.viewportWidth - this.refLength);
    this.segRight = Math.max(100, this.viewportHeight - this.refLength);
    this.trackLength = this.segLeft + this.segTop + this.segRight;
  }

  createButtons() {
    this.buttonConfigs.forEach((cfg) => {
      const btn = document.createElement('div');
      btn.className = `landing-revolving-btn btn-${cfg.id}`;
      btn.id = `landingBtn_${cfg.id}`;
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', `${cfg.line1} ${cfg.line2}`);

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
      this.elements[cfg.id] = btn;
    });
  }

  bindEvents() {
    // Wheel / trackpad scrolling
    const onWheel = (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 20;
      else if (e.deltaMode === 2) dy *= window.innerHeight;

      this.targetScrollOffset += dy;
      this.requestTick();
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    // Touch swipe
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const dy = touchStartY - e.touches[0].clientY;
        touchStartY = e.touches[0].clientY;
        this.targetScrollOffset += dy;
        this.requestTick();
      }
    }, { passive: false });

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

    // Resize
    window.addEventListener('resize', () => {
      this.measureDimensions();
      this.update();
    });
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
      this.update();
      requestAnimationFrame(() => this.tick());
    } else {
      this.scrollOffset = this.targetScrollOffset;
      this.update();
      this.isTicking = false;
    }
  }

  /**
   * Continuous track circulation:
   * Left edge (moves UP) -> Top edge (moves RIGHT) -> Right edge (moves DOWN) -> Left edge
   */
  calculatePosition(cfg, trackPos) {
    const H = this.viewportHeight;
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

  getButtonSvg(edge, line1, line2) {
    const fontStyle = "font-family: 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -0.025em;";

    if (edge === 'top') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="312.8205" height="95.7589" viewBox="0 0 312.8205 95.7589">
          <polyline points="1 0 1 94.7589 311.8205 94.7589 311.8205 0" style="fill: #ffffff;"/>
          <text transform="translate(8.4469 41.7206)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="27">${line2}</tspan>
          </text>
          <polyline points="1 0 1 94.7589 311.8205 94.7589 311.8205 46.2174" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
        </svg>
      `;
    } else if (edge === 'right') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="95.7589" height="312.8205" viewBox="0 0 95.7589 312.8205">
          <polyline points="94.7589 0 0 0 0 311.8205 94.7589 311.8205" style="fill: #ffffff;"/>
          <text transform="translate(53.0419 7.4482) rotate(90)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="27">${line2}</tspan>
          </text>
          <polyline points="94.7589 0 0 0 0 311.8205 46.2174 311.8205" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
        </svg>
      `;
    } else {
      // Left edge
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="95.7589" height="312.8205" viewBox="0 0 95.7589 312.8205">
          <polyline points="0 311.8205 94.7589 311.8205 94.7589 0 0 0" style="fill: #ffffff;"/>
          <text transform="translate(42.717 304.3723) rotate(-90)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="27">${line2}</tspan>
          </text>
          <polyline points="0 311.8205 94.7589 311.8205 94.7589 0 46.2174 0" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
        </svg>
      `;
    }
  }

  update() {
    this.buttonConfigs.forEach((cfg) => {
      const initialOffset = cfg.initialTau * this.trackLength;
      const trackPos = initialOffset + this.scrollOffset;
      const pos = this.calculatePosition(cfg, trackPos);
      const isEdgeChange = cfg.currentEdge !== pos.edge;
      cfg.currentEdge = pos.edge;

      const el = this.elements[cfg.id];
      if (!el) return;

      if (isEdgeChange || !el.innerHTML) {
        el.innerHTML = this.getButtonSvg(pos.edge, cfg.line1, cfg.line2);
        el.className = `landing-revolving-btn btn-${cfg.id} is-${pos.edge}`;
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
  window.landingApp = new LandingApp();
});
