/**
 * NOPITAC — Custom Helvetica Signature Underline Type Tool & Composition
 */

import opentype from 'opentype.js';
import { NopitacRenderer } from './engine/nopitacRenderer.js';
import { 
  CompositionSpiralRenderer, 
  DEFAULT_DESIGNERS, 
  COMPOSITION_PRESETS 
} from './engine/compositionSpiral.js';
import { AddPersonButton } from './components/AddPersonButton.js';
import { BoardButtonsManager } from './components/BoardButtonsManager.js';

class App {
  constructor() {
    this.currentView = 'type-tool';

    // Type Tool State
    this.currentText = 'tiger dingsun';
    this.tracking = 0;
    this.scale = 1.8;
    this.renderer = new NopitacRenderer(null);

    // Composition State
    this.compRenderer = new CompositionSpiralRenderer(null);
    this.compNames = [...DEFAULT_DESIGNERS];
    this.compShape = 'square'; // 'square' | 'circle'
    this.compSpacing = 68;
    this.compScale = 0.65;
    this.compTracking = 0;
    this.compStyle = 'name-brackets';

    // Composition Animation State
    this.isCompAnimating = false;
    this.isCompRotating = false;
    this.compCornerApproach = 1;   // 1 = Snake Flow, 2 = Instant Edge Jump
    this.compAnimOffset = 0;
    this.compRotationAngle = 0;
    this.compAnimSpeed = 80;       // unscaled font units per second (flow)
    this.compRotationSpeed = 20;   // degrees per second (center rotation)
    this.compSpeedMultiplier = 1.0; // speed slider multiplier (0.2x to 3.0x)
    this.lastAnimTimestamp = null;
    this.animFrameId = null;

    this.cacheElements();
    this.initViewRouting();
    this.bindTypeToolEvents();
    this.bindCompositionEvents();
    this.bindGlobalEvents();

    this.updateTypeTool();
    this.updateComposition();
    this.loadFont();
  }

  cacheElements() {
    // Navigation
    this.tabTypeTool = document.getElementById('tabTypeTool');
    this.tabComposition = document.getElementById('tabComposition');
    this.tabBoardUi = document.getElementById('tabBoardUi');
    this.typeToolView = document.getElementById('typeToolView');
    this.compositionView = document.getElementById('compositionView');
    this.boardUiView = document.getElementById('boardUiView');
    this.tabBoardViewport = document.getElementById('tabBoardViewport');

    // Header Actions
    this.copySvgBtn = document.getElementById('copySvgBtn');
    this.exportSvgBtn = document.getElementById('exportSvgBtn');
    this.toastContainer = document.getElementById('toastContainer');

    // Type Tool Elements
    this.nameInput = document.getElementById('nameInput');
    this.clearInputBtn = document.getElementById('clearInputBtn');
    this.trackingSlider = document.getElementById('trackingSlider');
    this.trackingVal = document.getElementById('trackingVal');
    this.scaleSlider = document.getElementById('scaleSlider');
    this.scaleVal = document.getElementById('scaleVal');
    this.svgContainer = document.getElementById('svgContainer');
    this.stageWrapper = document.getElementById('stageWrapper');
    this.presetBtns = document.querySelectorAll('.preset-btn');

    // Composition Elements
    this.compNamesInput = document.getElementById('compNamesInput');
    this.compNamesCount = document.getElementById('compNamesCount');
    this.compPresetBtns = document.querySelectorAll('[data-comp-preset]');
    this.compSpacingSlider = document.getElementById('compSpacingSlider');
    this.compSpacingVal = document.getElementById('compSpacingVal');
    this.compScaleSlider = document.getElementById('compScaleSlider');
    this.compScaleVal = document.getElementById('compScaleVal');
    this.compTrackingSlider = document.getElementById('compTrackingSlider');
    this.compTrackingVal = document.getElementById('compTrackingVal');
    this.compShapeBtns = document.querySelectorAll('#compShapeToggle .segmented-btn');
    this.compStyleBtns = document.querySelectorAll('#compStyleToggle .segmented-btn');
    this.compSvgContainer = document.getElementById('compSvgContainer');
    this.compStageWrapper = document.getElementById('compStageWrapper');
    this.compApproach1Btn = document.getElementById('compApproach1Btn') || document.getElementById('compAnimateBtn');
    this.compApproach1Icon = document.getElementById('compApproach1Icon') || document.getElementById('compAnimateIcon');
    this.compApproach1Label = document.getElementById('compApproach1Label') || document.getElementById('compAnimateLabel');
    this.compApproach2Btn = document.getElementById('compApproach2Btn');
    this.compApproach2Icon = document.getElementById('compApproach2Icon');
    this.compApproach2Label = document.getElementById('compApproach2Label');
    this.compRotateBtn = document.getElementById('compRotateBtn') || document.getElementById('compAnimate2Btn');
    this.compRotateIcon = document.getElementById('compRotateIcon') || document.getElementById('compAnimate2Icon');
    this.compRotateLabel = document.getElementById('compRotateLabel') || document.getElementById('compAnimate2Label');
    // Backward-compatibility aliases
    this.compAnimateBtn = this.compApproach1Btn;
    this.compAnimateIcon = this.compApproach1Icon;
    this.compAnimateLabel = this.compApproach1Label;
    this.compAnimate2Btn = this.compRotateBtn;
    this.compAnimate2Icon = this.compRotateIcon;
    this.compAnimate2Label = this.compRotateLabel;
    this.compSpeedSlider = document.getElementById('compSpeedSlider');
    this.compSpeedVal = document.getElementById('compSpeedVal');
  }

  initViewRouting() {
    const handleHash = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (hash === 'composition') {
        this.switchView('composition');
      } else if (hash === 'board-ui') {
        this.switchView('board-ui');
      } else {
        this.switchView('type-tool');
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();

    this.tabTypeTool.addEventListener('click', () => {
      window.location.hash = '/type-tool';
    });

    this.tabComposition.addEventListener('click', () => {
      window.location.hash = '/composition';
    });

    if (this.tabBoardUi) {
      this.tabBoardUi.addEventListener('click', () => {
        window.location.hash = '/board-ui';
      });
    }
  }

  switchView(viewName) {
    this.currentView = viewName;
    const isComp = viewName === 'composition';
    const isBoard = viewName === 'board-ui';
    const isType = !isComp && !isBoard;

    if (!isComp) {
      if (this.isCompAnimating) this.stopCompositionAnimation();
      if (this.isCompRotating) this.stopCompositionRotation();
    }

    if (this.tabTypeTool) this.tabTypeTool.classList.toggle('active', isType);
    if (this.tabComposition) this.tabComposition.classList.toggle('active', isComp);
    if (this.tabBoardUi) this.tabBoardUi.classList.toggle('active', isBoard);

    if (this.typeToolView) this.typeToolView.classList.toggle('active', isType);
    if (this.compositionView) this.compositionView.classList.toggle('active', isComp);
    if (this.boardUiView) this.boardUiView.classList.toggle('active', isBoard);

    if (isComp && !this.compInitialized) {
      this.compInitialized = true;
      this.compNamesInput.value = this.compNames.join(', ');
      this.updateComposition();
    }

    if (isBoard) {
      if (!this.boardInitialized) {
        this.boardInitialized = true;
        this.initBoardUi();
      } else if (this.boardButtonsManager) {
        this.boardButtonsManager.measureDimensions();
        this.boardButtonsManager.updateBottomLinePosition();
        this.boardButtonsManager.update();
      }
    }
  }

  initBoardUi() {
    if (!this.tabBoardViewport) return;
    this.boardButtonsManager = new BoardButtonsManager({
      container: this.tabBoardViewport
    });
    this.addPersonButton = this.boardButtonsManager.addPersonComponent;
  }

  async loadFont() {
    try {
      const res = await fetch('/fonts/Helvetica-Regular.ttf');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const font = opentype.parse(buf);
        if (font) {
          this.renderer.font = font;
          this.compRenderer.font = font;
          this.updateTypeTool();
          this.updateComposition();
        }
      }
    } catch (err) {
      console.warn('Note: using precomputed Helvetica vector glyphs', err);
    }
  }

  bindTypeToolEvents() {
    // Real-time typing
    this.nameInput.addEventListener('input', (e) => {
      this.currentText = e.target.value;
      this.updateTypeTool();
      this.syncTypePresets();
    });

    // Support Shift+Space to insert word break separator ('/')
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        const start = this.nameInput.selectionStart;
        const end = this.nameInput.selectionEnd;
        const val = this.nameInput.value;
        const insertChar = '/';
        this.nameInput.value = val.substring(0, start) + insertChar + val.substring(end);
        this.nameInput.selectionStart = this.nameInput.selectionEnd = start + insertChar.length;
        this.currentText = this.nameInput.value;
        this.updateTypeTool();
        this.syncTypePresets();
      }
    });

    // Clear input
    this.clearInputBtn.addEventListener('click', () => {
      this.nameInput.value = '';
      this.currentText = '';
      this.updateTypeTool();
      this.nameInput.focus();
    });

    // Kerning slider
    this.trackingSlider.addEventListener('input', (e) => {
      this.tracking = parseFloat(e.target.value);
      this.trackingVal.textContent = Number(this.tracking) === Math.floor(this.tracking)
        ? String(this.tracking)
        : this.tracking.toFixed(1);
      this.updateTypeTool();
    });

    // Scale slider
    this.scaleSlider.addEventListener('input', (e) => {
      this.scale = parseFloat(e.target.value);
      this.scaleVal.textContent = `${this.scale.toFixed(1)}x`;
      this.applyTypeScale();
    });

    // Presets
    this.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.preset;
        this.nameInput.value = val;
        this.currentText = val;
        this.presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateTypeTool();
      });
    });

    // Stage focus click
    this.stageWrapper.addEventListener('click', (e) => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 0) return;
      if (e.target === this.stageWrapper || e.target.id === 'stageWrapper') {
        this.nameInput.focus();
      }
    });
  }

  bindCompositionEvents() {
    // Designer Names Input
    this.compNamesInput.addEventListener('input', (e) => {
      const text = e.target.value;
      this.compNames = text.split(/[\n,\/]+/).map(n => n.trim()).filter(Boolean);
      this.updateCompositionBadge();
      this.updateComposition();
      this.syncCompPresets(null);
    });

    // Spacing Slider
    this.compSpacingSlider.addEventListener('input', (e) => {
      this.compSpacing = parseFloat(e.target.value);
      this.compSpacingVal.textContent = `${Math.round(this.compSpacing)}px`;
      this.updateComposition();
    });

    // Scale Slider
    this.compScaleSlider.addEventListener('input', (e) => {
      this.compScale = parseFloat(e.target.value);
      this.compScaleVal.textContent = `${this.compScale.toFixed(2)}x`;
      this.updateComposition();
    });

    // Kerning Slider
    this.compTrackingSlider.addEventListener('input', (e) => {
      this.compTracking = parseFloat(e.target.value);
      this.compTrackingVal.textContent = Number(this.compTracking) === Math.floor(this.compTracking)
        ? String(this.compTracking)
        : this.compTracking.toFixed(1);
      this.updateComposition();
    });

    // Shape Toggle (Square vs Circle)
    this.compShapeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape;
        if (shape === this.compShape) return;
        this.compShape = shape;
        this.compShapeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateComposition();
      });
    });

    // Underline Style Toggle
    this.compStyleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.compStyle = btn.dataset.style;
        this.compStyleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateComposition();
      });
    });

    // Presets
    this.compPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.compPreset;
        const preset = COMPOSITION_PRESETS[presetKey];
        if (preset) {
          this.compNames = [...preset.names];
          this.compNamesInput.value = this.compNames.join(', ');
          this.syncCompPresets(presetKey);
          this.updateCompositionBadge();
          this.updateComposition();
        }
      });
    });

    // Approach 1 Button Toggle (Snake Flow)
    if (this.compApproach1Btn) {
      this.compApproach1Btn.addEventListener('click', () => {
        this.toggleApproach(1);
      });
    }

    // Approach 2 Button Toggle (Instant Edge Jump)
    if (this.compApproach2Btn) {
      this.compApproach2Btn.addEventListener('click', () => {
        this.toggleApproach(2);
      });
    }

    // Rotate Button Toggle (Center Rotation)
    if (this.compRotateBtn) {
      this.compRotateBtn.addEventListener('click', () => {
        this.toggleCompositionRotation();
      });
    }

    // Animation Speed Slider (Controls both flow and rotation speeds)
    if (this.compSpeedSlider) {
      this.compSpeedSlider.addEventListener('input', (e) => {
        this.compSpeedMultiplier = parseFloat(e.target.value);
        this.compSpeedVal.textContent = `${this.compSpeedMultiplier.toFixed(1)}x`;
      });
    }
  }

  bindGlobalEvents() {
    // Copy SVG Button
    this.copySvgBtn.addEventListener('click', async () => {
      const isComp = this.currentView === 'composition';
      const lastResult = isComp ? this.lastCompResult : this.lastTypeResult;
      if (!lastResult || !lastResult.svgString) return;

      try {
        await navigator.clipboard.writeText(lastResult.svgString);
        this.showToast(isComp ? 'Composition SVG copied to clipboard' : 'SVG copied to clipboard');
      } catch (e) {
        this.showToast('Clipboard access denied');
      }
    });

    // Export SVG Button
    this.exportSvgBtn.addEventListener('click', () => {
      const isComp = this.currentView === 'composition';
      const lastResult = isComp ? this.lastCompResult : this.lastTypeResult;
      if (!lastResult || !lastResult.svgString) return;

      const filename = isComp
        ? (this.compShape === 'circle' ? 'nopitac_circle_composition.svg' : 'nopitac_square_spiral_composition.svg')
        : `${(this.currentText.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'nopitac')}-nopitac.svg`;

      const blob = new Blob([lastResult.svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast(`Exported ${filename}`);
    });
  }

  syncTypePresets() {
    const cur = this.currentText.toLowerCase().trim();
    this.presetBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.preset.toLowerCase() === cur);
    });
  }

  syncCompPresets(activeKey) {
    this.compPresetBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.compPreset === activeKey);
    });
  }

  updateCompositionBadge() {
    const count = this.compNames.length;
    this.compNamesCount.textContent = `${count} ${count === 1 ? 'designer' : 'designers'}`;
  }

  applyTypeScale() {
    this.svgContainer.style.transform = `scale(${this.scale})`;
  }

  updateTypeTool() {
    if (!this.renderer) return;

    const res = this.renderer.render(this.currentText, this.tracking);
    this.lastTypeResult = res;

    if (!res || !res.svgString) {
      this.svgContainer.innerHTML = '';
      return;
    }

    this.svgContainer.innerHTML = res.svgString;
    this.applyTypeScale();
  }

  applyCompositionRotation() {
    const rotGroup = this.compSvgContainer.querySelector('#compRotationGroup');
    if (rotGroup) {
      rotGroup.setAttribute('transform', `rotate(${this.compRotationAngle.toFixed(3)}, 0, 0)`);
    }
  }

  updateComposition() {
    if (!this.compRenderer) return;

    const res = this.compRenderer.render(this.compNames, {
      shape: this.compShape,
      ringSpacing: this.compSpacing,
      scale: this.compScale,
      tracking: this.compTracking,
      bracketStyle: this.compStyle,
      animOffset: this.compAnimOffset,
      rotationAngle: this.compRotationAngle,
      animSpeed: this.compAnimSpeed * this.compSpeedMultiplier,
      cornerApproach: this.compCornerApproach
    });

    this.lastCompResult = res;

    if (!res || !res.svgString) {
      this.compSvgContainer.innerHTML = '';
      return;
    }

    this.compSvgContainer.innerHTML = res.svgString;
    this.applyCompositionRotation();
  }

  startApproach(approach = 1) {
    this.compCornerApproach = approach;
    this.isCompAnimating = true;
    this.updateApproachButtonsUI();
    this.ensureAnimLoopRunning();
    this.updateComposition();
  }

  stopCompositionAnimation() {
    this.isCompAnimating = false;
    this.updateApproachButtonsUI();
  }

  toggleApproach(approach = 1) {
    if (this.isCompAnimating && this.compCornerApproach === approach) {
      this.stopCompositionAnimation();
    } else {
      this.startApproach(approach);
    }
  }

  startCompositionAnimation() {
    this.startApproach(this.compCornerApproach || 1);
  }

  toggleCompositionAnimation() {
    this.toggleApproach(this.compCornerApproach || 1);
  }

  updateApproachButtonsUI() {
    const isApp1Active = this.isCompAnimating && this.compCornerApproach === 1;
    const isApp2Active = this.isCompAnimating && this.compCornerApproach === 2;

    if (this.compApproach1Btn) {
      this.compApproach1Btn.classList.toggle('active', isApp1Active);
      if (this.compApproach1Icon) this.compApproach1Icon.textContent = isApp1Active ? '⏸' : '▶';
      if (this.compApproach1Label) this.compApproach1Label.textContent = isApp1Active ? 'Pause 1' : 'Approach 1';
    }

    if (this.compApproach2Btn) {
      this.compApproach2Btn.classList.toggle('active', isApp2Active);
      if (this.compApproach2Icon) this.compApproach2Icon.textContent = isApp2Active ? '⏸' : '▶';
      if (this.compApproach2Label) this.compApproach2Label.textContent = isApp2Active ? 'Pause 2' : 'Approach 2';
    }
  }

  startCompositionRotation() {
    if (this.isCompRotating) return;
    this.isCompRotating = true;
    if (this.compRotateBtn) {
      this.compRotateBtn.classList.add('active');
      if (this.compRotateIcon) this.compRotateIcon.textContent = '⏸';
      if (this.compRotateLabel) this.compRotateLabel.textContent = 'Pause';
    }
    this.ensureAnimLoopRunning();
  }

  stopCompositionRotation() {
    if (!this.isCompRotating) return;
    this.isCompRotating = false;
    if (this.compRotateBtn) {
      this.compRotateBtn.classList.remove('active');
      if (this.compRotateIcon) this.compRotateIcon.textContent = '↻';
      if (this.compRotateLabel) this.compRotateLabel.textContent = 'Rotate';
    }
  }

  toggleCompositionRotation() {
    if (this.isCompRotating) {
      this.stopCompositionRotation();
    } else {
      this.startCompositionRotation();
    }
  }

  ensureAnimLoopRunning() {
    if (this.animFrameId) return;
    this.lastAnimTimestamp = null;
    this.animFrameId = requestAnimationFrame((ts) => this.animStep(ts));
  }

  animStep(timestamp) {
    if (!this.isCompAnimating && !this.isCompRotating) {
      this.animFrameId = null;
      return;
    }

    if (this.lastAnimTimestamp === null) {
      this.lastAnimTimestamp = timestamp;
    }
    const dt = (timestamp - this.lastAnimTimestamp) / 1000;
    this.lastAnimTimestamp = timestamp;

    const clampedDt = Math.min(dt, 0.05);

    if (this.isCompAnimating) {
      this.compAnimOffset += this.compAnimSpeed * this.compSpeedMultiplier * clampedDt;
      this.updateComposition();
    }

    if (this.isCompRotating) {
      this.compRotationAngle = (this.compRotationAngle + this.compRotationSpeed * this.compSpeedMultiplier * clampedDt) % 360;
      this.applyCompositionRotation();
    }

    this.animFrameId = requestAnimationFrame((ts) => this.animStep(ts));
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => new App());
