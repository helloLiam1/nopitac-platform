import lottie from 'lottie-web';
import entryAnimationData from './assets/entry_animation.json';
import { nopitacService } from './lib/nopitacService.js';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient.js';

/**
 * NOPITAC — Home / Entry Screen Application
 * Driven directly by After Effects animation (try 2.json)
 * Exact timing, colors, wipes, and interactive typography.
 */

export const STAGES = [
  { idx: 0, color: '#f5003a', wipeStart: 599, wipeEnd: 661, holdEnd: 915, text: 'a place for creatives to store names of all the people who inspire you' },
  { idx: 1, color: '#6a76ff', wipeStart: 915, wipeEnd: 977, holdEnd: 1253, text: 'where you can keep all your influences together and discover what influences others' },
  { idx: 2, color: '#27ff83', wipeStart: 1253, wipeEnd: 1316, holdEnd: 1474, text: 'a repository of inspiration' },
  { idx: 3, color: '#d8ff2a', wipeStart: 1474, wipeEnd: 1536, holdEnd: 1710, text: 'a temple of personal idols' },
  { idx: 4, color: '#f5003a', wipeStart: 1710, wipeEnd: 1772, holdEnd: 1978, text: 'a library of names' },
  { idx: 5, color: '#6a76ff', wipeStart: 1978, wipeEnd: 2040, holdEnd: 2323, text: 'for the one who is willing to put in the effort' },
  { idx: 6, color: '#27ff83', wipeStart: 2323, wipeEnd: 2385, holdEnd: 2591, text: 'a brag for the nerds' },
  { idx: 7, color: '#d8ff2a', wipeStart: 2591, wipeEnd: 2653, holdEnd: 2949, text: 'a medicine for creative constipation' },
  { idx: 8, color: '#27ff83', wipeStart: 2949, wipeEnd: 3012, holdEnd: 3520, text: 'for you to develop a better taste in your craft' },
  { idx: 9, color: '#f5003a', wipeStart: 3520, wipeEnd: 3582, holdEnd: 4017, text: 'is a hall of fame elected by you' },
  { idx: 10, color: '#6a76ff', wipeStart: 4017, wipeEnd: 4079, holdEnd: 4399, text: 'a tavern for the wanderers' },
  { idx: 11, color: '#d8ff2a', wipeStart: 4399, wipeEnd: 4461, holdEnd: 4800, text: 'a beautiful looking list' },
  { idx: 12, color: '#27ff83', wipeStart: 4800, wipeEnd: 4862, holdEnd: 5200, text: 'an investment for your passion' },
  { idx: 13, color: '#f5003a', wipeStart: 5200, wipeEnd: 5262, holdEnd: 5609, text: 'that fourplay that never stops' },
  { idx: 14, color: '#6a76ff', wipeStart: 5609, wipeEnd: 5671, holdEnd: 6041, text: 'an antigate-keeping platform' },
  { idx: 15, color: '#d8ff2a', wipeStart: 6041, wipeEnd: 6103, holdEnd: 6400, text: 'a piggy bank with people' },
  { idx: 16, color: '#27ff83', wipeStart: 6400, wipeEnd: 6462, holdEnd: 6758, text: 'a binocular to stock on someone’s mind' }
];

export class HomeApp {
  constructor() {
    // If user is already logged in, immediately redirect to their Nopitac board
    try {
      if (localStorage.getItem('nopitac_user')) {
        window.location.replace('/board.html');
        return;
      }
    } catch (e) {}

    this.currentStageIndex = 0;
    this.currentAccentColor = '#f5003a';
    this.lockedAuthColor = null;
    this.isTransitioning = false;
    this.buttonsShown = false;
    this.wheelTimeout = null;

    this.initElements();
    this.initScaling();
    this.initAnimation();
    this.bindEvents();
  }

  initElements() {
    this.viewport = document.getElementById('homeViewport');
    this.lottieContainer = document.getElementById('lottieContainer');
    this.boxHitArea = document.getElementById('boxHitArea');

    this.signUpBtn = document.getElementById('homeSignUpBtn');
    this.signInBtn = document.getElementById('homeSignInBtn');

    // Auth screen elements
    this.authScreen = document.getElementById('authScreen');
    this.authBackBtn = document.getElementById('authBackBtn');
    this.signInForm = document.getElementById('signInForm');
    this.signUpForm = document.getElementById('signUpForm');
    this.signInGoogleBtn = document.getElementById('signInGoogleBtn');
    this.signUpGoogleBtn = document.getElementById('signUpGoogleBtn');
    this.signInToSignUpBtn = document.getElementById('signInToSignUpBtn');
    this.signUpToSignInBtn = document.getElementById('signUpToSignInBtn');
  }

  initScaling() {
    const BASE_WIDTH = 1440;
    const BASE_HEIGHT = 900;

    const applyScale = () => {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const scale = Math.min(winW / BASE_WIDTH, winH / BASE_HEIGHT);
      if (this.viewport) {
        this.viewport.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
      this.updateAuthLayout();
    };

    window.addEventListener('resize', applyScale);
    applyScale();
  }

  initAnimation() {
    if (!this.lottieContainer) return;

    this.anim = lottie.loadAnimation({
      container: this.lottieContainer,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: entryAnimationData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        progressiveLoad: false,
        hideOnTransparent: false
      }
    });

    window.anim = this.anim;

    // Monitor frame progression
    this.anim.addEventListener('enterFrame', (e) => {
      const frame = Math.floor(e.currentTime);

      // Loop smoothly from end back to stage 0
      if (frame >= 6758) {
        this.anim.goToAndPlay(STAGES[0].wipeStart, true);
        return;
      }

      // Show bottom buttons once the logo typing and box wipe are underway
      if (frame >= 660 && !this.buttonsShown) {
        this.showButtons();
      }

      // Track active stage and update current accent color
      if (frame >= 599) {
        let detectedStage = 0;
        for (let i = 0; i < STAGES.length; i++) {
          if (frame >= STAGES[i].wipeStart) {
            detectedStage = i;
          }
        }
        if (this.currentStageIndex !== detectedStage) {
          this.currentStageIndex = detectedStage;
        }
        const activeColor = STAGES[detectedStage].color;
        if (this.currentAccentColor !== activeColor) {
          this.currentAccentColor = activeColor;
          document.documentElement.style.setProperty('--current-accent-color', activeColor);
        }
      }
    });
  }

  showButtons() {
    this.buttonsShown = true;
    if (this.signUpBtn) this.signUpBtn.classList.add('visible');
    if (this.signInBtn) this.signInBtn.classList.add('visible');
  }

  goToStage(stageIndex) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    setTimeout(() => { this.isTransitioning = false; }, 350);

    const targetIdx = (stageIndex + STAGES.length) % STAGES.length;
    this.currentStageIndex = targetIdx;
    const stage = STAGES[targetIdx];

    // Jump to the wipe start of the target stage
    // This immediately triggers the vertical wipe down of the colored rectangle
    // and reveals the definition with the exact AE easing and motion!
    this.anim.goToAndPlay(stage.wipeStart, true);

    this.currentAccentColor = stage.color;
    document.documentElement.style.setProperty('--current-accent-color', stage.color);
    this.showButtons();
  }

  nextStage() {
    // If user interacts during intro, jump directly to stage 0
    if (this.anim.currentRawFrame < 599) {
      this.goToStage(0);
      return;
    }
    this.goToStage(this.currentStageIndex + 1);
  }

  prevStage() {
    if (this.anim.currentRawFrame < 599) {
      this.goToStage(0);
      return;
    }
    this.goToStage(this.currentStageIndex - 1);
  }

  bindEvents() {
    // 1. Click on central box advances to next definition with wipe animation
    if (this.boxHitArea) {
      this.boxHitArea.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.nextStage();
      });

      // 2. Wheel scroll on central box
      this.boxHitArea.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (Math.abs(e.deltaY) < 12) return;
        if (this.wheelTimeout) return;
        this.wheelTimeout = setTimeout(() => { this.wheelTimeout = null; }, 400);

        if (e.deltaY > 0) {
          this.nextStage();
        } else {
          this.prevStage();
        }
      }, { passive: false });
    }

    // Also support global keyboard navigation (Up / Down / Space)
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping || (this.authScreen && this.authScreen.classList.contains('is-open'))) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        this.nextStage();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        this.prevStage();
      }
    });

    // 3. Buttons click handlers
    if (this.signUpBtn) {
      this.signUpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openAuth('signup');
      });
      this.signUpBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openAuth('signup');
        }
      });
    }

    if (this.signInBtn) {
      this.signInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openAuth('signin');
      });
      this.signInBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openAuth('signin');
        }
      });
    }

    // 4. Auth screen events & interactive bindings
    if (this.authBackBtn) {
      this.authBackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAuth();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.authScreen && this.authScreen.classList.contains('is-open')) {
        this.closeAuth();
      }
    });

    if (this.signInToSignUpBtn) {
      this.signInToSignUpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openAuth('signup', true);
      });
    }

    if (this.signUpToSignInBtn) {
      this.signUpToSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openAuth('signin', true);
      });
    }

    // Inputs focus/blur/input handling to manage SVG labels
    const allInputs = document.querySelectorAll('.auth-field-input');
    allInputs.forEach((input) => {
      const row = input.closest('.auth-field-row');
      if (!row) return;

      // Clicking anywhere on the row focuses the input directly
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (document.activeElement !== input) {
          input.focus();
        }
      });

      input.addEventListener('focus', () => {
        row.classList.add('is-focused');
      });

      const syncVal = () => {
        if (input.value && input.value.length > 0) {
          row.classList.add('has-value');
        } else {
          row.classList.remove('has-value');
        }
      };

      input.addEventListener('blur', () => {
        row.classList.remove('is-focused');
        syncVal();
      });

      input.addEventListener('input', syncVal);
      input.addEventListener('keyup', syncVal);
      input.addEventListener('change', syncVal);
    });

    // Helper to persist auth and navigate to after-sign-up landing screen
    const completeAuthAndProceed = (userData) => {
      const accent = this.lockedAuthColor || this.currentAccentColor || '#6a76ff';
      try {
        localStorage.setItem('nopitac_user', JSON.stringify(userData));
        localStorage.setItem('nopitac_accent_color', accent);
      } catch (err) {}
      this.closeAuth();
      window.location.replace(`/landing.html?color=${encodeURIComponent(accent)}`);
    };

    // Google Auth buttons
    const handleGoogleAuth = async (e) => {
      e.preventDefault();
      if (isSupabaseConfigured && supabase) {
        const accent = this.lockedAuthColor || this.currentAccentColor || '#6a76ff';
        try {
          localStorage.setItem('nopitac_accent_color', accent);
        } catch (err) {}
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/landing.html?color=${encodeURIComponent(accent)}`
          }
        });
        if (!error) return;
        console.warn('Google OAuth unavailable, falling back:', error.message);
      }
      const userData = {
        email: 'creative.member@nopitac.com',
        name: 'creative member',
        provider: 'google',
        loggedInAt: Date.now()
      };
      completeAuthAndProceed(userData);
    };

    if (this.signInGoogleBtn) {
      this.signInGoogleBtn.addEventListener('click', handleGoogleAuth);
    }
    if (this.signUpGoogleBtn) {
      this.signUpGoogleBtn.addEventListener('click', handleGoogleAuth);
    }

    // Form submissions
    if (this.signInForm) {
      this.signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userInput = document.getElementById('signInUsername');
        const passInput = document.getElementById('signInPassword');
        const val = userInput && userInput.value ? userInput.value.trim() : '';
        const password = passInput ? passInput.value : '';

        if (isSupabaseConfigured && val && password) {
          const { data, error } = await nopitacService.signIn({ identifier: val, password });
          if (error) {
            alert(error.message || 'Sign in failed. Please check your credentials.');
            return;
          }
          const user = data?.user;
          const profileName = user?.user_metadata?.username || user?.user_metadata?.name || val;
          completeAuthAndProceed({
            id: user?.id,
            username: profileName,
            name: user?.user_metadata?.name || profileName,
            email: user?.email || val,
            provider: 'supabase',
            loggedInAt: Date.now()
          });
          return;
        }

        const fallbackVal = val || 'member';
        completeAuthAndProceed({
          username: fallbackVal,
          email: fallbackVal.includes('@') ? fallbackVal : `${fallbackVal}@nopitac.com`,
          provider: 'credentials',
          loggedInAt: Date.now()
        });
      });
    }

    if (this.signUpForm) {
      this.signUpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('signUpName');
        const userInput = document.getElementById('signUpUsername');
        const emailInput = document.getElementById('signUpEmail');
        const passInput = document.getElementById('signUpPassword');
        const rePassInput = document.getElementById('signUpRePassword');

        const nameVal = nameInput && nameInput.value ? nameInput.value.trim() : 'Creative Member';
        const userVal = userInput && userInput.value ? userInput.value.trim() : 'member';
        const emailVal = emailInput && emailInput.value ? emailInput.value.trim() : `${userVal}@nopitac.com`;
        const password = passInput ? passInput.value : '';
        const rePassword = rePassInput ? rePassInput.value : '';

        if (rePassInput && password !== rePassword) {
          alert('Passwords do not match.');
          return;
        }

        if (isSupabaseConfigured && emailVal && password) {
          const accent = this.lockedAuthColor || this.currentAccentColor || '#6a76ff';
          const { data, error } = await nopitacService.signUp({
            name: nameVal,
            username: userVal,
            email: emailVal,
            password,
            accentColor: accent
          });
          if (error) {
            alert(error.message || 'Sign up failed.');
            return;
          }
          completeAuthAndProceed({
            id: data?.user?.id,
            name: nameVal,
            username: userVal,
            email: emailVal,
            provider: 'supabase',
            loggedInAt: Date.now()
          });
          return;
        }

        completeAuthAndProceed({
          name: nameVal,
          username: userVal,
          email: emailVal,
          provider: 'credentials',
          loggedInAt: Date.now()
        });
      });
    }
  }

  updateAuthLayout() {
    if (!this.authScreen) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const halfW = winW / 2;

    // Uniform margin for the left poster extending to fill the left half
    const posterMargin = Math.round(Math.min(48, Math.max(24, Math.min(halfW * 0.06, winH * 0.053))));
    this.authScreen.style.setProperty('--auth-poster-margin', `${posterMargin}px`);

    // Grouped content in the center of the right half
    const mode = this.authScreen.getAttribute('data-mode') || 'signin';
    const neededH = mode === 'signup' ? 810 : 680;
    const availH = winH - 48;
    const availW = halfW - 40;
    const scale = Math.min(1, Math.min(availH / neededH, availW / 384));
    this.authScreen.style.setProperty('--auth-right-scale', Math.max(0.60, scale).toFixed(3));
  }

  openAuth(mode = 'signin', preserveColor = false) {
    if (!this.authScreen) return;
    const cleanMode = mode.toLowerCase().includes('up') ? 'signup' : 'signin';
    this.authScreen.setAttribute('data-mode', cleanMode);

    // Lock the exact color of the rectangle on the home page when Sign In / Sign Up is clicked,
    // and pause the home animation so the color remains consistent through auth and landing.
    if (!preserveColor || !this.lockedAuthColor) {
      this.lockedAuthColor = this.currentAccentColor || '#f5003a';
    }
    if (this.anim) {
      this.anim.pause();
    }

    const accentColor = this.lockedAuthColor;
    this.authScreen.style.setProperty('--auth-accent-color', accentColor);
    try {
      localStorage.setItem('nopitac_accent_color', accentColor);
    } catch (e) {}

    // Update layout scale
    this.updateAuthLayout();

    // Reset and trigger entrance animation (right side animated, under 0.6s total)
    this.authScreen.classList.remove('is-open');
    void this.authScreen.offsetWidth; // force reflow
    this.authScreen.classList.add('is-open');

    // Auto-focus first input field after animation begins
    setTimeout(() => {
      if (cleanMode === 'signin') {
        const input = document.getElementById('signInUsername');
        if (input) input.focus();
      } else {
        const input = document.getElementById('signUpName');
        if (input) input.focus();
      }
    }, 120);
  }

  closeAuth() {
    if (!this.authScreen) return;
    this.authScreen.classList.remove('is-open');
    this.lockedAuthColor = null;
    if (this.anim) {
      this.anim.play();
    }
  }
}

// Auto-boot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.homeApp = new HomeApp();
});
