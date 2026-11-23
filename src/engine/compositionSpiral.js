/**
 * NOPITAC Composition Engine — Square Spiral Composition
 * Renders names along a concentric inward-winding square spiral path.
 * The underline follows the square spiral with 100% flawless 90-degree miter corner joins.
 * Letter spacing across corners is preserved continuously in path-space.
 */

import { CUSTOM_GLYPH_DB } from './customGlyphDb.js';
import {
  FONT_SIZE,
  HELVETICA_GLYPHS,
  HELVETICA_KERN_TABLE,
  getHelveticaKerning,
  getCharMetrics
} from './helveticaGlyphs.js';
import { UNDERLINE_Y, UNDERLINE_HEIGHT, stripUnderlineStub } from './nopitacRenderer.js';

export const DEFAULT_DESIGNERS = [
  'massimo vignelli',
  'april greiman',
  'susan kare',
  'tibor kalman',
  'alan fletcher',
  'david carson',
  'stefan sagmeister',
  'jessica walsh',
  'neville brody',
  'peter saville',
  'milton glaser',
  'eiko ishioka',
  'yuta okamaru',
  'eunho lee',
  'karel martens',
  'otl aicher',
  'lance wyman',
  'annie atkins',
  'rafael serra',
  'peter mendelsund',
  'paula zuccotti',
  'ryo takemasa',
  'sagi haviv',
  'gail anderson',
  'tadanori yokoo',
  'paula scher',
  'michael bierut',
  'irma boom',
  'jonathan barnbrook',
  'yugo nakamura'
];

export const COMPOSITION_PRESETS = {
  iconic: {
    title: 'Iconic Designers (Reference)',
    names: DEFAULT_DESIGNERS
  },
  modernist: {
    title: 'Modernist Pioneers',
    names: [
      'josef muller-brockmann',
      'armin hofmann',
      'emil ruder',
      'wim crouwel',
      'massimo vignelli',
      'otl aicher',
      'jan tschichold',
      'paul rand',
      'saul bass',
      'karel martens',
      'max bill',
      'karl gerstner',
      'herbert bayer',
      'el lissitzky',
      'adrian frutiger'
    ]
  },
  contemporary: {
    title: 'Contemporary & Digital',
    names: [
      'john maeda',
      'susan kare',
      'stefan sagmeister',
      'jessica walsh',
      'neville brody',
      'peter saville',
      'april greiman',
      'paula scher',
      'tobias frere-jones',
      'irma boom',
      'jonathan barnbrook',
      'yugo nakamura',
      'david carson',
      'annie atkins'
    ]
  }
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class CompositionSpiralRenderer {
  constructor(font = null) {
    this.font = font;
    this._approach2SimulatorCache = new Map();
  }

  /**
   * Generates inward-winding square spiral segments based on canvas dimensions and spacing.
   */
  generateSpiralSegments(size, ringSpacing, maxTurns = 8) {
    const half = size / 2;
    let x0 = -half;
    let x1 = half;
    let y0 = -half;
    let y1 = half;

    const segments = [];
    let k = 0;

    while (k < maxTurns) {
      const xL = x0 + k * ringSpacing;
      const xR = x1 - k * ringSpacing;
      const yT = y0 + k * ringSpacing;
      const yB = y1 - k * ringSpacing;

      const spanX = xR - xL;
      const spanY = yB - yT;

      if (spanX < ringSpacing * 1.3 || spanY < ringSpacing * 1.3) {
        break;
      }

      // 1. Top segment (Left to Right, angle 0°)
      segments.push({
        segIndex: segments.length,
        turnIndex: k,
        side: 'top',
        start: { x: xL, y: yT },
        end: { x: xR, y: yT },
        length: spanX,
        angle: 0
      });

      // 2. Right segment (Top to Bottom, angle 90°)
      segments.push({
        segIndex: segments.length,
        turnIndex: k,
        side: 'right',
        start: { x: xR, y: yT },
        end: { x: xR, y: yB },
        length: spanY,
        angle: 90
      });

      // 3. Bottom segment (Right to Left, angle 180°)
      const nextXL = xL + ringSpacing;
      const bottomLen = xR - nextXL;
      if (bottomLen <= ringSpacing * 0.7) break;

      segments.push({
        segIndex: segments.length,
        turnIndex: k,
        side: 'bottom',
        start: { x: xR, y: yB },
        end: { x: nextXL, y: yB },
        length: bottomLen,
        angle: 180
      });

      // 4. Left segment (Bottom to Top, angle 270°)
      const nextYT = yT + ringSpacing;
      const leftLen = yB - nextYT;
      if (leftLen <= ringSpacing * 0.7) break;

      segments.push({
        segIndex: segments.length,
        turnIndex: k,
        side: 'left',
        start: { x: nextXL, y: yB },
        end: { x: nextXL, y: nextYT },
        length: leftLen,
        angle: 270
      });

      k++;
    }

    return segments;
  }

  /**
   * Main render function for composition (square or circle).
   */
  render(namesInput, options = {}) {
    const shape = options.shape || 'square';
    if (shape === 'circle') {
      return this._renderCircle(namesInput, options);
    }
    return this._renderConcentricSquares(namesInput, options);
  }

  /**
   * Helper: evaluates point and tangent angle along a square track.
   * Strictly orthogonal: every word is rendered at 0°, 90°, 180°, or 270°.
   * Eliminates corner on-axis rotation and prevents corner overlaps.
   */
  _getSquareTrackState(s, H, L) {
    const P = 4 * L;
    s = ((s % P) + P) % P;

    if (s < L) {
      return { x: -H + s, y: -H, angle: 0 };
    } else if (s < 2 * L) {
      return { x: H, y: -H + (s - L), angle: 90 };
    } else if (s < 3 * L) {
      return { x: H - (s - 2 * L), y: H, angle: 180 };
    } else {
      return { x: -H, y: H - (s - 3 * L), angle: 270 };
    }
  }

  /**
   * Helper for Approach 2: evaluates point and angle along a single edge at distance u.
   * Ensures rigid edge-parallel orientation (0°, 90°, 180°, 270°) without track wrapping.
   */
  _getEdgePoint(edgeIndex, u, H) {
    const e = ((edgeIndex % 4) + 4) % 4;
    switch (e) {
      case 0: return { x: -H + u, y: -H, angle: 0 };
      case 1: return { x: H, y: -H + u, angle: 90 };
      case 2: return { x: H - u, y: H, angle: 180 };
      case 3: return { x: -H, y: H - u, angle: 270 };
    }
  }

  /**
   * Harmonious edge vehicle shifting algorithm for Approach 2:
   * 1. Names are vehicles revolving continuously around the square track road.
   * 2. Edge transition occurs when the last letter (end of word) reaches the corner (u reaches maxU).
   * 3. Forward car-following dynamics: every name is ALWAYS in motion and moving forward (du/dt > 0 strictly).
   * 4. Gaps are dynamic and variable: when space is needed, vehicles ahead shift harmoniously to the next edge.
   * 5. Zero overlaps and zero out-of-bounds across all edges, squares, and frames.
   */
  _computeApproach2Positions(sq, animOffset, minInterDesignerGap, scale = 0.65, tracking = 0, ringSpacing = 68) {
    const sideBase = sq.sideBaseLength;
    const designers = sq.positionedDesigners;
    if (!designers || designers.length === 0) return [];

    if (!this._approach2SimulatorCache) {
      this._approach2SimulatorCache = new Map();
    }

    const key = `sq-${sq.squareIndex}`;
    let state = this._approach2SimulatorCache.get(key);

    const initVehicles = () => designers.map(d => {
      const minU = Math.max(0, -d.dropX);
      const lastGlyph = d.glyphs[d.glyphs.length - 1];
      const lastLetterEnd = (lastGlyph?.relX || 0) + (lastGlyph?.metrics?.advance || 0);
      const wordEnd = Math.max(d.textWidth, d.riseX, lastLetterEnd);
      const maxU = Math.max(minU, sideBase - wordEnd);
      const baseU = d.edgeU !== undefined ? d.edgeU : (d.staticPerimS - d.edgeIndex * sideBase);
      const u = Math.max(minU, Math.min(maxU, baseU));
      return {
        id: d.fullName,
        w: d.textWidth,
        dropX: d.dropX || 0,
        riseX: d.riseX || d.textWidth,
        wordEnd,
        edge: d.edgeIndex,
        u,
        minU,
        maxU
      };
    });

    const safeGap = 36.0;
    const advanceStep = (vehicles, dt) => {
      // 1. Calculate anticipatory sliding boost
      // Names slide forward smoothly to open up space on an edge BEFORE incoming names arrive!
      const boosts = new Map();
      vehicles.forEach(v => boosts.set(v, 0));

      for (let e = 0; e < 4; e++) {
        const onEdge = vehicles.filter(v => v.edge === e).sort((a, b) => a.u - b.u);
        const prevEdge = (e - 1 + 4) % 4;
        const onPrevEdge = vehicles.filter(v => v.edge === prevEdge).sort((a, b) => a.u - b.u);

        // A. Anticipate incoming vehicle from previous edge approaching corner
        if (onPrevEdge.length > 0 && onEdge.length > 0) {
          const vIn = onPrevEdge[onPrevEdge.length - 1]; // closest to corner on prevEdge
          const dCorner = Math.max(1.0, vIn.maxU - vIn.u);
          const vInRight = vIn.wordEnd;
          
          let targetU = vIn.minU + vInRight + safeGap;
          for (let i = 0; i < onEdge.length; i++) {
            const v = onEdge[i];
            const nextLeft = Math.max(0, -v.dropX);
            const neededU = targetU + nextLeft;
            if (v.u < neededU) {
              const deficit = neededU - v.u;
              const boost = deficit / Math.max(10.0, dCorner);
              boosts.set(v, Math.max(boosts.get(v) || 0, boost));
            }
            targetU = Math.max(v.u, neededU) + v.wordEnd + safeGap;
          }
        }

        // B. Same-edge anticipatory sliding: maintain safe following separation
        for (let i = 0; i < onEdge.length - 1; i++) {
          const rear = onEdge[i];
          const front = onEdge[i + 1];
          const rearRight = rear.wordEnd;
          const frontLeft = Math.max(0, -front.dropX);
          const neededU = rear.u + rearRight + frontLeft + safeGap;
          if (front.u < neededU) {
            const deficit = neededU - front.u;
            const boost = deficit / 8.0;
            boosts.set(front, Math.max(boosts.get(front) || 0, boost));
          }
        }
      }

      // 2. Advance all vehicles forward with their smooth sliding speeds
      vehicles.forEach(v => {
        const boost = boosts.get(v) || 0;
        v.u += dt * (1.0 + boost);
      });

      // 3. Multi-vehicle collision avoidance & corner transitions
      let resolved = false;
      let pass = 0;
      while (!resolved && pass < 60) {
        resolved = true;
        pass++;

        for (let e = 0; e < 4; e++) {
          const onEdge = vehicles.filter(v => v.edge === e).sort((a, b) => a.u - b.u);
          if (onEdge.length === 0) continue;

          for (let i = 0; i < onEdge.length - 1; i++) {
            const rear = onEdge[i];
            const next = onEdge[i + 1];
            const rearRight = rear.wordEnd;
            const nextLeft = Math.max(0, -next.dropX);
            const minAllowed = rear.u + rearRight + nextLeft + safeGap;
            if (next.u < minAllowed) {
              next.u = minAllowed;
              resolved = false;
            }
          }

          for (let i = onEdge.length - 1; i >= 0; i--) {
            const v = onEdge[i];
            if (v.u >= v.maxU) {
              const overshoot = v.u - v.maxU;
              v.edge = (v.edge + 1) % 4;
              v.u = v.minU + Math.min(dt, Math.max(0, overshoot));
              resolved = false;
            }
          }
        }
      }

      // 4. Final defensive wrap and bounds clamping
      for (let e = 0; e < 4; e++) {
        const onEdge = vehicles.filter(v => v.edge === e);
        onEdge.forEach(v => {
          if (v.u >= v.maxU) {
            const overshoot = v.u - v.maxU;
            v.edge = (v.edge + 1) % 4;
            v.u = v.minU + Math.min(dt, Math.max(0, overshoot));
          }
          v.u = Math.max(v.minU, Math.min(v.maxU, v.u));
        });
      }
    };

    const currentDesignerIds = designers.map(d => d.fullName).join('|');

    // Check if we need full re-initialization:
    // When cache is empty, designer set changed, vehicle count mismatch, or simulation is paused/reset at offset 0
    const needsFullReset = !state ||
      state.designerIds !== currentDesignerIds ||
      state.vehicles.length !== designers.length ||
      animOffset === 0;

    if (needsFullReset) {
      const vehicles = initVehicles();
      let cur = 0;
      const stepSize = 1.0;
      while (cur < animOffset) {
        const dt = Math.min(stepSize, animOffset - cur);
        advanceStep(vehicles, dt);
        cur += dt;
      }
      state = {
        offset: animOffset,
        sideBase,
        scale,
        tracking,
        ringSpacing,
        designerIds: currentDesignerIds,
        vehicles
      };
      this._approach2SimulatorCache.set(key, state);
    } else {
      // Dynamic slider change during active playback: resync vehicles in-place
      const geomChanged = Math.abs(state.sideBase - sideBase) > 0.01 ||
        Math.abs(state.scale - scale) > 0.001 ||
        Math.abs(state.tracking - tracking) > 0.01 ||
        Math.abs(state.ringSpacing - ringSpacing) > 0.01;

      if (geomChanged) {
        state.vehicles.forEach((v, idx) => {
          const d = designers[idx];
          const lastGlyph = d.glyphs[d.glyphs.length - 1];
          const lastLetterEnd = (lastGlyph?.relX || 0) + (lastGlyph?.metrics?.advance || 0);
          const wordEnd = Math.max(d.textWidth, d.riseX, lastLetterEnd);
          const newMinU = Math.max(0, -d.dropX);
          const newMaxU = Math.max(newMinU, sideBase - wordEnd);

          const oldSpan = Math.max(1.0, v.maxU - v.minU);
          const fraction = Math.max(0, Math.min(1.0, (v.u - v.minU) / oldSpan));

          v.w = d.textWidth;
          v.dropX = d.dropX || 0;
          v.riseX = d.riseX || d.textWidth;
          v.wordEnd = wordEnd;
          v.minU = newMinU;
          v.maxU = newMaxU;
          v.u = Math.max(newMinU, Math.min(newMaxU, newMinU + fraction * (newMaxU - newMinU)));
        });

        advanceStep(state.vehicles, 0);

        state.sideBase = sideBase;
        state.scale = scale;
        state.tracking = tracking;
        state.ringSpacing = ringSpacing;
      }

      if (animOffset > state.offset) {
        let cur = state.offset;
        const stepSize = 1.0;
        while (cur < animOffset) {
          const dt = Math.min(stepSize, animOffset - cur);
          advanceStep(state.vehicles, dt);
          cur += dt;
        }
        state.offset = animOffset;
      } else if (animOffset < state.offset) {
        const vehicles = initVehicles();
        let cur = 0;
        const stepSize = 1.0;
        while (cur < animOffset) {
          const dt = Math.min(stepSize, animOffset - cur);
          advanceStep(vehicles, dt);
          cur += dt;
        }
        state.vehicles = vehicles;
        state.offset = animOffset;
      }
    }

    return state.vehicles.map((v, idx) => ({
      ...designers[idx],
      edgeIndex: v.edge,
      uTrailBase: Math.max(v.minU, Math.min(v.maxU, v.u))
    }));
  }

  /**
   * Helper: returns corner vertex coordinates for corner index k.
   * Corners around square:
   * 1 = Top-Right (H, -H)
   * 2 = Bottom-Right (H, H)
   * 3 = Bottom-Left (-H, H)
   * 0 = Top-Left (-H, -H)
   */
  _getCornerVertex(k, H) {
    const cornerIdx = ((k % 4) + 4) % 4;
    switch (cornerIdx) {
      case 1: return { x: H, y: -H };
      case 2: return { x: H, y: H };
      case 3: return { x: -H, y: H };
      case 0: return { x: -H, y: -H };
    }
  }

  /**
   * Helper: returns an SVG path data string tracing along the square perimeter from s1 to s2.
   * If s1 and s2 are on the same edge, generates a straight line: M x1 y1 L x2 y2.
   * If s1 and s2 cross one or more 90° corners, generates a miter join path: M x1 y1 L c1.x c1.y L x2 y2.
   * Follows the square perimeter like the snake in the classic snake game, never jutting outside.
   */
  _getSquareTrackPath(s1, s2, H, L) {
    const P = 4 * L;
    const p1 = this._getSquareTrackState(s1, H, L);
    const p2 = this._getSquareTrackState(s2, H, L);

    const span = s2 - s1;
    const u1 = ((s1 % P) + P) % P;
    const u2 = u1 + span;

    const points = [{ x: p1.x, y: p1.y }];

    // Find all corner multiples of L between u1 and u2
    const kStart = Math.floor(u1 / L) + 1;
    const kEnd = Math.floor(u2 / L);

    for (let k = kStart; k <= kEnd; k++) {
      const cVertex = this._getCornerVertex(k, H);
      points.push(cVertex);
    }

    points.push({ x: p2.x, y: p2.y });

    return points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(3)} ${pt.y.toFixed(3)}`).join(' ');
  }

  /**
   * Concentric Squares composition with whole names along edges.
   * Names never fold in corners: if a name exceeds the corner along an edge,
   * it is placed on the adjacent edge.
   * In animation, names revolve continuously around the center in their own square.
   */
  _renderConcentricSquares(namesInput, options = {}) {
    const {
      size = 780,
      ringSpacing = 68,
      scale = 0.65,
      tracking = 0,
      bracketStyle = 'name-brackets', // 'name-brackets', 'continuous-ribbon', 'clean-underlines'
      animOffset = 0,
      rotationAngle = 0,
      animSpeed = 80,
      cornerApproach = 1 // 1 = Snake Flow, 2 = Instant Edge Jump
    } = options;

    // Parse names into a clean array
    let names = [];
    if (Array.isArray(namesInput)) {
      names = namesInput.map(n => String(n).trim().toLowerCase()).filter(Boolean);
    } else if (typeof namesInput === 'string') {
      names = namesInput
        .split(/[\n,\/]+/)
        .map(n => n.trim().toLowerCase())
        .filter(Boolean);
    }

    if (names.length === 0) {
      names = DEFAULT_DESIGNERS;
    }

    const half = size / 2; // 390

    // Typographic space advance and generous inter-name spacing
    const spaceMetrics = getCharMetrics(' ', this.font);
    const spaceAdvance = spaceMetrics.advance + tracking;
    const minInterDesignerGap = Math.max(48.0, spaceAdvance * 3.8);
    const cornerPad = 18 / scale;

    // Measure designer templates
    const designerList = names.map((name, nameIdx) => {
      const words = name.split(/\s+/).filter(Boolean);
      const glyphs = [];
      let curRelX = 0;

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const wordStr = words[wIdx];
        const isFirstWord = wIdx === 0;
        const isLastWord = wIdx === words.length - 1;

        for (let cIdx = 0; cIdx < wordStr.length; cIdx++) {
          const ch = wordStr[cIdx];
          const nextCh = wordStr[cIdx + 1] || (wIdx < words.length - 1 ? words[wIdx + 1][0] : null);
          const m = getCharMetrics(ch, this.font);
          const kern = nextCh ? getHelveticaKerning(ch, nextCh, this.font) : 0;
          const step = m.advance + kern + tracking;

          glyphs.push({
            char: ch,
            nameIndex: nameIdx,
            isFirstOfName: isFirstWord && cIdx === 0,
            isLastOfName: isLastWord && cIdx === wordStr.length - 1,
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

      const first = glyphs[0];
      const last = glyphs[glyphs.length - 1];

      const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

      const fTx = first.metrics.lsb - fDb.letterMinX;
      const bTx = last.metrics.lsb - bDb.letterMinX;

      const dropX = fTx + fDb.dropStemLeftX;
      const riseX = last.relX + bTx + bDb.riseStemRightX;

      return {
        nameIndex: nameIdx,
        fullName: name,
        glyphs,
        textWidth: curRelX,
        dropX,
        riseX
      };
    });

    // Calculate innermost square half-size that comfortably fits initial names without leaving it empty
    const firstFourNamesMax = Math.max(...designerList.slice(0, 4).map(d => d.textWidth));
    const baseNeededForInner = firstFourNamesMax / 0.72 + 2 * cornerPad;
    let innerH = Math.max(90, Math.ceil((baseNeededForInner * scale) / 2));

    // Dynamic concentric squares generation:
    // Start at inner square and add concentric squares outward until 100% of all names are accommodated!
    const placedSquares = [];
    let curH = innerH;
    let dIdx = 0;
    const edgeOrder = [0, 2, 1, 3]; // Symmetrical, balanced edge order [top, bottom, right, left]

    while (dIdx < designerList.length && placedSquares.length < 50) {
      const sideLength = 2 * curH;
      const sideBaseLength = sideLength / scale;
      const perimeterBaseLength = 4 * sideBaseLength;
      const usableEdgeLength = sideBaseLength - 2 * cornerPad;
      const maxSingleNameWidth = usableEdgeLength * 0.82;
      const maxNamesForThisEdge = usableEdgeLength >= 1460 ? 4 : (usableEdgeLength >= 960 ? 3 : (usableEdgeLength >= 460 ? 2 : 1));

      const sq = {
        squareIndex: placedSquares.length,
        half: curH,
        sideLength,
        sideBaseLength,
        perimeterBaseLength,
        designers: [],
        edges: [[], [], [], []]
      };

      // Round-robin filling across edges to distribute names evenly and spaciously
      let addedAny = true;
      while (addedAny && dIdx < designerList.length) {
        addedAny = false;
        for (const eIdx of edgeOrder) {
          if (dIdx >= designerList.length) break;
          const edge = sq.edges[eIdx];
          if (edge.length >= maxNamesForThisEdge) continue;

          const d = designerList[dIdx];
          if (edge.length === 0 && d.textWidth > maxSingleNameWidth) break;

          const newTotal = edge.reduce((s, it) => s + it.textWidth, 0) + d.textWidth;
          const newCount = edge.length + 1;
          const candidateGap = (sideBaseLength - newTotal) / newCount;

          // Accept name if candidate gap maintains comfortable inter-name spacing and corner safety
          if (candidateGap >= minInterDesignerGap && candidateGap / 2 >= cornerPad * 0.75) {
            edge.push(d);
            sq.designers.push({ ...d, edgeIndex: eIdx });
            dIdx++;
            addedAny = true;
          }
        }
      }

      if (sq.designers.length > 0 || dIdx >= designerList.length) {
        placedSquares.push(sq);
      }
      curH += ringSpacing;
    }

    if (placedSquares.length === 0) {
      return { svgString: '', viewBox: '0 0 0 0', width: size, height: size };
    }

    // Geometry construction
    const strokeWidth = UNDERLINE_HEIGHT * scale;
    const baselineOffsetLocal = -7.14685;
    const underlinePaths = [];
    const glyphMarkup = [];
    const tspans = [];
    let placedGlyphsCount = 0;

    placedSquares.forEach(sq => {
      if (sq.designers.length === 0) return;

      const H = sq.half;
      const sideBase = sq.sideBaseLength;
      const perimBase = sq.perimeterBaseLength;

      // Closed square stroke for continuous-ribbon or clean-underlines
      if (bracketStyle === 'continuous-ribbon' || bracketStyle === 'clean-underlines') {
        underlinePaths.push(`
      <!-- Closed Square [${sq.squareIndex}] -->
      <rect 
        x="${(-H).toFixed(3)}" 
        y="${(-H).toFixed(3)}" 
        width="${(2 * H).toFixed(3)}" 
        height="${(2 * H).toFixed(3)}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linejoin="miter" 
        stroke-miterlimit="4" 
      />`);
      }

      const totalDesigners = sq.designers.length;
      if (totalDesigners === 0) return;

      // 1. Equal gap calculation across the full square perimeter (matching circle layout)
      const sqTotalText = sq.designers.reduce((sum, d) => sum + d.textWidth, 0);
      const sqEvenGap = Math.max(minInterDesignerGap, (perimBase - sqTotalText) / totalDesigners);
      const sqPerimStartOffset = Math.max(0, (perimBase - (sqTotalText + totalDesigners * sqEvenGap)) / 2) + sqEvenGap / 2;

      // 2. Distribute names with equal spacing across each edge and balanced corner half-gaps
      const positionedDesigners = [];
      let curPerimS = sqPerimStartOffset;

      for (let eIdx = 0; eIdx < 4; eIdx++) {
        const edgeList = sq.edges[eIdx];
        const edgeBaseStart = eIdx * sideBase;
        const count = edgeList.length;
        if (count === 0) continue;

        const totalTextOnEdge = edgeList.reduce((sum, d) => sum + d.textWidth, 0);
        const availableSpace = Math.max(0, sideBase - totalTextOnEdge);
        const edgeGap = availableSpace / count;
        const entranceBuffer = edgeGap / 2;

        let curU = entranceBuffer;
        edgeList.forEach((d, idx) => {
          const minAllowedX = Math.max(cornerPad, -d.dropX);
          const maxAllowedX = Math.max(minAllowedX, sideBase - cornerPad - d.textWidth);
          const edgeU = Math.max(minAllowedX, Math.min(maxAllowedX, curU));
          const staticPerimS = cornerApproach === 1 ? curPerimS : (edgeBaseStart + edgeU);

          positionedDesigners.push({
            ...d,
            edgeIndex: eIdx,
            instanceId: `${sq.squareIndex}-${eIdx}-${idx}`,
            edgeU,
            staticPerimS
          });

          curU += d.textWidth + edgeGap;
          curPerimS += d.textWidth + sqEvenGap;
        });
      }

      sq.positionedDesigners = positionedDesigners;

      if (cornerApproach === 2) {
        // Approach 2: Instant Edge Jump with Harmonious Road Vehicle Shifting
        // 1. Edge transition happens when the last letter (end of word) reaches the corner.
        // 2. Names shift across edges harmoniously to make room, strictly clamped inside [0, sideLength - textWidth * scale].
        // 3. 0 overlaps and 0 out-of-bounds across all edges and frames.
        const approach2Items = this._computeApproach2Positions(sq, animOffset, minInterDesignerGap, scale, tracking, ringSpacing);

        approach2Items.forEach(d => {
          const first = d.glyphs[0];
          const last = d.glyphs[d.glyphs.length - 1];

          const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
          const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

          const fTx = first.metrics.lsb - fDb.letterMinX;
          const bTx = last.metrics.lsb - bDb.letterMinX;

          const dropX = fTx + fDb.dropStemLeftX;
          const riseX = last.relX + bTx + bDb.riseStemRightX;

          const uTrail = Math.max(0, Math.min(sq.sideLength - d.textWidth * scale, d.uTrailBase * scale));
          const edgeIndex = d.edgeIndex;

          // Underline in name-brackets mode: straight along edgeIndex
          if (bracketStyle === 'name-brackets') {
            const u1 = Math.max(0, Math.min(sq.sideLength, uTrail + dropX * scale));
            const u2 = Math.max(0, Math.min(sq.sideLength, uTrail + riseX * scale));
            const pt1 = this._getEdgePoint(edgeIndex, u1, H);
            const pt2 = this._getEdgePoint(edgeIndex, u2, H);

            underlinePaths.push(`
      <!-- Name Underline: [${d.instanceId}] (${d.fullName}) -->
      <path 
        d="M ${pt1.x.toFixed(3)} ${pt1.y.toFixed(3)} L ${pt2.x.toFixed(3)} ${pt2.y.toFixed(3)}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linecap="butt" 
      />`);
          }

          // Glyphs along edgeIndex
          d.glyphs.forEach(g => {
            placedGlyphsCount++;
            const ch = g.char;
            const ug = Math.max(0, Math.min(sq.sideLength, uTrail + g.relX * scale));
            const gState = this._getEdgePoint(edgeIndex, ug, H);

            const gx = gState.x;
            const gy = gState.y;
            const angleDeg = gState.angle;

            const isFirst = bracketStyle === 'name-brackets' && g.isFirstOfName;
            const isLast = bracketStyle === 'name-brackets' && g.isLastOfName;

            if (isFirst && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
              const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
              const tx = g.metrics.lsb - fDb.letterMinX;
              const ty = baselineOffsetLocal - fDb.baseline;
              const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
            } else if (isLast && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
              const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
              const tx = g.metrics.lsb - bDb.letterMinX;
              const ty = baselineOffsetLocal - bDb.baseline;
              const cleanSvg = stripUnderlineStub(bDb.innerSvg, bDb.baseline);
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
            } else {
              const originX = 0;
              const originY = baselineOffsetLocal;
              if (g.metrics.d) {
                glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${originX.toFixed(3)}, ${originY.toFixed(3)})">
          <path d="${g.metrics.d}" />
        </g>`);
              } else if (this.font) {
                const glyph = this.font.charToGlyph(ch);
                const path = glyph.getPath(originX, originY, FONT_SIZE);
                glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)})">
          <path d="${path.toPathData(2)}" />
        </g>`);
              }
            }

            tspans.push(`<tspan>${escapeXml(ch)}</tspan>`);
          });
        });

        return;
      }

      positionedDesigners.forEach(d => {
        const first = d.glyphs[0];
        const last = d.glyphs[d.glyphs.length - 1];

        const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
        const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

        const fTx = first.metrics.lsb - fDb.letterMinX;
        const bTx = last.metrics.lsb - bDb.letterMinX;

        const dropX = fTx + fDb.dropStemLeftX;
        const riseX = last.relX + bTx + bDb.riseStemRightX;

        // Advance by animOffset along perimeter
        const currentPerimS = ((d.staticPerimS + animOffset) % perimBase + perimBase) % perimBase;

        // In name-brackets mode: underline follows the square path like the snake game
        // (straight on edges, 90° miter join when crossing corners)
        if (bracketStyle === 'name-brackets') {
          const s1World = (currentPerimS + dropX) * scale;
          const s2World = (currentPerimS + riseX) * scale;
          const pathD = this._getSquareTrackPath(s1World, s2World, H, sq.sideLength);

          underlinePaths.push(`
      <!-- Name Underline: [${d.instanceId}] (${d.fullName}) -->
      <path 
        d="${pathD}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linecap="butt" 
        stroke-linejoin="miter" 
        stroke-miterlimit="4" 
      />`);
        }

        // Render glyphs along the square path (snake-like 90° corner flow)
        d.glyphs.forEach(g => {
          placedGlyphsCount++;
          const ch = g.char;

          // Snake-like 90° corner flow: each glyph follows the square path directly
          const gPerimS = ((currentPerimS + g.relX) % perimBase + perimBase) % perimBase;
          const gState = this._getSquareTrackState(gPerimS * scale, H, sq.sideLength);

          const gx = gState.x;
          const gy = gState.y;
          const angleDeg = gState.angle;

          const isFirst = bracketStyle === 'name-brackets' && g.isFirstOfName;
          const isLast = bracketStyle === 'name-brackets' && g.isLastOfName;

          if (isFirst && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
            const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
            const tx = g.metrics.lsb - fDb.letterMinX;
            const ty = baselineOffsetLocal - fDb.baseline;
            const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
          } else if (isLast && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
            const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
            const tx = g.metrics.lsb - bDb.letterMinX;
            const ty = baselineOffsetLocal - bDb.baseline;
            const cleanSvg = stripUnderlineStub(bDb.innerSvg, bDb.baseline);
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
          } else {
            const originX = 0;
            const originY = baselineOffsetLocal;
            if (g.metrics.d) {
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${originX.toFixed(3)}, ${originY.toFixed(3)})">
          <path d="${g.metrics.d}" />
        </g>`);
            } else if (this.font) {
              const glyph = this.font.charToGlyph(ch);
              const path = glyph.getPath(originX, originY, FONT_SIZE);
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)})">
          <path d="${path.toPathData(2)}" />
        </g>`);
            }
          }

          tspans.push(`<tspan>${escapeXml(ch)}</tspan>`);
        });
      });
    });

    const maxHalf = placedSquares.length > 0 ? Math.max(...placedSquares.map(s => s.half)) : half;
    const cardHalf = maxHalf + 120 * Math.max(0.65, scale); // comfortably encloses outermost names during corner transitions
    const cardSize = cardHalf * 2;
    const maxRotationRadius = Math.hypot(cardHalf, cardHalf);
    const outerPad = 16;
    const viewHalf = Math.ceil(maxRotationRadius + outerPad);
    const minX = -viewHalf;
    const minY = -viewHalf;
    const vbWidth = viewHalf * 2;
    const vbHeight = viewHalf * 2;

    const svgString = `<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}" 
  width="${vbWidth.toFixed(0)}" 
  height="${vbHeight.toFixed(0)}" 
  data-nopitac-composition="concentric-squares"
>
  <defs>
    <filter id="compCardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000000" flood-opacity="0.04" />
    </filter>
  </defs>

  <!-- Master Center Rotation Group -->
  <g id="compRotationGroup" transform="rotate(${rotationAngle.toFixed(3)}, 0, 0)">
    <!-- Rotating Composition Card Background -->
    <rect 
      x="${(-cardHalf).toFixed(1)}" 
      y="${(-cardHalf).toFixed(1)}" 
      width="${cardSize.toFixed(1)}" 
      height="${cardSize.toFixed(1)}" 
      rx="6" 
      fill="#f5f3ec" 
      filter="url(#compCardShadow)" 
    />
    
    ${underlinePaths.join('\n')}

    <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
      ${glyphMarkup.join('\n')}
    </g>
  </g>

  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" style="opacity: 0; pointer-events: none;" xml:space="preserve">
    ${tspans.join('')}
  </text>
</svg>`;

    return {
      svgString,
      viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}`,
      vbWidth,
      vbHeight,
      squaresCount: placedSquares.length,
      placedGlyphsCount,
      namesCount: names.length
    };
  }

  /**
   * Circle composition with concentric circular tracks and circular arc underlines.
   */
  _renderCircle(namesInput, options = {}) {
    const {
      size = 780,
      ringSpacing = 68,
      scale = 0.65,
      tracking = 0,
      bracketStyle = 'name-brackets', // 'name-brackets', 'continuous-ribbon', 'clean-underlines'
      animOffset = 0,
      rotationAngle = 0,
      loop = true
    } = options;

    // Parse names into a clean array
    let names = [];
    if (Array.isArray(namesInput)) {
      names = namesInput.map(n => String(n).trim().toLowerCase()).filter(Boolean);
    } else if (typeof namesInput === 'string') {
      names = namesInput
        .split(/[\n,\/]+/)
        .map(n => n.trim().toLowerCase())
        .filter(Boolean);
    }

    if (names.length === 0) {
      names = DEFAULT_DESIGNERS;
    }

    const half = size / 2; // 390

    // Typographic space advance
    const spaceMetrics = getCharMetrics(' ', this.font);
    const spaceAdvance = spaceMetrics.advance + tracking;
    const minInterDesignerGap = spaceAdvance * 2.8;

    // Pre-calculate intrinsic typographic glyph templates for each designer
    const designerList = names.map((name, nameIdx) => {
      const words = name.split(/\s+/).filter(Boolean);
      const glyphs = [];
      let curRelX = 0;

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const wordStr = words[wIdx];
        const isFirstWord = wIdx === 0;
        const isLastWord = wIdx === words.length - 1;

        for (let cIdx = 0; cIdx < wordStr.length; cIdx++) {
          const ch = wordStr[cIdx];
          const nextCh = wordStr[cIdx + 1] || (wIdx < words.length - 1 ? words[wIdx + 1][0] : null);
          const m = getCharMetrics(ch, this.font);
          const kern = nextCh ? getHelveticaKerning(ch, nextCh, this.font) : 0;
          const step = m.advance + kern + tracking;

          glyphs.push({
            char: ch,
            nameIndex: nameIdx,
            isFirstOfName: isFirstWord && cIdx === 0,
            isLastOfName: isLastWord && cIdx === wordStr.length - 1,
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

      const first = glyphs[0];
      const last = glyphs[glyphs.length - 1];

      const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
      const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

      const fTx = first.metrics.lsb - fDb.letterMinX;
      const bTx = last.metrics.lsb - bDb.letterMinX;

      const dropX = fTx + fDb.dropStemLeftX;
      const riseX = last.relX + bTx + bDb.riseStemRightX;

      return {
        nameIndex: nameIdx,
        fullName: name,
        glyphs,
        textWidth: curRelX,
        dropX,
        riseX
      };
    });

    // Determine innermost ring radius that comfortably hosts at least 1 designer
    const d0 = designerList[0];
    const minBaseCircumference = (d0.textWidth + minInterDesignerGap * 1.5) * 1.05;
    let curR = Math.max(75, Math.ceil((minBaseCircumference * scale) / (2 * Math.PI)));

    // Allocate designers to rings: dynamically add outer rings until ALL designers are placed!
    const placedRings = [];
    let dIdx = 0;

    while (dIdx < designerList.length && placedRings.length < 50) {
      const circumference = 2 * Math.PI * curR;
      const baseLength = circumference / scale;
      const ring = {
        ringIndex: placedRings.length,
        radius: curR,
        circumference,
        baseLength,
        designers: []
      };

      while (dIdx < designerList.length) {
        const d = designerList[dIdx];
        const currentCount = ring.designers.length;
        const currentTotalText = ring.designers.reduce((sum, item) => sum + item.textWidth, 0);
        const neededLength = currentTotalText + (currentCount > 0 ? (currentCount + 1) * minInterDesignerGap : minInterDesignerGap) + d.textWidth;

        if (currentCount > 0 && neededLength > ring.baseLength) {
          break; // Ring is full, expand to next ring outward
        }

        ring.designers.push(d);
        dIdx++;
      }

      if (ring.designers.length > 0 || dIdx >= designerList.length) {
        placedRings.push(ring);
      }
      curR += ringSpacing;
    }

    if (placedRings.length === 0) {
      return { svgString: '', viewBox: '0 0 0 0', width: size, height: size };
    }

    // Geometry & styling
    const strokeWidth = UNDERLINE_HEIGHT * scale;
    const baselineOffsetLocal = -7.14685;
    const theta0 = -Math.PI / 2; // 12 o'clock

    const underlinePaths = [];
    const glyphMarkup = [];
    const tspans = [];
    let placedGlyphsCount = 0;

    placedRings.forEach(ring => {
      const count = ring.designers.length;
      if (count === 0 && bracketStyle === 'name-brackets') return;

      if (bracketStyle === 'continuous-ribbon' || bracketStyle === 'clean-underlines') {
        // Continuous circular track underline
        underlinePaths.push(`
      <circle 
        cx="0" 
        cy="0" 
        r="${ring.radius.toFixed(3)}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
      />`);
      }

      if (count === 0) return;

      const totalTextWidth = ring.designers.reduce((sum, d) => sum + d.textWidth, 0);
      let gap = minInterDesignerGap;
      let startOffset = 0;

      if (count >= 2) {
        const evenGap = (ring.baseLength - totalTextWidth) / count;
        if (evenGap >= minInterDesignerGap && evenGap <= minInterDesignerGap * 3.5) {
          gap = evenGap;
        } else if (evenGap > minInterDesignerGap * 3.5) {
          gap = minInterDesignerGap;
          const usedLength = totalTextWidth + (count - 1) * gap;
          startOffset = (ring.baseLength - usedLength) / 2;
        }
      }

      let curOffset = startOffset;
      const ringDesigners = ring.designers.map((d, idx) => {
        const item = {
          ...d,
          staticStartX: curOffset,
          instanceId: `${ring.ringIndex}-${idx}`
        };
        curOffset += d.textWidth + gap;
        return item;
      });

      ringDesigners.forEach(d => {
        const linearOffset = animOffset;
        const wrappedStartX = ((d.staticStartX + linearOffset) % ring.baseLength + ring.baseLength) % ring.baseLength;

        const first = d.glyphs[0];
        const last = d.glyphs[d.glyphs.length - 1];

        const fDb = CUSTOM_GLYPH_DB[first.char.toLowerCase()]?.front || CUSTOM_GLYPH_DB['a'].front;
        const bDb = CUSTOM_GLYPH_DB[last.char.toLowerCase()]?.back || CUSTOM_GLYPH_DB['a'].back;

        const fTx = first.metrics.lsb - fDb.letterMinX;
        const bTx = last.metrics.lsb - bDb.letterMinX;

        const dropX = wrappedStartX + fTx + fDb.dropStemLeftX;
        const riseX = wrappedStartX + last.relX + bTx + bDb.riseStemRightX;

        // Circular arc underline for 'name-brackets'
        if (bracketStyle === 'name-brackets') {
          const t1 = theta0 + (dropX * scale) / ring.radius;
          const t2 = theta0 + (riseX * scale) / ring.radius;

          const x1 = ring.radius * Math.cos(t1);
          const y1 = ring.radius * Math.sin(t1);
          const x2 = ring.radius * Math.cos(t2);
          const y2 = ring.radius * Math.sin(t2);

          const sweep = t2 - t1;
          const largeArc = sweep > Math.PI ? 1 : 0;

          const arcPath = `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${ring.radius.toFixed(3)} ${ring.radius.toFixed(3)} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;

          underlinePaths.push(`
      <!-- Name Underline: [${d.nameIndex}:${d.instanceId}] -->
      <path 
        d="${arcPath}" 
        fill="none" 
        stroke="#18181b" 
        stroke-width="${strokeWidth.toFixed(4)}" 
        stroke-linecap="butt" 
      />`);
        }

        // Draw each glyph along the circular baseline
        d.glyphs.forEach(g => {
          placedGlyphsCount++;
          const ch = g.char;
          const gX = wrappedStartX + g.relX;
          const theta = theta0 + (gX * scale) / ring.radius;
          const gx = ring.radius * Math.cos(theta);
          const gy = ring.radius * Math.sin(theta);
          const angleDeg = (theta * 180 / Math.PI) + 90;

          const isFirst = bracketStyle === 'name-brackets' && g.isFirstOfName;
          const isLast = bracketStyle === 'name-brackets' && g.isLastOfName;

          if (isFirst && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.front) {
            const fDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].front;
            const tx = g.metrics.lsb - fDb.letterMinX;
            const ty = baselineOffsetLocal - fDb.baseline;
            const cleanSvg = stripUnderlineStub(fDb.innerSvg, fDb.baseline);
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
          } else if (isLast && CUSTOM_GLYPH_DB[ch.toLowerCase()]?.back) {
            const bDb = CUSTOM_GLYPH_DB[ch.toLowerCase()].back;
            const tx = g.metrics.lsb - bDb.letterMinX;
            const ty = baselineOffsetLocal - bDb.baseline;
            const cleanSvg = stripUnderlineStub(bDb.innerSvg, bDb.baseline);
            glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${tx.toFixed(3)}, ${ty.toFixed(3)})">
          ${cleanSvg}
        </g>`);
          } else {
            const originX = 0;
            const originY = baselineOffsetLocal;
            if (g.metrics.d) {
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${originX.toFixed(3)}, ${originY.toFixed(3)})">
          <path d="${g.metrics.d}" />
        </g>`);
            } else if (this.font) {
              const glyph = this.font.charToGlyph(ch);
              const path = glyph.getPath(originX, originY, FONT_SIZE);
              glyphMarkup.push(`
        <g transform="translate(${gx.toFixed(3)}, ${gy.toFixed(3)}) rotate(${angleDeg.toFixed(3)}) scale(${scale.toFixed(4)})">
          <path d="${path.toPathData(2)}" />
        </g>`);
            }
          }

          tspans.push(`<tspan>${escapeXml(ch)}</tspan>`);
        });
      });
    });

    const maxHalf = placedRings.length > 0 ? Math.max(...placedRings.map(r => r.radius)) : half;
    const cardHalf = maxHalf + 120 * Math.max(0.65, scale); // comfortably encloses outermost names during corner transitions
    const cardSize = cardHalf * 2;
    const maxRotationRadius = Math.hypot(cardHalf, cardHalf);
    const outerPad = 16;
    const viewHalf = Math.ceil(maxRotationRadius + outerPad);
    const minX = -viewHalf;
    const minY = -viewHalf;
    const vbWidth = viewHalf * 2;
    const vbHeight = viewHalf * 2;

    const svgString = `<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}" 
  width="${vbWidth.toFixed(0)}" 
  height="${vbHeight.toFixed(0)}" 
  data-nopitac-composition="circle-spiral"
>
  <defs>
    <filter id="compCardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000000" flood-opacity="0.04" />
    </filter>
  </defs>

  <!-- Master Center Rotation Group -->
  <g id="compRotationGroup" transform="rotate(${rotationAngle.toFixed(3)}, 0, 0)">
    <!-- Rotating Composition Card Background -->
    <rect 
      x="${(-cardHalf).toFixed(1)}" 
      y="${(-cardHalf).toFixed(1)}" 
      width="${cardSize.toFixed(1)}" 
      height="${cardSize.toFixed(1)}" 
      rx="6" 
      fill="#f5f3ec" 
      filter="url(#compCardShadow)" 
    />
    
    ${underlinePaths.join('\n')}

    <g fill="#18181b" stroke="none" class="glyph-artwork" style="pointer-events: none;">
      ${glyphMarkup.join('\n')}
    </g>
  </g>

  <!-- Selectable text layer -->
  <text class="nopitac-selectable-text" style="opacity: 0; pointer-events: none;" xml:space="preserve">
    ${tspans.join('')}
  </text>
</svg>`;

    return {
      svgString,
      viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}`,
      vbWidth,
      vbHeight,
      ringsCount: placedRings.length,
      placedGlyphsCount,
      namesCount: names.length
    };
  }

  /**
   * Helper: converts local segment coordinate (x, y) into world SVG coordinate.
   */
  _localToWorld(seg, localX, localY) {
    const rad = (seg.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: seg.start.x + localX * cos - localY * sin,
      y: seg.start.y + localX * sin + localY * cos
    };
  }
}
