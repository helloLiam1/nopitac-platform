import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9259;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { if (this.ws) this.ws.close(); }
}

async function getTabs(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      return await res.json();
    } catch (e) { await sleep(400); }
  }
  throw new Error('Chrome failed to start');
}

async function evalExpr(client, expression) {
  const res = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : null;
}

async function captureScreenshot(client, outPath, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const res = await client.send('Page.captureScreenshot', params);
  fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: ${outPath}`);
}

async function run() {
  console.log('Launching headless Chrome...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    const tabs = await getTabs();
    const client = new CDPClient(tabs[0].webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('CSS.enable');

    console.log('Navigating to http://localhost:5173/board.html...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    
    console.log('Waiting for board to settle...');
    await sleep(4000);

    const artifactDir = '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4';

    // -------------------------------------------------------------
    // Test 1: Open Add Name button and trigger Photo Panel
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Open Add Name button and trigger Photo Panel ---');
    const openRes = await evalExpr(client, `
      (() => {
        const addBtn = window.__addPersonButton;
        if (!addBtn) return { error: 'No addPersonButton found' };
        addBtn.open();
        
        addBtn.formData.fullName = 'charlie maignan';
        addBtn.formData.photo = {
          imageHref: '/images/charlie_maignan.png',
          theme: 'dark',
          imageScale: 1.05,
          imagePanX: 0,
          imagePanY: 0
        };
        addBtn.openPhotoPanel();

        const widget = document.getElementById('photoPanelWidget');
        const svg = widget ? widget.querySelector('svg.photo-panel-svg') : null;
        const blueRect = widget ? widget.querySelector('rect[stroke="#4141e0"], rect[stroke="#4141E0"]') : null;
        const instructionPaths = widget ? widget.querySelectorAll('.photo-instruction-text path') : [];

        return {
          isOpen: addBtn.photoPanel ? addBtn.photoPanel.isOpen : false,
          edge: addBtn.photoPanel ? addBtn.photoPanel.edge : null,
          side: addBtn.photoPanel ? addBtn.photoPanel.side : null,
          theme: addBtn.photoPanel ? addBtn.photoPanel.theme : null,
          hasSvg: !!svg,
          noBlueRect: !blueRect,
          instructionPathsCount: instructionPaths.length
        };
      })()
    `);
    console.log('Top edge Dark mode open result:', openRes);

    await sleep(600);

    // Screenshot 1: Top edge Dark Mode
    await captureScreenshot(client, path.join(artifactDir, 'board_photo_panel_top_dark.png'), {
      x: 450,
      y: 0,
      width: 450,
      height: 720,
      scale: 1
    });

    // -------------------------------------------------------------
    // Test 2: Toggle Theme (Dark -> Light)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Toggle Theme (Dark -> Light) ---');
    const toggleThemeRes = await evalExpr(client, `
      (() => {
        const addBtn = window.__addPersonButton;
        const photoPanel = addBtn.photoPanel;
        const btnTheme = document.getElementById('photoBtnToggleTheme');
        if (btnTheme) btnTheme.onclick({ stopPropagation: () => {} });

        return {
          theme: photoPanel ? photoPanel.theme : null
        };
      })()
    `);
    console.log('Toggle theme result:', toggleThemeRes);

    await sleep(400);

    // Screenshot 2: Top edge Light Mode
    await captureScreenshot(client, path.join(artifactDir, 'board_photo_panel_top_light.png'), {
      x: 450,
      y: 0,
      width: 450,
      height: 720,
      scale: 1
    });

    // -------------------------------------------------------------
    // Test 3: Zoom In and Zoom Out Clamping
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Zoom In (+) and Zoom Out (-) Clamping ---');
    const zoomTestRes = await evalExpr(client, `
      (() => {
        const addBtn = window.__addPersonButton;
        const photoPanel = addBtn.photoPanel;
        const btnIn = document.getElementById('photoBtnZoomIn');
        const btnOut = document.getElementById('photoBtnZoomOut');
        
        // Zoom in once
        if (btnIn) btnIn.onclick({ stopPropagation: () => {} });
        const scaleAfterIn = photoPanel.imageScale;

        // Zoom out 10 times to test clamp >= 1.0
        if (btnOut) {
          for (let i = 0; i < 10; i++) btnOut.onclick({ stopPropagation: () => {} });
        }
        const scaleAfterOut = photoPanel.imageScale;

        return {
          scaleAfterIn,
          scaleAfterOut,
          isGte1: scaleAfterOut >= 1.0
        };
      })()
    `);
    console.log('Zoom test result:', zoomTestRes);

    // -------------------------------------------------------------
    // Test 4: Left Edge Attachment
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Left Edge Attachment ---');
    const leftEdgeRes = await evalExpr(client, `
      (() => {
        const addBtn = window.__addPersonButton;
        const photoPanel = addBtn.photoPanel;
        addBtn.setEdge('left');
        addBtn.open();
        photoPanel.theme = 'dark';
        addBtn.openPhotoPanel();

        const widget = document.getElementById('photoPanelWidget');
        const rect = widget ? widget.getBoundingClientRect() : null;

        return {
          edge: photoPanel.edge,
          side: photoPanel.side,
          widgetRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
        };
      })()
    `);
    console.log('Left edge result:', leftEdgeRes);

    await sleep(600);

    // Screenshot 3: Left edge Photo Panel
    await captureScreenshot(client, path.join(artifactDir, 'board_photo_panel_left.png'), {
      x: 0,
      y: 100,
      width: 750,
      height: 400,
      scale: 1
    });

    // -------------------------------------------------------------
    // Test 5: Right Edge Attachment
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Right Edge Attachment ---');
    const rightEdgeRes = await evalExpr(client, `
      (() => {
        const addBtn = window.__addPersonButton;
        const photoPanel = addBtn.photoPanel;
        addBtn.setEdge('right');
        addBtn.open();
        photoPanel.theme = 'dark';
        addBtn.openPhotoPanel();

        const widget = document.getElementById('photoPanelWidget');
        const rect = widget ? widget.getBoundingClientRect() : null;

        return {
          edge: photoPanel.edge,
          side: photoPanel.side,
          widgetRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
        };
      })()
    `);
    console.log('Right edge result:', rightEdgeRes);

    await sleep(600);

    // Screenshot 4: Right edge Photo Panel
    await captureScreenshot(client, path.join(artifactDir, 'board_photo_panel_right.png'), {
      x: 690,
      y: 100,
      width: 750,
      height: 400,
      scale: 1
    });

    console.log('\nAll tests and screenshots completed successfully!');
  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
