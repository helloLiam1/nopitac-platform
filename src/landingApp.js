/**
 * LandingApp
 * Controls the After Sign-Up / Post-Login screen:
 *  - Centers the exact vector statement card from after sign in .svg (369.2594px)
 *  - Circulates the two edge buttons around the screen on scroll:
 *      1. "create your own \n nopitac board"
 *      2. "explore boards by \n other users "
 *  - Text styling: Helvetica Neue Bold 21px, -25 kerning (-0.025em), line gap 21.5898px
 *  - Direct 1:1 responsiveness, endless modulo scrolling along Left -> Top -> Right edges
 */

export class LandingApp {
  constructor() {
    this.viewport = document.getElementById('landingViewport');
    this.centerCard = document.getElementById('landingCenterCard');

    // Read active accent color (from URL query param or localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const paramColor = urlParams.get('color');
    this.accentColor = paramColor || localStorage.getItem('nopitac_accent_color') || '#6a76ff';
    try {
      if (paramColor) {
        localStorage.setItem('nopitac_accent_color', this.accentColor);
      }
    } catch (e) {}

    document.documentElement.style.setProperty('--landing-accent-color', this.accentColor);
    if (this.viewport) {
      this.viewport.style.setProperty('--landing-accent-color', this.accentColor);
    }

    // Button definitions matching after sign in .svg (248.5372 x 75.7708 inner span + stroke)
    this.buttonConfigs = [
      {
        id: 'create-board',
        line1: 'create your own',
        line2: 'nopitac board',
        length: 250.5372,
        breadth: 76.7708,
        // In 1440x900 artboard: Top edge at x = 275.1951px (stroke center)
        initialTau: 0.3712,
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
        length: 250.5372,
        breadth: 76.7708,
        // In 1440x900 artboard: Right edge at y = 486.0534px (stroke center)
        initialTau: 0.9339,
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
    this.refLength = 250.5372;
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
    const fontStyle = "font-family: 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 21px; font-weight: 700; letter-spacing: -0.025em;";

    if (edge === 'top') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="250.5372" height="76.7708" viewBox="0 0 250.5372 76.7708">
          <polyline points="1 0 1 75.7708 249.5372 75.7708 249.5372 0" style="fill: #ffffff;"/>
          <text transform="translate(6.9583 33.3609)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="21.5898">${line2}</tspan>
          </text>
          <polyline points="1 0 1 75.7708 249.5372 75.7708 249.5372 36.9562" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
        </svg>
      `;
    } else if (edge === 'right') {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="76.7708" height="250.5372" viewBox="0 0 76.7708 250.5372">
          <polyline points="76.7708 1 1 1 1 249.5372 76.7708 249.5372" style="fill: #ffffff;"/>
          <text transform="translate(43.4129 6.9558) rotate(90)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="21.5898">${line2}</tspan>
          </text>
          <polyline points="76.7708 1 1 1 1 249.5372 39.8146 249.5372" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
        </svg>
      `;
    } else {
      // Left edge
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="76.7708" height="250.5372" viewBox="0 0 76.7708 250.5372">
          <polyline points="0 249.5372 75.7708 249.5372 75.7708 1 0 1" style="fill: #ffffff;"/>
          <text transform="translate(33.3579 243.5814) rotate(-90)" style="${fontStyle}">
            <tspan x="0" y="0">${line1}</tspan>
            <tspan x="0" y="21.5898">${line2}</tspan>
          </text>
          <polyline points="0 249.5372 75.7708 249.5372 75.7708 1 36.9562 1" style="fill: none; stroke: #000000; stroke-miterlimit: 10; stroke-width: 2px;"/>
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
