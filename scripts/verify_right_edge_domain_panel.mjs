import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9231;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'checks');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filePath, clip = null) {
    const params = { format: 'png' };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('--- Launching Chrome for Right Edge Domain Panel Verification ---');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'http://localhost:5173/board.html'
  ]);

  try {
    let connected = false;
    let attempts = 0;
    while (!connected && attempts < 20) {
      await sleep(300);
      try {
        await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        connected = true;
      } catch (e) {
        attempts++;
      }
    }

    if (!connected) throw new Error('Could not connect to Chrome debugging port');

    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    console.log('Navigated to http://localhost:5173/board.html, waiting for BoardButtonsManager...');
    
    let isReady = false;
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      try {
        const ready = await cdp.evaluate('Boolean(window.__nopitacBoardButtons)');
        if (ready) {
          isReady = true;
          break;
        }
      } catch (e) {}
    }

    if (!isReady) throw new Error('BoardButtonsManager not initialized within timeout');
    console.log('BoardButtonsManager is ready!');

    // TEST 1: Switch Add Person to Right Edge with Space on Top
    console.log('\n--- TEST 1: Right Edge with Space on Top ---');
    const test1Result = await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        if (!mgr) return { error: 'No BoardButtonsManager' };

        // Position Add Person on Right edge at y = 350 (ample space on top)
        mgr.addPersonComponent.setEdge('right');
        const widget = mgr.addPersonComponent.widget;
        widget.style.top = '350px';
        widget.style.right = '0px';
        widget.style.left = 'auto';

        // Expand Add Person
        mgr.addPersonComponent.open();

        // Open domain panel
        mgr.addPersonComponent.openDomainPanel();

        const apRect = widget.getBoundingClientRect();
        const dpWidget = document.getElementById('domainPanelWidget');
        const dpRect = dpWidget ? dpWidget.getBoundingClientRect() : null;

        return {
          apRect: { left: apRect.left, top: apRect.top, width: apRect.width, height: apRect.height },
          dpRect: dpRect ? { left: dpRect.left, top: dpRect.top, width: dpRect.width, height: dpRect.height, right: dpRect.right, bottom: dpRect.bottom } : null,
          dpSide: dpWidget ? dpWidget.getAttribute('data-side') : null,
          dpEdge: dpWidget ? dpWidget.getAttribute('data-edge') : null,
          dpIsOpen: dpWidget ? dpWidget.classList.contains('is-open') : false
        };
      })()
    `);

    console.log('Test 1 (Space on Top) measurements:', test1Result);

    const apLeft1 = test1Result.apRect.left;
    const dpRect1 = test1Result.dpRect;
    const expectedLeft1 = apLeft1 - 105.3871;
    const expectedRight1 = apLeft1 + 179.3865;
    const diffLeft1 = Math.abs(dpRect1.left - expectedLeft1);
    const diffRight1 = Math.abs(dpRect1.right - expectedRight1);
    const diffBottom1 = Math.abs(dpRect1.bottom - test1Result.apRect.top);

    console.log(`Expected Left: ${expectedLeft1.toFixed(2)}, Actual Left: ${dpRect1.left.toFixed(2)}, Diff: ${diffLeft1.toFixed(3)}px`);
    console.log(`Expected Right: ${expectedRight1.toFixed(2)}, Actual Right: ${dpRect1.right.toFixed(2)}, Diff: ${diffRight1.toFixed(3)}px`);
    console.log(`Expected Bottom (flush with AP top ${test1Result.apRect.top.toFixed(2)}): ${test1Result.apRect.top.toFixed(2)}, Actual Bottom: ${dpRect1.bottom.toFixed(2)}, Diff: ${diffBottom1.toFixed(3)}px`);
    console.log(`Side: ${test1Result.dpSide} (Expected: top)`);

    if (diffLeft1 > 1.5 || diffRight1 > 1.5 || diffBottom1 > 1.5 || test1Result.dpSide !== 'top') {
      console.error('FAIL: Test 1 alignment exceeds 1.5px tolerance');
    } else {
      console.log('PASS: Test 1 right edge space on top is mathematically aligned!');
    }

    await sleep(400); // Allow render
    await cdp.screenshot(path.join(SCREENSHOT_DIR, '25_domain_panel_right_edge_space_on_top.png'));

    // TEST 2: Right Edge with Space on Bottom
    console.log('\n--- TEST 2: Right Edge with Space on Bottom ---');
    const test2Result = await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        const widget = mgr.addPersonComponent.widget;

        // Position Add Person at y = 20 (space on top is only 20px, space on bottom is > 500px)
        widget.style.top = '20px';

        // Re-open domain panel to calculate position
        mgr.addPersonComponent.openDomainPanel();

        const apRect = widget.getBoundingClientRect();
        const dpWidget = document.getElementById('domainPanelWidget');
        const dpRect = dpWidget ? dpWidget.getBoundingClientRect() : null;

        return {
          apRect: { left: apRect.left, top: apRect.top, width: apRect.width, height: apRect.height, bottom: apRect.bottom },
          dpRect: dpRect ? { left: dpRect.left, top: dpRect.top, width: dpRect.width, height: dpRect.height, right: dpRect.right, bottom: dpRect.bottom } : null,
          dpSide: dpWidget ? dpWidget.getAttribute('data-side') : null,
          dpEdge: dpWidget ? dpWidget.getAttribute('data-edge') : null,
          dpIsOpen: dpWidget ? dpWidget.classList.contains('is-open') : false
        };
      })()
    `);

    console.log('Test 2 (Space on Bottom) measurements:', test2Result);

    const apLeft2 = test2Result.apRect.left;
    const dpRect2 = test2Result.dpRect;
    const expectedLeft2 = apLeft2 - 105.3871;
    const expectedRight2 = apLeft2 + 179.3865;
    const diffLeft2 = Math.abs(dpRect2.left - expectedLeft2);
    const diffRight2 = Math.abs(dpRect2.right - expectedRight2);
    const diffTop2 = Math.abs(dpRect2.top - test2Result.apRect.bottom);

    console.log(`Expected Left: ${expectedLeft2.toFixed(2)}, Actual Left: ${dpRect2.left.toFixed(2)}, Diff: ${diffLeft2.toFixed(3)}px`);
    console.log(`Expected Right: ${expectedRight2.toFixed(2)}, Actual Right: ${dpRect2.right.toFixed(2)}, Diff: ${diffRight2.toFixed(3)}px`);
    console.log(`Expected Top (flush with AP bottom ${test2Result.apRect.bottom.toFixed(2)}): ${test2Result.apRect.bottom.toFixed(2)}, Actual Top: ${dpRect2.top.toFixed(2)}, Diff: ${diffTop2.toFixed(3)}px`);
    console.log(`Side: ${test2Result.dpSide} (Expected: bottom)`);

    if (diffLeft2 > 1.5 || diffRight2 > 1.5 || diffTop2 > 1.5 || test2Result.dpSide !== 'bottom') {
      console.error('FAIL: Test 2 alignment exceeds 1.5px tolerance');
    } else {
      console.log('PASS: Test 2 right edge space on bottom is mathematically aligned!');
    }

    await sleep(400); // Allow render
    await cdp.screenshot(path.join(SCREENSHOT_DIR, '26_domain_panel_right_edge_space_on_bottom.png'));

    // TEST 3: Select a domain chip and verify it passes to Add Person
    console.log('\n--- TEST 3: Select domain chip and verify form update ---');
    const test3Result = await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        const dpWidget = document.getElementById('domainPanelWidget');
        const copywriterChip = dpWidget.querySelector('[data-domain="copywriters"]');
        if (!copywriterChip) return { error: 'copywriters chip not found' };

        copywriterChip.click();

        const input = mgr.addPersonComponent.inputDomain;
        return {
          inputValue: input ? input.value : null,
          formDataDomain: mgr.addPersonComponent.formData.domain,
          dpIsOpen: mgr.addPersonComponent.domainPanel.isOpen
        };
      })()
    `);
    console.log('Test 3 (Domain Selection):', test3Result);
    if (test3Result.formDataDomain === 'copywriters' && !test3Result.dpIsOpen) {
      console.log('PASS: Domain selection passed to form and closed panel!');
    } else {
      console.error('FAIL: Domain selection failed');
    }

    cdp.close();
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    chromeProcess.kill();
  }
}

run();
