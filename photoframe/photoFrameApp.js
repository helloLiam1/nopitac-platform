/**
 * NOPITAC Photo Frame Interactive Application
 */

import { PhotoFrameEngine } from './photoFrameEngine.js';

class PhotoFrameApp {
  constructor() {
    this.engine = new PhotoFrameEngine();

    // State
    this.name = 'charlie maignan';
    this.fontSize = 32;
    this.theme = 'both'; // 'light' | 'dark' | 'both'
    this.viewMode = 'final'; // 'final' | 'steps' | 'animation'
    this.showCardBorder = true;
    this.cardPaddingRatio = 0.35;

    // Animation preview state
    this.animProgress = 0; // 0..1
    this.isPlayingAnim = false;
    this.animRafId = null;
    this.animStartTs = null;

    // Image state
    this.defaultImageHref = '';
    this.currentImageHref = '';
    this.currentImageName = 'charlie_maignan.png';
    this.imageNaturalWidth = 200;
    this.imageNaturalHeight = 198;
    this.imageScale = 1.05;
    this.imagePanX = 0; // % offset (-100 to +100)
    this.imagePanY = 0;

    // Pan interaction
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.startPanX = 0;
    this.startPanY = 0;

    this.cacheElements();
    this.bindEvents();
    this.loadDefaultImage();
  }

  cacheElements() {
    // Inputs & buttons
    this.nameInput = document.getElementById('nameInput');
    this.presetChips = document.querySelectorAll('.preset-chip');
    this.fileInput = document.getElementById('fileInput');
    this.dropzone = document.getElementById('dropzone');
    this.resetImgBtn = document.getElementById('resetImgBtn');
    this.imageNameEl = document.getElementById('imageName');
    this.imageThumbEl = document.getElementById('imageThumb');

    // Controls
    this.scaleSlider = document.getElementById('scaleSlider');
    this.scaleVal = document.getElementById('scaleVal');
    this.fontSizeSlider = document.getElementById('fontSizeSlider');
    this.fontSizeVal = document.getElementById('fontSizeVal');
    this.panXSlider = document.getElementById('panXSlider');
    this.panXVal = document.getElementById('panXVal');
    this.panYSlider = document.getElementById('panYSlider');
    this.panYVal = document.getElementById('panYVal');
    this.borderToggle = document.getElementById('borderToggle');

    // Buttons
    this.themeBtns = document.querySelectorAll('[data-theme]');
    this.viewBtns = document.querySelectorAll('[data-view]');
    this.animationControlGroup = document.getElementById('animationControlGroup');
    this.animPlayBtn = document.getElementById('animPlayBtn');
    this.animProgressSlider = document.getElementById('animProgressSlider');
    this.animProgressVal = document.getElementById('animProgressVal');
    this.exportSvgBtn = document.getElementById('exportSvgBtn');
    this.exportPngBtn = document.getElementById('exportPngBtn');
    this.copySvgBtn = document.getElementById('copySvgBtn');

    // Canvas Stage
    this.stageViewport = document.getElementById('stageViewport');
    this.toastEl = document.getElementById('toast');
  }

  async loadDefaultImage() {
    try {
      const res = await fetch('./charlie_maignan.png');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        this.defaultImageHref = reader.result;
        this.currentImageHref = reader.result;
        if (this.imageThumbEl) this.imageThumbEl.src = reader.result;
        const img = new Image();
        img.onload = () => {
          this.imageNaturalWidth = img.naturalWidth || 200;
          this.imageNaturalHeight = img.naturalHeight || 198;
          this.render();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.warn('Could not load local charlie_maignan.png, using fallback', e);
      this.render();
    }
  }

  bindEvents() {
    // Name typing
    this.nameInput.addEventListener('input', (e) => {
      this.name = e.target.value.trim() || ' ';
      this.render();
    });

    // Preset chips
    this.presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.name = chip.dataset.name;
        this.nameInput.value = this.name;
        this.render();
      });
    });

    // File input & Drag/Drop
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleImageFile(file);
    });

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('drag-over');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('drag-over');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        this.handleImageFile(file);
      }
    });

    this.resetImgBtn.addEventListener('click', () => {
      this.currentImageHref = this.defaultImageHref;
      this.currentImageName = 'charlie_maignan.png';
      this.imageNameEl.textContent = this.currentImageName;
      if (this.imageThumbEl) this.imageThumbEl.src = this.defaultImageHref;
      this.imageNaturalWidth = 200;
      this.imageNaturalHeight = 198;
      this.imageScale = 1.05;
      this.imagePanX = 0;
      this.imagePanY = 0;
      this.updateSliderUI();
      this.render();
    });

    // Image Zoom Slider
    this.scaleSlider.addEventListener('input', (e) => {
      this.imageScale = parseFloat(e.target.value);
      this.scaleVal.textContent = Math.round(this.imageScale * 100) + '%';
      this.render();
    });

    // Font Size Slider
    this.fontSizeSlider.addEventListener('input', (e) => {
      this.fontSize = parseInt(e.target.value, 10);
      this.fontSizeVal.textContent = this.fontSize + 'px';
      this.render();
    });

    // Pan X Slider
    this.panXSlider.addEventListener('input', (e) => {
      this.imagePanX = parseInt(e.target.value, 10);
      this.panXVal.textContent = this.imagePanX + '%';
      this.render();
    });

    // Pan Y Slider
    this.panYSlider.addEventListener('input', (e) => {
      this.imagePanY = parseInt(e.target.value, 10);
      this.panYVal.textContent = this.imagePanY + '%';
      this.render();
    });

    // Card border toggle
    this.borderToggle.addEventListener('change', (e) => {
      this.showCardBorder = e.target.checked;
      this.render();
    });

    // Theme toggles
    this.themeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.themeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.theme = btn.dataset.theme;
        this.render();
      });
    });

    // View mode toggles
    this.viewBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.viewBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewMode = btn.dataset.view;
        if (this.animationControlGroup) {
          this.animationControlGroup.classList.toggle('hidden', this.viewMode !== 'animation');
        }
        if (this.viewMode === 'animation') {
          this.startAnimationLoop();
        } else {
          this.stopAnimationLoop();
        }
        this.render();
      });
    });

    if (this.animPlayBtn) {
      this.animPlayBtn.addEventListener('click', () => {
        if (this.isPlayingAnim) {
          this.stopAnimationLoop();
        } else {
          this.startAnimationLoop();
        }
      });
    }

    if (this.animProgressSlider) {
      this.animProgressSlider.addEventListener('input', (e) => {
        this.stopAnimationLoop();
        this.animProgress = parseInt(e.target.value, 10) / 100;
        if (this.animProgressVal) this.animProgressVal.textContent = e.target.value + '%';
        this.render();
      });
    }

    // Direct Canvas Drag to Pan image inside the stationary square mask
    this.stageViewport.addEventListener('mousedown', (e) => {
      const card = e.target.closest('.card-wrapper') || e.target.closest('svg.photo-frame-svg');
      if (!card || this.viewMode === 'steps') return;
      e.preventDefault();
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.startPanX = this.imagePanX;
      this.startPanY = this.imagePanY;

      // Calculate displayed square size in screen pixels for 1:1 direct tracking
      const svgEl = document.querySelector('svg.photo-frame-svg');
      const clipRectEl = svgEl ? svgEl.querySelector('clipPath rect') : null;
      if (clipRectEl && svgEl) {
        const svgRect = svgEl.getBoundingClientRect();
        const vbWidth = svgEl.viewBox.baseVal.width || svgRect.width;
        const scaleScreen = svgRect.width / vbWidth;
        this.displayedSquarePx = (parseFloat(clipRectEl.getAttribute('width')) || 200) * scaleScreen;
      } else {
        this.displayedSquarePx = 200;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      const dSquare = this.displayedSquarePx || 200;
      const deltaPercentX = (dx / dSquare) * 100;
      const deltaPercentY = (dy / dSquare) * 100;

      this.imagePanX = Math.max(-100, Math.min(100, Math.round(this.startPanX + deltaPercentX)));
      this.imagePanY = Math.max(-100, Math.min(100, Math.round(this.startPanY + deltaPercentY)));
      this.updateSliderUI();
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Mouse wheel over canvas to zoom
    this.stageViewport.addEventListener('wheel', (e) => {
      if (this.viewMode === 'steps') return;
      e.preventDefault();
      const delta = e.deltaY * -0.0015;
      this.imageScale = Math.max(0.5, Math.min(3.0, this.imageScale + delta));
      this.updateSliderUI();
      this.render();
    }, { passive: false });

    // Export buttons
    this.exportSvgBtn.addEventListener('click', () => this.exportSvg());
    this.exportPngBtn.addEventListener('click', () => this.exportPng());
    this.copySvgBtn.addEventListener('click', () => this.copySvg());
  }

  handleImageFile(file) {
    this.currentImageName = file.name;
    this.imageNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.currentImageHref = reader.result;
      if (this.imageThumbEl) this.imageThumbEl.src = reader.result;
      const img = new Image();
      img.onload = () => {
        this.imageNaturalWidth = img.naturalWidth || 200;
        this.imageNaturalHeight = img.naturalHeight || 200;
        this.render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  updateSliderUI() {
    this.scaleSlider.value = this.imageScale.toFixed(2);
    this.scaleVal.textContent = Math.round(this.imageScale * 100) + '%';
    this.panXSlider.value = this.imagePanX;
    this.panXVal.textContent = this.imagePanX + '%';
    this.panYSlider.value = this.imagePanY;
    this.panYVal.textContent = this.imagePanY + '%';
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2200);
  }

  startAnimationLoop() {
    this.stopAnimationLoop();
    this.isPlayingAnim = true;
    if (this.animPlayBtn) this.animPlayBtn.textContent = 'Pause';
    // Ping-pong with brief holds at open (p=0) and collapsed (p=1): 3.2s full cycle
    const cycleMs = 3200;
    this.animStartTs = performance.now() - this.animProgress * (cycleMs * 0.4);

    const tick = (now) => {
      if (!this.isPlayingAnim) return;
      const t = ((now - this.animStartTs) % cycleMs) / cycleMs;
      let p = 0;
      if (t < 0.15) {
        p = 0;
      } else if (t < 0.5) {
        p = (t - 0.15) / 0.35;
        // Smoothstep easing
        p = p * p * (3 - 2 * p);
      } else if (t < 0.65) {
        p = 1;
      } else {
        p = 1 - (t - 0.65) / 0.35;
        p = p * p * (3 - 2 * p);
      }

      this.animProgress = p;
      const pct = Math.round(p * 100);
      if (this.animProgressSlider) this.animProgressSlider.value = String(pct);
      if (this.animProgressVal) this.animProgressVal.textContent = `${pct}%`;
      this.render();
      this.animRafId = requestAnimationFrame(tick);
    };

    this.animRafId = requestAnimationFrame(tick);
  }

  stopAnimationLoop() {
    this.isPlayingAnim = false;
    if (this.animRafId) {
      cancelAnimationFrame(this.animRafId);
      this.animRafId = null;
    }
    if (this.animPlayBtn) this.animPlayBtn.textContent = 'Play';
  }

  render() {
    const progress = this.viewMode === 'animation' ? this.animProgress : 0;
    const opts = {
      fontSize: this.fontSize,
      imageHref: this.currentImageHref,
      imageScale: this.imageScale,
      imagePanX: this.imagePanX,
      imagePanY: this.imagePanY,
      imageNaturalWidth: this.imageNaturalWidth,
      imageNaturalHeight: this.imageNaturalHeight,
      showCardBorder: this.showCardBorder,
      cardPaddingRatio: this.cardPaddingRatio,
      progress
    };

    if (this.viewMode === 'steps') {
      this.renderStepsBreakdown(opts);
      return;
    }

    if (this.theme === 'both') {
      // Side-by-side mode (Dark card + Light card)
      const { darkCard, lightCard } = this.engine.renderSideBySide(this.name, opts);
      this.stageViewport.innerHTML = `
        <div class="side-by-side-view">
          <div class="card-wrapper" title="Drag to reposition photo, scroll to zoom">${darkCard}</div>
          <div class="card-wrapper" title="Drag to reposition photo, scroll to zoom">${lightCard}</div>
        </div>
      `;
    } else {
      // Single card mode
      const cardSvg = this.engine.renderAnimatedFrame(this.name, progress, {
        ...opts,
        theme: this.theme
      });
      this.stageViewport.innerHTML = `
        <div class="card-wrapper" title="Drag to reposition photo, scroll to zoom">${cardSvg}</div>
      `;
    }
  }

  renderStepsBreakdown(opts) {
    const step1 = this.engine.renderStep(this.name, 1, opts);
    const step2 = this.engine.renderStep(this.name, 2, opts);
    const step3 = this.engine.renderStep(this.name, 3, opts);
    const step4 = this.engine.renderStep(this.name, 4, opts);
    const step5 = this.engine.renderStep(this.name, 5, opts);

    const metrics = this.engine.calculateMetrics(this.name, opts);
    const scale = this.fontSize / this.engine.baseFontSize;
    const underlineLen = metrics ? (metrics.underlineWidth * scale).toFixed(1) : '78.9';
    const overlapLen = metrics ? (metrics.overlap * scale).toFixed(1) : '1.5';

    this.stageViewport.innerHTML = `
      <div class="steps-view">
        <div class="step-card">
          <div class="step-header">
            <span class="step-number">Step 1</span>
            <span class="step-title">Write Name in Nopitac Helvetica</span>
          </div>
          <div class="step-desc">Write the name in the custom Nopitac Helvetica typeface featuring the signature underline connecting front and back brackets.</div>
          <div class="step-canvas">${step1}</div>
        </div>

        <div class="step-card">
          <div class="step-header">
            <span class="step-number">Step 2</span>
            <span class="step-title">Measure Underline & Create Square</span>
          </div>
          <div class="step-desc">Examine the exact typographic length of the underline (${underlineLen}px) and create a square with that side length.</div>
          <div class="step-canvas">${step2}</div>
        </div>

        <div class="step-card">
          <div class="step-header">
            <span class="step-number">Step 3</span>
            <span class="step-title">Square Clipping Mask for Submitted Image</span>
          </div>
          <div class="step-desc">Apply the ${underlineLen}px square as a clean clipping mask for the submitted portrait photo.</div>
          <div class="step-canvas">${step3}</div>
        </div>

        <div class="step-card">
          <div class="step-header">
            <span class="step-number">Step 4</span>
            <span class="step-title">Position Image Below Text with 1/4 x-Height Overlap</span>
          </div>
          <div class="step-desc">Move the square with the image below the text layer, elevating it so the top edge reaches 1/4 the x-height from the baseline (${overlapLen}px).</div>
          <div class="step-canvas">${step4}</div>
        </div>

        <div class="step-card">
          <div class="step-header">
            <span class="step-number">Step 5</span>
            <span class="step-title">Extend Underline Till End of Square Photo</span>
          </div>
          <div class="step-desc">Extend the underline continuously down the left side, across the bottom, and up the right side of the photo to form the signature frame.</div>
          <div class="step-canvas">${step5}</div>
        </div>
      </div>
    `;
  }

  getCurrentSvgString() {
    const opts = {
      fontSize: this.fontSize,
      imageHref: this.currentImageHref,
      imageScale: this.imageScale,
      imagePanX: this.imagePanX,
      imagePanY: this.imagePanY,
      showCardBorder: this.showCardBorder,
      cardPaddingRatio: this.cardPaddingRatio,
      theme: this.theme === 'both' ? 'dark' : this.theme
    };
    return this.engine.renderFinalFrame(this.name, opts);
  }

  exportSvg() {
    const svgStr = this.getCurrentSvgString();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nopitac_frame_${this.name.replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('SVG exported successfully!');
  }

  copySvg() {
    const svgStr = this.getCurrentSvgString();
    navigator.clipboard.writeText(svgStr).then(() => {
      this.showToast('SVG code copied to clipboard!');
    }).catch(() => {
      this.showToast('Failed to copy SVG');
    });
  }

  exportPng() {
    const svgStr = this.getCurrentSvgString();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scaleFactor = 2; // High-resolution retina scale
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scaleFactor;
      canvas.height = img.height * scaleFactor;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `nopitac_frame_${this.name.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.showToast('High-res PNG exported successfully!');
    };
    img.src = url;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.photoFrameApp = new PhotoFrameApp();
});

