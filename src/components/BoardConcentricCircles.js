/**
 * BoardConcentricCircles Component
 * Renders:
 *  - Moving concentric circular rings of names on the Nopitac board (authentic Nopitac Helvetica vector engine)
 *  - Both Animation 1 (differential circular track flow) and Animation 2 (master center rotation) at 0.2x speed
 *  - Kerning set to -3 for all text
 *  - Interactive selection: clicking any name selects that person
 *  - Two square dots rendered along the circular path directly beneath the selected person's name
 *  - 315 × 315 px white circular information panel in the center (on 1440 × 900 artboard, proportionally scaled)
 *  - Invisible inscribed square clipping mask inside the circle:
 *      - Person's name fixed at top (rendered in Nopitac Helvetica with kerning -3)
 *      - Scrollable area below containing place of birth, year of birth, and 16px centered description
 *  - Dynamic board background color synced to the selected person's domain color
 */

import { CUSTOM_GLYPH_DB } from '../engine/customGlyphDb.js';
import {
  FONT_SIZE,
  HELVETICA_GLYPHS,
  getCharMetrics,
  getHelveticaKerning
} from '../engine/helveticaGlyphs.js';
import {
  NopitacRenderer,
  UNDERLINE_HEIGHT,
  stripUnderlineStub
} from '../engine/nopitacRenderer.js';
import { PhotoFrameEngine } from '../engine/photoFrameEngine.js';
import { INITIAL_DOMAINS } from './DomainPanel.js';

const LOREM_PARAGRAPHS = [
  'lorem ipsum dolor sit amet, consectetur adipiscing elit. sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. donec eu libero sit amet quam egestas semper. aenean ultricies mi vitae est. mauris placerat eleifend leo.',
  'curabitur pretium tincidunt lacus. nulla gravida orci a odio. nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. integer in mauris eu nibh euismod gravida. duis ac tellus et risus vulputate vehicula.',
  'maecenas malesuada elit lectus felis, malesuada ultricies. curabitur et ligula. ut molestie a, ultricies porta urna. vestibulum commodo volutpat a, convallis ac, laoreet enim. phasellus fermentum in, dolor. pellentesque facilisis. nulla imperdiet sit amet magna.',
  'vivamus luctus urna sed urna ultricies ac tempor dui sagittis. in condimentum facilisis porta. sed nec diam eu diam mattis viverra. nulla fringilla, orci ac euismod semper, magna diam porttitor mauris, quis sollicitudin sapien justo in libero.'
];

const INITIAL_PEOPLE_DATA = {
  'jon contino': {
    domain: 'artists',
    place: 'new york',
    year: '1983 -',
    description:
      'i love his work because he uses illustration as a tool to give something an identity and not just as a way to make something look nice. plus he is very brave to use hand drawn logos. also i love how there is so much new york in his work and he’s nice to take a joke on himself with his podcast the nose knows (he has a big nose)',
    links: 'https://www.instagram.com/joncontino/?hl=en',
    photo: {
      imageHref: '/images/jon_contino.jpg',
      imageNaturalWidth: 619,
      imageNaturalHeight: 495,
      imageScale: 1.05,
      imagePanX: 0,
      imagePanY: 0,
      theme: 'dark'
    }
  },
  'paula scher': {
    domain: 'artists',
    place: 'washington dc',
    year: '1948',
    description:
      'she revolutionized graphic design by treating typography not just as a tool for reading, but as a form of expressive, emotional fine art.\n\n' +
      LOREM_PARAGRAPHS[0]
  },
  'david carson': {
    domain: 'copywriters',
    place: 'corpus christi',
    year: '1954',
    description: LOREM_PARAGRAPHS[1] + '\n\n' + LOREM_PARAGRAPHS[4]
  },
  'stefan sagmeister': {
    domain: 'music composers',
    place: 'bregenz',
    year: '1962',
    description: LOREM_PARAGRAPHS[2] + '\n\n' + LOREM_PARAGRAPHS[0]
  },
  'jessica walsh': {
    domain: 'web designer',
    place: 'new york',
    year: '1986',
    description: LOREM_PARAGRAPHS[3] + '\n\n' + LOREM_PARAGRAPHS[1]
  },
  'neville brody': {
    domain: 'artists',
    place: 'london',
    year: '1957',
    description: LOREM_PARAGRAPHS[4] + '\n\n' + LOREM_PARAGRAPHS[2]
  },
  'alan fletcher': {
    domain: 'copywriters',
    place: 'nairobi',
    year: '1931',
    description: LOREM_PARAGRAPHS[0] + '\n\n' + LOREM_PARAGRAPHS[3]
  },
  'peter saville': {
    domain: 'music composers',
    place: 'manchester',
    year: '1955',
    description: LOREM_PARAGRAPHS[1] + '\n\n' + LOREM_PARAGRAPHS[2]
  },
  'milton glaser': {
    domain: 'artists',
    place: 'new york',
    year: '1929',
    description: LOREM_PARAGRAPHS[2] + '\n\n' + LOREM_PARAGRAPHS[4]
  },
  'massimo vignelli': {
    domain: 'web designer',
    place: 'milan',
    year: '1931',
    description: LOREM_PARAGRAPHS[3] + '\n\n' + LOREM_PARAGRAPHS[0]
  },
  'april greiman': {
    domain: 'web designer',
    place: 'new york',
    year: '1948',
    description: LOREM_PARAGRAPHS[4] + '\n\n' + LOREM_PARAGRAPHS[1]
  },
  'susan kare': {
    domain: 'web designer',
    place: 'ithaca',
    year: '1954',
    description: LOREM_PARAGRAPHS[0] + '\n\n' + LOREM_PARAGRAPHS[2]
  },
  'tibor kalman': {
    domain: 'copywriters',
    place: 'budapest',
    year: '1949',
    description: LOREM_PARAGRAPHS[1] + '\n\n' + LOREM_PARAGRAPHS[3]
  },
  'irma boom': {
    domain: 'artists',
    place: 'lochem',
    year: '1960',
    description: LOREM_PARAGRAPHS[2] + '\n\n' + LOREM_PARAGRAPHS[1]
  },
  'michael bierut': {
    domain: 'copywriters',
    place: 'cleveland',
    year: '1957',
    description: LOREM_PARAGRAPHS[3] + '\n\n' + LOREM_PARAGRAPHS[4]
  },
  'jonathan barnbrook': {
    domain: 'music composers',
    place: 'luton',
    year: '1966',
    description: LOREM_PARAGRAPHS[4] + '\n\n' + LOREM_PARAGRAPHS[0]
  },
  'yugo nakamura': {
    domain: 'web designer',
    place: 'nara',
    year: '1970',
    description: LOREM_PARAGRAPHS[0] + '\n\n' + LOREM_PARAGRAPHS[4]
  },
  'eiko ishioka': {
    domain: 'artists',
    place: 'tokyo',
    year: '1938',
    description: LOREM_PARAGRAPHS[1] + '\n\n' + LOREM_PARAGRAPHS[0]
  },
  'yuta eunho le': {
    domain: 'music composers',
    place: 'seoul',
    year: '1989',
    description: LOREM_PARAGRAPHS[2] + '\n\n' + LOREM_PARAGRAPHS[3]
  },
  'karel martens': {
    domain: 'artists',
    place: 'mook',
    year: '1939',
    description: LOREM_PARAGRAPHS[3] + '\n\n' + LOREM_PARAGRAPHS[2]
  },
  'otl aich': {
    domain: 'copywriters',
    place: 'ulm',
    year: '1922',
    description: LOREM_PARAGRAPHS[4] + '\n\n' + LOREM_PARAGRAPHS[3]
  }
};

export const INITIAL_RINGS = [
  {
    radius: 183.2,
    names: [
      'jon contino',
      'paula scher',
      'david carson',
      'stefan sagmeister',
      'jessica walsh',
      'neville brody'
    ],
    // -79° from 3 o'clock = +11° clockwise from 12 o'clock (matches Paula Scher position in reference)
    startAngleDeg: -79
  },
  {
    radius: 243.2,
    names: [
      'alan fletcher',
      'peter saville',
      'milton glaser',
      'massimo vignelli',
      'april greiman',
      'susan kare',
      'tibor kalman'
    ],
    startAngleDeg: -120
  },
  {
    radius: 303.2,
    names: [
      'irma boom',
      'michael bierut',
      'jonathan barnbrook',
      'yugo nakamura',
      'eiko ishioka',
      'yuta eunho le',
      'karel martens',
      'otl aich'
    ],
    startAngleDeg: -113
  }
];

function normalizeDomainKey(domainName) {
  return String(domainName || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export class BoardConcentricCircles {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.emptyMode = Boolean(options.emptyMode);
    this.startedEmpty = Boolean(options.emptyMode);
    this.onSelectionChange = options.onSelectionChange || null;
    this.onPersonAdded = typeof options.onPersonAdded === 'function' ? options.onPersonAdded : null;
    this.cx = 720;
    this.cy = 450;
    this.centerDiameter = 315; // 315 × 315 px circle on 1440 × 900 artboard
    this.centerRadius = this.centerDiameter / 2; // 157.5px
    this.centerColor = '#ffffff'; // Always white
    this.ringSpacing = 60;
    this.scale = 0.82305; // 36px font size (36 / 43.74)
    this.tracking = -2.5; // Kerning -2.5 for all text (increased +0.5 from -3)
    this.strokeWidth = UNDERLINE_HEIGHT * this.scale; // ~3.1636px
    this.baselineOffsetLocal = -7.14685;

    // Animation 1 (circular flow) + Animation 2 (center rotation) at 0.2x speed
    this.animSpeed = 80; // unscaled font units/sec (Animation 1)
    this.rotationSpeed = 20; // degrees/sec (Animation 2)
    this.speedMultiplier = 0.2; // 0.2x speed
    this.animOffset = 0;
    this.rotationAngle = 0;
    this.lastTimestamp = null;
    this.animFrameId = null;

    // NopitacRenderer for the fixed name header inside the center circular panel
    this.nameRenderer = new NopitacRenderer(null);
    this.photoEngine = new PhotoFrameEngine();
    this.centerVirtualScrollY = 0;
    this.photoContractThreshold = 130;
    this.hasSelectedPhoto = false;

    // Domain color registry & display order initialized from INITIAL_DOMAINS
    this.domainColors = new Map();
    this.domainOrder = [];
    if (!this.emptyMode) {
      INITIAL_DOMAINS.forEach((d) => {
        this.registerDomainColor(d.name, d.color);
      });
    }

    // Person metadata registry with recorded dateAdded timestamps
    this.people = new Map();
    this.personOrder = [];
    if (!this.emptyMode) {
      const initialEntries = Object.entries(INITIAL_PEOPLE_DATA);
      const baseTimestamp = Date.now() - initialEntries.length * 3600 * 1000;
      initialEntries.forEach(([name, info], idx) => {
        const key = name.toLowerCase();
        const addedTs = baseTimestamp + idx * 3600 * 1000;
        this.people.set(key, {
          id: key,
          fullName: key,
          domain: info.domain,
          place: info.place,
          year: info.year,
          description: info.description,
          links: info.links || '',
          photo: info.photo || null,
          dateAdded: addedTs,
          dateAddedISO: new Date(addedTs).toISOString()
        });
        this.personOrder.push(key);
      });
    }

    // Active sort & domain filter state
    this.sortBy = null; // null | 'name' | 'domains' | 'date-added'
    this.filterDomains = []; // normalized domain keys

    // Preserve base ring ordering so renames/edits stay reflected on default view
    this.baseRings = INITIAL_RINGS.map((r) => ({
      radius: r.radius,
      names: [...r.names],
      startAngleDeg: r.startAngleDeg ?? 0
    }));

    // Deep clone initial rings
    this.rings = this.emptyMode
      ? []
      : this.baseRings.map((r) => ({
          radius: r.radius,
          names: [...r.names],
          startAngleDeg: r.startAngleDeg ?? 0
        }));

    // Nothing selected at start; board opens with white background
    this.selectedPersonId = null;

    // Store computed placement geometry for each name (used for moving selection dots cleanly)
    this.namePlacementMap = new Map();

    this._onResize = () => this.updateCenterPanelScale();

    this.init();
  }

  init() {
    this.createElements();
    this.render();
    this.updateCenterPanelScale();
    this.updateSelectionUI();
    window.addEventListener('resize', this._onResize);
    this.startAnimation();
  }

  registerDomainColor(domainName, color) {
    const key = normalizeDomainKey(domainName);
    if (key && color) {
      this.domainColors.set(key, color);
      if (!this.domainOrder.includes(key)) {
        this.domainOrder.push(key);
      }
    }
  }

  updateDomain(originalName, { name, color }) {
    const prevKey = normalizeDomainKey(originalName);
    const nextKey = normalizeDomainKey(name);
    if (!nextKey || !color) return;

    if (prevKey && prevKey !== nextKey) {
      this.domainColors.delete(prevKey);
      const orderIdx = this.domainOrder.indexOf(prevKey);
      if (orderIdx >= 0) {
        if (this.domainOrder.includes(nextKey)) {
          this.domainOrder.splice(orderIdx, 1);
        } else {
          this.domainOrder[orderIdx] = nextKey;
        }
      }
    }
    this.registerDomainColor(nextKey, color);

    // Update any people using the edited domain
    if (prevKey) {
      for (const person of this.people.values()) {
        if (normalizeDomainKey(person.domain) === prevKey) {
          person.domain = nextKey;
        }
      }
    }

    if (Array.isArray(this.filterDomains) && prevKey && prevKey !== nextKey) {
      this.filterDomains = this.filterDomains.map((d) => (d === prevKey ? nextKey : d));
    }

    this.rebuildRingsForCurrentSort();
    this.render();
    this.updateSelectionUI();
  }

  /**
   * Returns the render color for a person's name, underline, and selection dots.
   * When sortBy === 'domains', names take their domain color (with the active board
   * background's matching domain rendered in crisp #000000 for guaranteed legibility).
   */
  getNameColor(personId) {
    if (this.sortBy !== 'domains') {
      return '#000000';
    }
    const person = this.people.get(personId);
    if (!person) return '#000000';
    const domainColor = this.getDomainColor(person.domain);
    const selectedPerson = this.people.get(this.selectedPersonId);
    const activeBgColor = selectedPerson ? this.getDomainColor(selectedPerson.domain) : null;
    if (activeBgColor && domainColor.toLowerCase() === activeBgColor.toLowerCase()) {
      return '#000000';
    }
    return domainColor;
  }

  getDomainColor(domainName) {
    const key = normalizeDomainKey(domainName);
    if (this.domainColors.has(key)) {
      return this.domainColors.get(key);
    }
    // Fallback to first domain color (artists green)
    return INITIAL_DOMAINS[0]?.color || '#27ff83';
  }

  createElements() {
    // 1. Concentric Circles SVG
    let svg = this.container.querySelector('#boardConcentricCirclesSvg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', 'boardConcentricCirclesSvg');
      svg.setAttribute('class', 'board-concentric-circles-svg');
      svg.setAttribute('viewBox', '0 0 1440 900');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      svg.style.zIndex = '5';

      const firstChild = this.container.firstChild;
      if (firstChild) {
        this.container.insertBefore(svg, firstChild);
      } else {
        this.container.appendChild(svg);
      }
    }
    this.svg = svg;
    if (this.emptyMode) {
      this.svg.style.display = 'none';
    }

    // Delegate clicks on moving names inside the SVG
    if (!this._clickBound) {
      this._clickBound = true;
      this.svg.addEventListener('click', (e) => {
        const nameGroup = e.target.closest('.concentric-name-group');
        if (!nameGroup) return;
        const personId = nameGroup.getAttribute('data-person-id');
        if (personId) {
          e.stopPropagation();
          this.selectPerson(personId);
        }
      });
    }

    // Clicking background outside names, center circle, or board widgets deselects back to white
    if (!this._bgClickBound) {
      this._bgClickBound = true;
      this.container.addEventListener('click', (e) => {
        if (!this.selectedPersonId) return;
        if (
          e.target.closest(
            '.concentric-name-group, .center-info-panel, .add-person-widget, .sort-widget, .domain-panel-widget, .photo-panel-widget, .board-moving-btn, .board-user-badge, .board-logo'
          )
        ) {
          return;
        }
        // If an interactive drawer/panel was open, let that panel's own handler close it first
        if (
          document.querySelector(
            '.add-person-widget.is-expanded, .sort-widget.is-expanded, .domain-panel-widget.is-open, .photo-panel-widget.is-open'
          )
        ) {
          return;
        }
        this.deselectPerson();
      });
    }

    // 2. Center White Circular Info Panel (315 × 315 px on 1440 × 900 artboard)
    let panel = this.container.querySelector('#boardCenterInfoPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'boardCenterInfoPanel';
      panel.className = 'center-info-panel';
      panel.setAttribute('aria-label', 'Selected person details');

      // Subtle bottom-right rim arc scaled proportionally from board ui-01.svg (r=141.6543 -> r=157.5)
      panel.innerHTML = `
        <svg class="center-info-arc-svg" viewBox="0 0 315 315" width="315" height="315" aria-hidden="true">
          <g style="opacity: 0.41;">
            <path d="M 299.811 224.985 L 289.704 220.192 C 272.078 257.297 239.057 286.844 196.445 298.605 L 198.272 305.223"
              fill="none" stroke="#000000" stroke-miterlimit="10" stroke-width="1.5" />
          </g>
        </svg>
        <div class="center-info-square" id="centerInfoSquare">
          <div class="center-info-header" id="centerInfoHeader"></div>
          <div class="center-info-scroll" id="centerInfoScroll">
            <div class="center-info-meta" id="centerInfoMeta">
              <span class="center-info-place" id="centerInfoPlace"></span>
              <span class="center-info-year" id="centerInfoYear"></span>
            </div>
            <div class="center-info-body" id="centerInfoBody"></div>
            <div class="center-info-links" id="centerInfoLinks"></div>
          </div>
        </div>
      `;

      // Insert right after the concentric SVG so it stays below buttons/expanded panels
      if (this.svg.nextSibling) {
        this.container.insertBefore(panel, this.svg.nextSibling);
      } else {
        this.container.appendChild(panel);
      }
    }

    this.centerPanelEl = panel;
    if (this.emptyMode) {
      this.centerPanelEl.style.display = 'none';
    }
    this.centerHeaderEl = panel.querySelector('#centerInfoHeader');
    this.centerScrollEl = panel.querySelector('#centerInfoScroll');
    this.centerMetaEl = panel.querySelector('#centerInfoMeta');
    this.centerPlaceEl = panel.querySelector('#centerInfoPlace');
    this.centerYearEl = panel.querySelector('#centerInfoYear');
    this.centerBodyEl = panel.querySelector('#centerInfoBody');
    this.centerLinksEl = panel.querySelector('#centerInfoLinks');

    // Forward wheel events on the center circular panel:
    // When photo is attached, 2-phase scroll contracts the photo frame into baseline header first,
    // then smoothly scrolls the meta and body text below.
    if (!this._wheelBound) {
      this._wheelBound = true;
      this.centerPanelEl.addEventListener(
        'wheel',
        (e) => {
          if (!this.selectedPersonId || !this.centerScrollEl) return;
          let dy = e.deltaY;
          if (e.deltaMode === 1) dy *= 20;
          else if (e.deltaMode === 2) dy *= 218;

          if (this.hasSelectedPhoto) {
            e.preventDefault();
            this.centerVirtualScrollY = Math.max(0, this.centerVirtualScrollY + dy);
            const threshold = this.photoContractThreshold;
            const p = Math.min(1, Math.max(0, this.centerVirtualScrollY / threshold));
            this.updatePhotoFrameScrollProgress(p);

            if (this.centerVirtualScrollY > threshold) {
              this.centerScrollEl.scrollTop = this.centerVirtualScrollY - threshold;
            } else {
              this.centerScrollEl.scrollTop = 0;
            }
          } else {
            if (!e.target.closest('.center-info-scroll')) {
              e.preventDefault();
              this.centerScrollEl.scrollTop += dy;
            }
          }
        },
        { passive: false }
      );

      this.centerScrollEl.addEventListener('scroll', () => {
        if (this.hasSelectedPhoto && this.centerVirtualScrollY >= this.photoContractThreshold) {
          this.centerVirtualScrollY = this.photoContractThreshold + this.centerScrollEl.scrollTop;
        }
      });
    }
  }

  /**
   * Scales the 315 × 315 px center circular panel in exact lockstep with the
   * 1440 × 900 SVG viewBox (preserveAspectRatio="xMidYMid meet").
   */
  updateCenterPanelScale() {
    if (!this.centerPanelEl) return;
    const vw = this.container.clientWidth || window.innerWidth || 1440;
    const vh = this.container.clientHeight || window.innerHeight || 900;
    const s = Math.min(vw / 1440, vh / 900);
    this.centerPanelEl.style.transform = `translate(-50%, -50%) scale(${s.toFixed(6)})`;
  }

  /**
   * Pre-measures a name and generates glyph metrics and stem positions with kerning (-3).
   */
  measureName(name) {
    const words = name.toLowerCase().split(/\s+/).filter(Boolean);
    const glyphs = [];
    let curRelX = 0;
    const spaceMetrics = getCharMetrics(' ');
    const spaceAdvance = spaceMetrics.advance + this.tracking;

    for (let w = 0; w < words.length; w++) {
      const wordStr = words[w];
      const isFirstWord = w === 0;
      const isLastWord = w === words.length - 1;

      for (let c = 0; c < wordStr.length; c++) {
        const ch = wordStr[c];
        const nextCh = wordStr[c + 1] || (w < words.length - 1 ? words[w + 1][0] : null);
        const m = getCharMetrics(ch);
        const kern = nextCh ? getHelveticaKerning(ch, nextCh) : 0;
        const step = m.advance + kern + this.tracking;

        glyphs.push({
          char: ch,
          isFirst: isFirstWord && c === 0,
          isLast: isLastWord && c === wordStr.length - 1,
          relX: curRelX,
          metrics: m,
          step
        });

        curRelX += step;
      }

      if (!isLastWord) {
        curRelX += spaceAdvance;
      }
    }

    if (glyphs.length === 0) return null;

    const first = glyphs[0];
    const last = glyphs[glyphs.length - 1];

    const fDb = CUSTOM_GLYPH_DB[first.char]?.front || CUSTOM_GLYPH_DB['a'].front;
    const bDb = CUSTOM_GLYPH_DB[last.char]?.back || CUSTOM_GLYPH_DB['a'].back;

    const fTx = first.metrics.lsb - fDb.letterMinX;
    const bTx = last.metrics.lsb - bDb.letterMinX;

    const dropX = fTx + fDb.dropStemLeftX;
    const riseX = last.relX + bTx + bDb.riseStemRightX;

    return {
      name,
      glyphs,
      textWidth: curRelX,
      dropX,
      riseX,
      fDb,
      bDb
    };
  }

  /**
   * Generates the two square dots SVG markup underneath a person's underline along the circular path.
   */
  buildSelectionDotsMarkup(radius, dropTheta, riseTheta, color = '#000000') {
    let sweep = riseTheta - dropTheta;
    while (sweep < 0) sweep += 2 * Math.PI;
    const midTheta = dropTheta + sweep / 2;

    const dotSize = 4.5;
    const halfDot = dotSize / 2;
    // Place dots cleanly beneath the underline's inner edge along the circular curve
    const dotRadius = radius - this.strokeWidth / 2 - 4.0 - halfDot;
    const halfArcSeparation = 5.2; // Center-to-center arc spacing = 10.4px (~5.9px clear gap)
    const dTheta = halfArcSeparation / dotRadius;

    const angles = [midTheta - dTheta, midTheta + dTheta];
    const rects = angles.map((theta) => {
      const dx = dotRadius * Math.cos(theta);
      const dy = dotRadius * Math.sin(theta);
      const rotDeg = (theta * 180) / Math.PI + 90;
      return `<rect x="${(-halfDot).toFixed(2)}" y="${(-halfDot).toFixed(2)}" width="${dotSize}" height="${dotSize}" fill="${color}" transform="translate(${dx.toFixed(3)}, ${dy.toFixed(3)}) rotate(${rotDeg.toFixed(3)})" />`;
    });

    return `<g class="selected-person-dots" data-selected-dots="true">${rects.join('')}</g>`;
  }

  /**
   * Renders the complete concentric rings formation.
   */
  render() {
    if (!this.svg) return;

    this.namePlacementMap.clear();

    // Base white circle inside SVG (matches the 315 × 315 HTML circular panel behind it, 1px outline)
    const centerCircleHtml = `
      <g id="boardCenterInfoGroup" class="board-center-info-group">
        <circle id="boardCenterCircle" cx="${this.cx}" cy="${this.cy}" r="${this.centerRadius}" fill="${this.centerColor}" stroke="#000000" stroke-width="1" />
      </g>
    `;

    const scale = this.scale;
    const strokeWidth = this.strokeWidth;
    const baselineOffsetLocal = this.baselineOffsetLocal;
    const ringsMarkup = [];

    this.rings.forEach((ring, ringIdx) => {
      const radius = ring.radius;
      const startAngleDeg = ring.startAngleDeg ?? 0;
      const parsedNames = ring.names.map((n) => this.measureName(n)).filter(Boolean);
      if (parsedNames.length === 0) return;

      const C = 2 * Math.PI * radius;
      const baseLen = C / scale;
      const totalTextWidth = parsedNames.reduce((s, p) => s + p.textWidth, 0);
      const gap = parsedNames.length > 0 ? (baseLen - totalTextWidth) / parsedNames.length : 0;

      let curTheta = (startAngleDeg * Math.PI) / 180;
      const ringNameGroups = [];

      parsedNames.forEach((p, pIdx) => {
        const personId = p.name.toLowerCase();
        const dropTheta = curTheta + (p.dropX * scale) / radius;
        const riseTheta = curTheta + (p.riseX * scale) / radius;

        this.namePlacementMap.set(personId, {
          ringIdx,
          radius,
          dropTheta,
          riseTheta
        });

        const x1 = radius * Math.cos(dropTheta);
        const y1 = radius * Math.sin(dropTheta);
        const x2 = radius * Math.cos(riseTheta);
        const y2 = radius * Math.sin(riseTheta);

        let sweep = riseTheta - dropTheta;
        while (sweep < 0) sweep += 2 * Math.PI;
        const largeArc = sweep > Math.PI ? 1 : 0;

        const arcPath = `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;

        // Wide transparent hit arc covering both letters and underline for effortless clicking while moving
        const hitRadius = radius + 13;
        const hx1 = hitRadius * Math.cos(dropTheta);
        const hy1 = hitRadius * Math.sin(dropTheta);
        const hx2 = hitRadius * Math.cos(riseTheta);
        const hy2 = hitRadius * Math.sin(riseTheta);
        const hitArcPath = `M ${hx1.toFixed(3)} ${hy1.toFixed(3)} A ${hitRadius.toFixed(3)} ${hitRadius.toFixed(3)} 0 ${largeArc} 1 ${hx2.toFixed(3)} ${hy2.toFixed(3)}`;

        const glyphMarkup = [];
        p.glyphs.forEach((g) => {
          const theta = curTheta + (g.relX * scale) / radius;
          const gx = radius * Math.cos(theta);
          const gy = radius * Math.sin(theta);
          const angleDeg = (theta * 180) / Math.PI + 90;

          if (g.isFirst) {
            const tx = g.metrics.lsb - p.fDb.letterMinX;
            const ty = baselineOffsetLocal - p.fDb.baseline;
            const cleanSvg = stripUnderlineStub(p.fDb.innerSvg, p.fDb.baseline);
            glyphMarkup.push(`
              <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
                ${cleanSvg}
              </g>
            `);
          } else if (g.isLast) {
            const tx = g.metrics.lsb - p.bDb.letterMinX;
            const ty = baselineOffsetLocal - p.bDb.baseline;
            const cleanSvg = stripUnderlineStub(p.bDb.innerSvg, p.bDb.baseline);
            glyphMarkup.push(`
              <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
                ${cleanSvg}
              </g>
            `);
          } else if (g.metrics.d) {
            glyphMarkup.push(`
              <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(0, ${baselineOffsetLocal.toFixed(3)})">
                <path d="${g.metrics.d}" />
              </g>
            `);
          }
        });

        const isSelected = personId === this.selectedPersonId;
        const nameColor = this.getNameColor(personId);
        const personObj = this.people.get(personId);
        const domainKey = normalizeDomainKey(personObj?.domain || '');
        const dotsHtml = isSelected
          ? this.buildSelectionDotsMarkup(radius, dropTheta, riseTheta, nameColor)
          : '';

        ringNameGroups.push(`
          <g class="concentric-name-group ${isSelected ? 'is-selected' : ''}" data-person-id="${this.escapeAttr(personId)}" data-domain="${this.escapeAttr(domainKey)}" fill="${nameColor}" style="cursor: pointer; pointer-events: auto;">
            <path d="${hitArcPath}" fill="none" stroke="transparent" stroke-width="38" stroke-linecap="butt" class="name-hit-area" style="pointer-events: stroke;" />
            <path d="${arcPath}" fill="none" stroke="${nameColor}" stroke-width="${strokeWidth.toFixed(4)}" stroke-linecap="butt" class="name-underline ring-${ringIdx}-name-${pIdx}" />
            <g class="name-glyphs">${glyphMarkup.join('')}</g>
            ${dotsHtml}
          </g>
        `);

        curTheta += ((p.textWidth + gap) * scale) / radius;
      });

      const flowDeg = ((this.animOffset * this.scale) / radius) * (180 / Math.PI);
      ringsMarkup.push(`
        <g id="concentricRing_${ringIdx}" class="concentric-ring ring-${ringIdx}" transform="rotate(${(flowDeg % 360).toFixed(4)})">
          ${ringNameGroups.join('\n')}
        </g>
      `);
    });

    this.svg.innerHTML = `
      ${centerCircleHtml}
      <g id="boardConcentricRingsGroup" class="board-concentric-rings-group" transform="translate(${this.cx}, ${this.cy}) rotate(${this.rotationAngle.toFixed(4)})" fill="#000000">
        ${ringsMarkup.join('\n')}
      </g>
    `;

    // Cache DOM refs for 60fps animation transforms
    this.ringsMasterGroupEl = this.svg.querySelector('#boardConcentricRingsGroup');
    this.ringGroupEls = this.rings.map((_, idx) => this.svg.querySelector(`#concentricRing_${idx}`));
  }

  escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Selects a person by ID/name:
   *  - Moves the two square dots underneath their name along its circular path
   *  - Updates the white circular info panel (fixed Nopitac name + scrollable place/year/description)
   *  - Sets the entire board background to their domain color
   */
  selectPerson(personId) {
    const key = String(personId || '').trim().toLowerCase();
    if (!key || !this.people.has(key)) return;

    this.selectedPersonId = key;
    this.updateSelectionDotsInDom();
    if (this.sortBy === 'domains') {
      this.updateNameColorsInDom();
    }
    this.updateSelectionUI();
  }

  /**
   * Clears active selection, removes selection dots, empties center panel,
   * and returns the board background to pure white (#ffffff).
   */
  deselectPerson() {
    if (!this.selectedPersonId) return;
    this.selectedPersonId = null;
    this.updateSelectionDotsInDom();
    if (this.sortBy === 'domains') {
      this.updateNameColorsInDom();
    }
    this.updateSelectionUI();
  }

  /**
   * Updates fill/stroke colors of all rendered name groups in-place without rebuilding DOM or interrupting motion.
   */
  updateNameColorsInDom() {
    if (!this.svg) return;
    this.svg.querySelectorAll('.concentric-name-group').forEach((g) => {
      const pid = g.getAttribute('data-person-id');
      const color = this.getNameColor(pid);
      g.setAttribute('fill', color);
      const underline = g.querySelector('.name-underline');
      if (underline) underline.setAttribute('stroke', color);
      g.querySelectorAll('.selected-person-dots rect').forEach((r) => {
        r.setAttribute('fill', color);
      });
    });
  }

  /**
   * Packs an ordered list of person IDs sequentially from the inner circle (R=183.2) outward
   * into concentric rings without separating domains onto separate circles.
   */
  packNamesIntoRings(orderedNames) {
    const startAngles = [-79, -120, -113, -90];
    const minGap = 28; // Comfortable inter-name gap in unscaled font units
    const packed = [];
    let ringIdx = 0;
    let cursor = 0;

    while (cursor < orderedNames.length) {
      const radius = 183.2 + ringIdx * this.ringSpacing;
      const baseLen = (2 * Math.PI * radius) / this.scale;
      const ringNames = [];
      let totalW = 0;

      while (cursor < orderedNames.length) {
        const name = orderedNames[cursor];
        const m = this.measureName(name);
        if (!m) {
          cursor++;
          continue;
        }
        const needed = totalW + m.textWidth + (ringNames.length + 1) * minGap;
        if (ringNames.length > 0 && needed > baseLen) {
          break;
        }
        ringNames.push(name);
        totalW += m.textWidth;
        cursor++;
      }

      if (ringNames.length > 0) {
        packed.push({
          radius,
          names: ringNames,
          startAngleDeg: startAngles[ringIdx] ?? -90
        });
      }
      ringIdx++;
    }

    return packed;
  }

  /**
   * Applies Sort & Domain Filter options from SortButton:
   *  - sortBy === 'name': Alphabetical A -> Z from inner circle to outer circle
   *  - sortBy === 'domains': Clubbed continuously by domain across circles + colored in domain colors
   *  - sortBy === 'date-added': Chronological by recorded dateAdded timestamp (newest first, inner -> outer)
   *  - sortBy === null: Default board formation
   *  - domains: Optional array of domain keys to filter visible names
   */
  applySortAndFilter(options = {}) {
    this.sortBy = options.sortBy ?? null;
    this.filterDomains = Array.isArray(options.domains)
      ? options.domains.map((d) => normalizeDomainKey(d)).filter(Boolean)
      : [];

    this.rebuildRingsForCurrentSort();
    this.render();
    this.updateSelectionUI();
  }

  rebuildRingsForCurrentSort() {
    // 1. Filter master person list by active domain chips (if any selected)
    let activeIds = [...this.personOrder];
    if (this.emptyMode || activeIds.length === 0) {
      this.rings = [];
      return;
    }
    if (this.filterDomains.length > 0) {
      const allowed = new Set(this.filterDomains);
      activeIds = activeIds.filter((id) => {
        const p = this.people.get(id);
        return p && allowed.has(normalizeDomainKey(p.domain));
      });
    }

    // If the currently selected person is filtered out, clear selection back to white background
    if (this.selectedPersonId && !activeIds.includes(this.selectedPersonId)) {
      this.selectedPersonId = null;
    }

    // 2. If default (no sortBy and no domain filter), preserve original ring structure + appended newcomers
    if (!this.sortBy && this.filterDomains.length === 0) {
      if (this.startedEmpty) {
        this.rings = this.packNamesIntoRings(activeIds);
        return;
      }
      const activeSet = new Set(activeIds);
      const baseRings = this.baseRings.map((r) => ({
        radius: r.radius,
        names: r.names.filter((n) => activeSet.has(n)),
        startAngleDeg: r.startAngleDeg ?? 0
      }));
      const initialSet = new Set(baseRings.flatMap((r) => r.names));
      const extras = activeIds.filter((id) => !initialSet.has(id));
      this.rings = baseRings;
      extras.forEach((id) => this._appendNameToRings(id));
      return;
    }

    // 3. Sort activeIds according to active sortBy mode
    if (this.sortBy === 'name') {
      activeIds.sort((a, b) => a.localeCompare(b));
    } else if (this.sortBy === 'domains') {
      const domainRank = (id) => {
        const p = this.people.get(id);
        const dk = normalizeDomainKey(p?.domain || '');
        const idx = this.domainOrder.indexOf(dk);
        return idx >= 0 ? idx : 9999;
      };
      activeIds.sort((a, b) => {
        const ra = domainRank(a);
        const rb = domainRank(b);
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });
    } else if (this.sortBy === 'date-added') {
      activeIds.sort((a, b) => {
        const pa = this.people.get(a);
        const pb = this.people.get(b);
        return (pb?.dateAdded || 0) - (pa?.dateAdded || 0);
      });
    }

    // 4. Pack sequentially from inner circle outward
    this.rings = this.packNamesIntoRings(activeIds);
  }

  _appendNameToRings(cleanName) {
    const measured = this.measureName(cleanName);
    if (!measured) return;
    let placed = false;
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const C = 2 * Math.PI * ring.radius;
      const baseLen = C / this.scale;
      const parsed = ring.names.map((n) => this.measureName(n)).filter(Boolean);
      const curTotalW = parsed.reduce((s, p) => s + p.textWidth, 0);
      const needed = curTotalW + measured.textWidth + (parsed.length + 1) * 15;
      if (needed <= baseLen) {
        ring.names.push(cleanName);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const lastRing = this.rings[this.rings.length - 1];
      const newRadius = lastRing ? Math.round(lastRing.radius + this.ringSpacing) : 363.2;
      this.rings.push({
        radius: newRadius,
        names: [cleanName],
        startAngleDeg: -90
      });
    }
  }

  /**
   * Updates the two square dots in the live SVG DOM without rebuilding the rings or interrupting motion.
   */
  updateSelectionDotsInDom() {
    if (!this.svg) return;

    // Remove existing dots and selected class
    this.svg.querySelectorAll('.selected-person-dots').forEach((el) => el.remove());
    this.svg.querySelectorAll('.concentric-name-group.is-selected').forEach((el) => {
      el.classList.remove('is-selected');
    });

    const placement = this.namePlacementMap.get(this.selectedPersonId);
    if (!placement) return;

    const groups = this.svg.querySelectorAll('.concentric-name-group');
    let targetGroup = null;
    for (const g of groups) {
      if (g.getAttribute('data-person-id') === this.selectedPersonId) {
        targetGroup = g;
        break;
      }
    }

    if (targetGroup) {
      targetGroup.classList.add('is-selected');
      const dotsMarkup = this.buildSelectionDotsMarkup(
        placement.radius,
        placement.dropTheta,
        placement.riseTheta,
        this.getNameColor(this.selectedPersonId)
      );
      targetGroup.insertAdjacentHTML('beforeend', dotsMarkup);
    }
  }

  /**
   * Updates the center circular panel content and board background color for the selected person.
   * When nothing is selected, keeps the center panel empty and the board background pure white (#ffffff).
   */
  updateSelectionUI() {
    const person = this.selectedPersonId ? this.people.get(this.selectedPersonId) : null;
    this.centerVirtualScrollY = 0;

    if (!person) {
      this.applyBoardBackgroundColor('#ffffff');
      this.hasSelectedPhoto = false;
      if (this.centerHeaderEl) {
        this.centerHeaderEl.innerHTML = '';
        this.centerHeaderEl.style.height = '';
      }
      if (this.centerPlaceEl) this.centerPlaceEl.textContent = '';
      if (this.centerYearEl) this.centerYearEl.textContent = '';
      if (this.centerMetaEl) this.centerMetaEl.style.display = 'none';
      if (this.centerBodyEl) this.centerBodyEl.innerHTML = '';
      if (this.centerLinksEl) {
        this.centerLinksEl.innerHTML = '';
        this.centerLinksEl.style.display = 'none';
      }
      if (this.centerScrollEl) this.centerScrollEl.scrollTop = 0;
      if (this.centerPanelEl) {
        this.centerPanelEl.classList.remove('has-selection', 'is-theme-dark', 'is-theme-light');
        this.centerPanelEl.removeAttribute('data-selected-person');
        this.centerPanelEl.removeAttribute('data-selected-domain');
        this.centerPanelEl.setAttribute('data-domain-color', '#ffffff');
      }
      if (typeof this.onSelectionChange === 'function') {
        this.onSelectionChange(null, null);
      }
      return;
    }

    if (this.centerPanelEl) {
      this.centerPanelEl.classList.add('has-selection');
    }

    // 1. Update board background color to the person's domain color
    const domainColor = this.getDomainColor(person.domain);
    this.applyBoardBackgroundColor(domainColor);

    // 2. Check if photo attached: if yes, reflect theme and render contracting photo frame;
    //    if no, render standard fixed 28pt Nopitac header.
    const hasPhoto = Boolean(person.photo && person.photo.imageHref);
    this.hasSelectedPhoto = hasPhoto;

    if (hasPhoto) {
      const theme = person.photo.theme || 'dark';
      if (this.centerPanelEl) {
        this.centerPanelEl.classList.toggle('is-theme-dark', theme === 'dark');
        this.centerPanelEl.classList.toggle('is-theme-light', theme === 'light');
      }
      this.updatePhotoFrameScrollProgress(0);
    } else {
      if (this.centerPanelEl) {
        this.centerPanelEl.classList.remove('is-theme-dark');
        this.centerPanelEl.classList.add('is-theme-light');
      }
      if (this.centerHeaderEl) {
        this.centerHeaderEl.style.height = '';
        const rendered = this.nameRenderer.render(person.fullName, 0);
        if (rendered && rendered.svgString) {
          const targetScale = 28 / FONT_SIZE;
          const naturalW = rendered.vbWidth * targetScale;
          const naturalH = rendered.vbHeight * targetScale;
          const maxW = 216;
          const finalScale = naturalW > maxW ? maxW / naturalW : 1;
          const w = (naturalW * finalScale).toFixed(2);
          const h = (naturalH * finalScale).toFixed(2);

          const cleanSvgString = rendered.svgString
            .replace(/<text\b[^>]*class="nopitac-selectable-text"[^>]*>[\s\S]*?<\/text>/gi, '')
            .replace(
              /<svg\s+([^>]*?)>/,
              `<svg class="center-info-name-svg" viewBox="${rendered.viewBox}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`
            );

          this.centerHeaderEl.innerHTML = cleanSvgString;
        } else {
          this.centerHeaderEl.textContent = person.fullName;
        }
      }
    }

    // 3. Populate scrollable meta & 16px body description
    if (this.centerPlaceEl) {
      this.centerPlaceEl.textContent = (person.place || '').toLowerCase();
    }
    if (this.centerYearEl) {
      this.centerYearEl.textContent = person.year || '';
    }
    if (this.centerMetaEl) {
      const hasMeta = Boolean((person.place || '').trim() || (person.year || '').trim());
      this.centerMetaEl.style.display = hasMeta ? 'flex' : 'none';
    }
    if (this.centerBodyEl) {
      this.centerBodyEl.innerHTML = '';
      const rawText = (person.description || '').trim();
      const paragraphs = rawText.split(/\n+/).filter(Boolean);
      paragraphs.forEach((pText) => {
        const p = document.createElement('p');
        p.className = 'center-info-paragraph';
        p.textContent = pText;
        this.centerBodyEl.appendChild(p);
      });
    }

    this.renderPersonLinks(person.links);

    // Reset scroll position to top when switching person
    if (this.centerScrollEl) {
      this.centerScrollEl.scrollTop = 0;
    }

    // Expose active domain metadata on panel & container for easy inspection
    if (this.centerPanelEl) {
      this.centerPanelEl.setAttribute('data-selected-person', person.fullName);
      this.centerPanelEl.setAttribute('data-selected-domain', person.domain || '');
      this.centerPanelEl.setAttribute('data-domain-color', domainColor);
    }

    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange(person.id, person);
    }
  }

  /**
   * Renders the contracting photo frame inside the center circle.
   * At p = 0: Full photo frame (stationary square mask, image, bracket rails, name).
   * As p -> 1: The square mask height collapses, bracket rails collapse into baseline drop/rise stems,
   *            bottom rail merges into baseline underline, until the name reaches its standard baseline state!
   */
  updatePhotoFrameScrollProgress(p) {
    if (!this.centerHeaderEl || !this.selectedPersonId) return;
    const person = this.people.get(this.selectedPersonId);
    if (!person || !person.photo || !person.photo.imageHref) return;

    const photo = person.photo;
    const theme = photo.theme || 'dark';
    const textColor = theme === 'dark' ? '#ffffff' : '#000000';
    const metrics = this.photoEngine.calculateMetrics(person.fullName);
    if (!metrics) return;

    // Target width of square mask: 135px (fits comfortably in 218px square inside 315px circle)
    const targetSquareSize = 135;
    const scale = targetSquareSize / metrics.underlineWidth;
    const textAscent = Math.abs(metrics.fTy * scale);

    // Contraction progress p in [0, 1] using unified PhotoFrameEngine geometry
    const geom = this.photoEngine.computeCollapseGeometry(metrics, scale, p);
    const word = this.photoEngine.buildWordLayers(metrics, scale, textColor);

    // Dynamic header height: at p=0 fits full square frame; at p=1 collapses to text + curUnderlineY
    const fullHeight = textAscent + geom.squareBottomPx + 8;
    const baseHeight = textAscent + geom.stemTopY + geom.strokeW + 8;
    const currentHeaderHeight = baseHeight + (fullHeight - baseHeight) * (1 - geom.p);

    this.centerHeaderEl.style.height = `${currentHeaderHeight.toFixed(2)}px`;

    // Width of SVG canvas
    const padX = 8;
    const svgW = geom.squareSizePx + padX * 2;
    const shiftX = padX - geom.squareXPx;
    const shiftY = textAscent; // baseline is at y = shiftY

    const clipId = 'center-circle-photo-clip';
    const clipRectX = geom.squareXPx + shiftX;
    const clipRectY = shiftY + geom.squareYPx;

    // Image placement inside square mask
    const imgPlacement = this.photoEngine.calculateImagePlacement(
      clipRectX,
      clipRectY,
      geom.squareSizePx,
      {
        imageNaturalWidth: photo.imageNaturalWidth || 200,
        imageNaturalHeight: photo.imageNaturalHeight || 200,
        imageScale: photo.imageScale || 1.05,
        imagePanX: photo.imagePanX || 0,
        imagePanY: photo.imagePanY || 0
      }
    );

    const svgMarkup = `
      <svg class="center-photo-frame-svg" viewBox="0 0 ${svgW.toFixed(2)} ${currentHeaderHeight.toFixed(2)}" width="${svgW.toFixed(2)}" height="${currentHeaderHeight.toFixed(2)}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="${clipId}">
            <rect x="${clipRectX.toFixed(3)}" y="${clipRectY.toFixed(3)}" width="${geom.squareSizePx.toFixed(3)}" height="${geom.clipMaskHeight.toFixed(3)}" />
          </clipPath>
        </defs>

        <!-- Layer 1: Clipped Image (collapses vertically as p -> 1) -->
        <g clip-path="url(#${clipId})">
          <image href="${photo.imageHref}" x="${imgPlacement.x.toFixed(3)}" y="${imgPlacement.y.toFixed(3)}" width="${imgPlacement.width.toFixed(3)}" height="${imgPlacement.height.toFixed(3)}" preserveAspectRatio="none" opacity="${geom.imageOpacity.toFixed(3)}" />
        </g>

        <!-- Layer 2: Extended Bracket Rails & Baseline Underline -->
        <g transform="translate(${shiftX.toFixed(3)}, ${shiftY.toFixed(3)})" fill="${textColor}">
          ${word.frontFallbackExt}
          ${word.backFallbackExt}

          <!-- Left bracket stem: joins stemTopY flush down to rising bottom rail -->
          <rect x="${word.leftStemX.toFixed(3)}" y="${geom.stemTopY.toFixed(3)}" width="${geom.strokeW.toFixed(3)}" height="${geom.stemHeight.toFixed(3)}" />

          <!-- Bottom underline: moves up to curUnderlineY as p -> 1 -->
          <rect x="${geom.squareXPx.toFixed(3)}" y="${geom.bottomUnderlineY.toFixed(3)}" width="${geom.squareSizePx.toFixed(3)}" height="${geom.strokeW.toFixed(3)}" />

          <!-- Right bracket stem: joins stemTopY flush down to rising bottom rail -->
          <rect x="${word.rightStemX.toFixed(3)}" y="${geom.stemTopY.toFixed(3)}" width="${geom.strokeW.toFixed(3)}" height="${geom.stemHeight.toFixed(3)}" />

          <!-- Front letter with drop-stem anchor -->
          <g transform="translate(${(metrics.fTx * scale).toFixed(3)}, ${(metrics.fTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
            ${word.fInnerClean}
          </g>

          <!-- Middle Letters -->
          ${word.middlePaths.join('\n          ')}

          <!-- Back letter with rise-stem anchor -->
          <g transform="translate(${(metrics.bTx * scale).toFixed(3)}, ${(metrics.bTy * scale).toFixed(3)}) scale(${scale.toFixed(5)})">
            ${word.bInnerClean}
          </g>
        </g>
      </svg>
    `.trim();

    this.centerHeaderEl.innerHTML = svgMarkup;
  }

  applyBoardBackgroundColor(color) {
    if (!color) return;
    if (this.container) {
      this.container.style.backgroundColor = color;
    }
    // On standalone board.html, also tint body & html so viewport edges match seamlessly
    if (this.container && this.container.id === 'boardViewport') {
      document.body.style.backgroundColor = color;
      document.documentElement.style.backgroundColor = color;
    }
  }

  /**
   * Starts smooth 60fps composition motion combining:
   *  - Animation 1: differential flow along each circular track (animSpeed * 0.2)
   *  - Animation 2: master rotation around the center (rotationSpeed * 0.2)
   */
  startAnimation() {
    if (this.animFrameId) return;
    this.lastTimestamp = null;

    const tick = (timestamp) => {
      if (this.lastTimestamp === null) {
        this.lastTimestamp = timestamp;
      }
      const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
      this.lastTimestamp = timestamp;

      // Animation 1: flow along circular tracks at 0.2x speed
      this.animOffset += this.animSpeed * this.speedMultiplier * dt;
      // Animation 2: master rotation around center at 0.2x speed
      this.rotationAngle =
        (this.rotationAngle + this.rotationSpeed * this.speedMultiplier * dt) % 360;

      this.applyAnimationTransforms();
      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  stopAnimation() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  applyAnimationTransforms() {
    if (this.ringsMasterGroupEl) {
      this.ringsMasterGroupEl.setAttribute(
        'transform',
        `translate(${this.cx}, ${this.cy}) rotate(${this.rotationAngle.toFixed(4)})`
      );
    }
    if (this.ringGroupEls) {
      for (let i = 0; i < this.rings.length; i++) {
        const el = this.ringGroupEls[i];
        if (!el) continue;
        const radius = this.rings[i].radius;
        const flowDeg = (((this.animOffset * this.scale) / radius) * (180 / Math.PI)) % 360;
        el.setAttribute('transform', `rotate(${flowDeg.toFixed(4)})`);
      }
    }
  }

  parseLinks(rawLinks) {
    const raw = String(rawLinks || '').trim();
    if (!raw) return [];
    const tokens = raw
      .split(/[\n,;]+/)
      .flatMap((part) => {
        const trimmed = part.trim();
        if (!trimmed) return [];
        const spaceParts = trimmed.split(/\s+/).filter(Boolean);
        if (
          spaceParts.length > 1 &&
          spaceParts.every((seg) => /^(https?:\/\/|mailto:|tel:|www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(seg))
        ) {
          return spaceParts;
        }
        return [trimmed];
      })
      .filter(Boolean);

    return tokens.map((label) => {
      const hasScheme = /^(https?:\/\/|mailto:|tel:)/i.test(label);
      const href = hasScheme ? label : `https://${label}`;
      return { href, label };
    });
  }

  renderPersonLinks(rawLinks) {
    if (!this.centerLinksEl) return;
    this.centerLinksEl.innerHTML = '';
    const links = this.parseLinks(rawLinks);
    if (links.length === 0) {
      this.centerLinksEl.style.display = 'none';
      return;
    }

    this.centerLinksEl.style.display = 'flex';
    links.forEach(({ href, label }) => {
      const a = document.createElement('a');
      a.className = 'center-info-link';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      a.addEventListener('click', (e) => e.stopPropagation());
      this.centerLinksEl.appendChild(a);
    });
  }

  /**
   * Dynamically adds a full person record from the Add Person panel, records the exact
   * dateAdded timestamp, places them into the rings (respecting active sort/filter),
   * and immediately selects them.
   */
  addPerson(data, options = {}) {
    if (!data || !data.fullName || !data.fullName.trim()) return;
    const cleanName = data.fullName.trim().toLowerCase();
    const existedBefore = this.people.has(cleanName);

    if (this.emptyMode) {
      this.emptyMode = false;
      if (this.svg) this.svg.style.display = '';
      if (this.centerPanelEl) this.centerPanelEl.style.display = '';
      try {
        localStorage.removeItem('nopitac_board_mode');
      } catch (e) {}
    }

    const domain = (data.domain || '').trim() || 'artists';
    const domainColor = data.domainColor || (domain ? this.getDomainColor(domain) : '#27ff83');
    this.registerDomainColor(domain, domainColor);
    const description =
      (data.whyCool || '').trim() ||
      LOREM_PARAGRAPHS[this.people.size % LOREM_PARAGRAPHS.length];
    const now = typeof data.dateAdded === 'number' ? data.dateAdded : Date.now();

    this.people.set(cleanName, {
      id: cleanName,
      fullName: cleanName,
      domain,
      place: (data.place || '').trim().toLowerCase(),
      year: (data.year || '').trim(),
      description,
      links: (data.links || '').trim(),
      photos: Array.isArray(data.photos) ? [...data.photos] : [null],
      photo: data.photo || (data.photos && data.photos[0] ? { imageHref: data.photos[0], theme: 'dark' } : null),
      dateAdded: now,
      dateAddedISO: new Date(now).toISOString()
    });

    if (!this.personOrder.includes(cleanName)) {
      this.personOrder.push(cleanName);
    }

    this.selectedPersonId = cleanName;
    this.rebuildRingsForCurrentSort();
    this.render();
    this.updateSelectionUI();

    if (!options.silent && !existedBefore && this.onPersonAdded) {
      this.onPersonAdded(this.people.size);
    }
  }

  /**
   * Updates an existing person's metadata (including renaming across rings/order) and re-renders.
   */
  updatePerson(originalId, data) {
    if (!data || !data.fullName || !data.fullName.trim()) return;
    const prevKey = String(originalId || '').trim().toLowerCase();
    const newKey = data.fullName.trim().toLowerCase();
    const existing = this.people.get(prevKey);

    if (!existing) {
      this.addPerson(data);
      return;
    }

    const domain = (data.domain || '').trim() || existing.domain || 'artists';
    const domainColor = data.domainColor || (domain ? this.getDomainColor(domain) : '#27ff83');
    this.registerDomainColor(domain, domainColor);

    const updatedRecord = {
      id: newKey,
      fullName: newKey,
      domain,
      place: (data.place ?? existing.place ?? '').trim().toLowerCase(),
      year: (data.year ?? existing.year ?? '').trim(),
      description: (data.whyCool || '').trim() || existing.description || '',
      links: (data.links ?? existing.links ?? '').trim(),
      photos: Array.isArray(data.photos) ? [...data.photos] : (existing.photos || [null]),
      photo: data.photo !== undefined ? data.photo : (existing.photo || null),
      dateAdded: existing.dateAdded,
      dateAddedISO: existing.dateAddedISO
    };

    if (prevKey !== newKey) {
      this.people.delete(prevKey);
      const orderIdx = this.personOrder.indexOf(prevKey);
      if (orderIdx >= 0) {
        if (this.personOrder.includes(newKey)) {
          this.personOrder.splice(orderIdx, 1);
        } else {
          this.personOrder[orderIdx] = newKey;
        }
      } else if (!this.personOrder.includes(newKey)) {
        this.personOrder.push(newKey);
      }

      if (Array.isArray(this.baseRings)) {
        this.baseRings.forEach((r) => {
          r.names = r.names.map((n) => (n === prevKey ? newKey : n));
        });
      }
    }

    this.people.set(newKey, updatedRecord);
    this.selectedPersonId = newKey;
    this.rebuildRingsForCurrentSort();
    this.render();
    this.updateSelectionUI();
  }

  /**
   * Backward-compatible wrapper to add a name with optional domain.
   */
  addName(fullName, domain = '') {
    this.addPerson({ fullName, domain });
  }

  getAllNames() {
    const list = [];
    this.rings.forEach((r) => list.push(...r.names));
    return list;
  }

  destroy() {
    this.stopAnimation();
    window.removeEventListener('resize', this._onResize);
  }
}
