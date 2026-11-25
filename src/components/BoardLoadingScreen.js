import lottie from 'lottie-web';
import loadingAnimationData from '../assets/loading_animation.json';

const BRAND_LOADING_COLORS = [
  { hex: '#f5003a', rgba: [0.9607843137254902, 0, 0.22745098039215686, 1] }, // brand red
  { hex: '#6a76ff', rgba: [0.41568627450980394, 0.4627450980392157, 1, 1] }, // brand blue
  { hex: '#27ff83', rgba: [0.15294117647058825, 1, 0.5137254901960784, 1] } // brand green
];

function recolorLoadingAnimation(baseData, rgba) {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(baseData)
    : JSON.parse(JSON.stringify(baseData));

  const fixShapeItems = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item.ty === 'fl' && item.c && Array.isArray(item.c.k)) {
        const [r, g, b] = item.c.k;
        // Preserve black fills; recolor brand accent fills and enforce full opacity
        if (r > 0.1 || g > 0.1 || b > 0.1) {
          item.c.k = [...rgba];
        }
        if (item.o && item.o.a === 0) item.o.k = 100;
      }
      if (item.ty === 'tr' && item.o && item.o.a === 0) {
        item.o.k = 100;
      }
      if (Array.isArray(item.it)) {
        fixShapeItems(item.it);
      }
    }
  };

  const fixEffects = (effects) => {
    if (!Array.isArray(effects)) return;
    for (const effect of effects) {
      if (!Array.isArray(effect.ef)) continue;
      for (const prop of effect.ef) {
        if ((prop.mn === 'ADBE Fill-0002' || prop.nm === 'Color') && prop.v) {
          if (prop.v.a === 1 && Array.isArray(prop.v.k)) {
            for (const kf of prop.v.k) {
              if (Array.isArray(kf.s) && (kf.s[0] > 0.1 || kf.s[1] > 0.1 || kf.s[2] > 0.1)) {
                kf.s = [...rgba];
              }
            }
          } else if (Array.isArray(prop.v.k) && (prop.v.k[0] > 0.1 || prop.v.k[1] > 0.1 || prop.v.k[2] > 0.1)) {
            prop.v.k = [...rgba];
          }
        }
        if ((prop.mn === 'ADBE Fill-0005' || prop.nm === 'Opacity') && prop.v && prop.v.a === 0) {
          prop.v.k = 1;
        }
      }
    }
  };

  const fixLayers = (layers) => {
    if (!Array.isArray(layers)) return;
    for (const layer of layers) {
      if (layer.ty !== 3 && layer.ks && layer.ks.o && layer.ks.o.a === 0) {
        layer.ks.o.k = 100;
      }
      if (Array.isArray(layer.ef)) {
        fixEffects(layer.ef);
      }
      if (Array.isArray(layer.shapes)) {
        fixShapeItems(layer.shapes);
      }
    }
  };

  fixLayers(clone.layers);
  if (Array.isArray(clone.assets)) {
    for (const asset of clone.assets) {
      fixLayers(asset.layers);
    }
  }
  return clone;
}

/**
 * BoardLoadingScreen
 * Plays the vector loading animation (loading screen fin.json)
 * until all board assets, fonts, and DOM layouts are 100% ready.
 *
 * Guarantees:
 *  - Picks a random brand color (red, blue, or green) for loading screens at full 100% opacity
 *  - Minimum duration is preserved (full acronym sequence at 120fps = ~2.48s)
 *  - Dynamically decreases speed if assets take longer to load so there is zero freeze
 *  - Transitions smoothly to the page with zero lag or pop-in
 */
export class BoardLoadingScreen {
  constructor(options = {}) {
    this.layer = document.getElementById('boardLoadingLayer');
    this.container = document.getElementById('boardLottieContainer');
    this.minDurationMs = options.minDurationMs || 2483; // 298 frames at 120fps
    const picked = BRAND_LOADING_COLORS[Math.floor(Math.random() * BRAND_LOADING_COLORS.length)];
    this.activeColor = picked.hex;
    this.animationData = recolorLoadingAnimation(loadingAnimationData, picked.rgba);
    this.startTime = performance.now();
    this.isBoardReady = false;
    this.hasCompleted = false;

    this.initLottie();
  }

  initLottie() {
    if (!this.container) return;

    this.anim = lottie.loadAnimation({
      container: this.container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: this.animationData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        progressiveLoad: false
      }
    });

    window.__boardLoadingAnim = this.anim;

    this.anim.addEventListener('enterFrame', (e) => {
      const frame = Math.floor(e.currentTime);
      const elapsed = performance.now() - this.startTime;

      // Dynamic speed regulation:
      // If approaching the end of the acronym reveal (past frame 180) and board is still loading files,
      // progressively decrease speed so the animation smoothly stretches out instead of abruptly ending.
      if (!this.isBoardReady) {
        if (frame >= 180 && frame < 290) {
          const factor = (frame - 180) / 110;
          const targetSpeed = Math.max(0.3, 1.0 - factor * 0.7); // 1.0 -> 0.3
          this.anim.setSpeed(targetSpeed);
        } else if (frame >= 290) {
          this.anim.setSpeed(0.25);
        }
      } else {
        // Board is ready! Keep standard speed (1.0)
        this.anim.setSpeed(1.0);

        // Check completion criteria:
        // Board is fully ready, minimum duration has elapsed, and animation is at end or loop boundary
        if (elapsed >= this.minDurationMs && (frame >= 288 || frame < 10)) {
          this.finish();
        }
      }
    });

    this.anim.addEventListener('loopComplete', () => {
      const elapsed = performance.now() - this.startTime;
      if (this.isBoardReady && elapsed >= this.minDurationMs) {
        this.finish();
      }
    });

    // Safety fallback: ensure loading screen never hangs indefinitely under unexpected errors
    setTimeout(() => {
      if (!this.hasCompleted) {
        this.finish();
      }
    }, 15000);
  }

  markReady() {
    this.isBoardReady = true;
    if (this.anim) {
      this.anim.setSpeed(1.0);
    }
    const elapsed = performance.now() - this.startTime;

    // If minimum duration has already passed, schedule a clean exit
    if (elapsed >= this.minDurationMs) {
      setTimeout(() => this.finish(), 100);
    }
  }

  finish() {
    if (this.hasCompleted) return;
    this.hasCompleted = true;

    if (this.layer) {
      this.layer.classList.add('is-hidden');
      setTimeout(() => {
        if (this.anim) {
          try { this.anim.destroy(); } catch (e) {}
        }
        if (this.layer && this.layer.parentNode) {
          this.layer.parentNode.removeChild(this.layer);
        }
      }, 500);
    }
  }
}
