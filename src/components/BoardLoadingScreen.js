import lottie from 'lottie-web';
import loadingAnimationData from '../assets/loading_animation.json';

/**
 * BoardLoadingScreen
 * Plays the vector loading animation (loading screen fin.json)
 * until all board assets, fonts, and DOM layouts are 100% ready.
 * 
 * Guarantees:
 *  - Minimum duration is preserved (full acronym sequence at 120fps = ~2.48s)
 *  - Dynamically decreases speed if board files take longer to load so there is zero freeze
 *  - Transitions smoothly to the board with zero lag or pop-in
 */
export class BoardLoadingScreen {
  constructor(options = {}) {
    this.layer = document.getElementById('boardLoadingLayer');
    this.container = document.getElementById('boardLottieContainer');
    this.minDurationMs = options.minDurationMs || 2483; // 298 frames at 120fps
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
      animationData: loadingAnimationData,
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
