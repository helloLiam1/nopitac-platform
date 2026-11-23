import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9228;
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
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

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

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error('Evaluation failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const p = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(p, buf);
    console.log(`[Screenshot saved]: ${p}`);
    return p;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('=== Starting Verification: 1px Inward Outline in Domain Type ===');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome_test_1px_outline',
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    let versionData = null;
    for (let i = 0; i < 50; i++) {
      try {
        versionData = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        break;
      } catch (e) {
        await sleep(100);
      }
    }
    if (!versionData) throw new Error('Chrome remote debugging did not respond');

    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    let pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      pageTarget = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:8188`);
    }

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    cdp.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('[Browser Console]:', ...msg.params.args.map(a => a.value));
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[Browser Exception]:', msg.params.exceptionDetails);
      }
    });

    await cdp.send('Page.navigate', { url: 'http://localhost:8188' });
    await sleep(1500);

    // 1. Verify 1px outline in Center Mode
    console.log('\n--- Test 1: Center Mode (copywriters) ---');
    const centerModeData = await cdp.eval(`
      (() => {
        const svg = document.querySelector('#renderContainer svg');
        const box = svg.querySelector('.domain-box');
        const outline = svg.querySelector('.domain-outline');
        const clip = svg.querySelector('clipPath');

        const boxRect = {
          x: parseFloat(box.getAttribute('x')),
          y: parseFloat(box.getAttribute('y')),
          w: parseFloat(box.getAttribute('width')),
          h: parseFloat(box.getAttribute('height'))
        };

        const strokeWidth = outline.style.strokeWidth;
        const d = outline.getAttribute('d');
        const clipPathAttr = outline.getAttribute('clip-path');

        return {
          strokeWidth,
          boxRect,
          d,
          hasClipPath: !!clip && !!clipPathAttr,
          clipId: clip ? clip.getAttribute('id') : null
        };
      })()
    `);
    console.log('Center Mode SVG Data:', centerModeData);

    if (centerModeData.strokeWidth !== '1px') {
      throw new Error(`Expected stroke-width: 1px, got ${centerModeData.strokeWidth}`);
    }
    if (!centerModeData.hasClipPath) {
      throw new Error('Expected clip-path to ensure outline is strictly inside colored box');
    }

    await cdp.screenshot('20_domain_tool_1px_center_mode.png');

    // 2. Test Left Mode
    console.log('\n--- Test 2: Left Mode (copywriters) ---');
    await cdp.eval(`
      (() => {
        const leftBtn = document.querySelector('[data-mode="left"]');
        if (leftBtn) leftBtn.click();
      })()
    `);
    await sleep(300);

    const leftModeData = await cdp.eval(`
      (() => {
        const svg = document.querySelector('#renderContainer svg');
        const outline = svg.querySelector('.domain-outline');
        return {
          strokeWidth: outline.style.strokeWidth,
          d: outline.getAttribute('d')
        };
      })()
    `);
    console.log('Left Mode SVG Data:', leftModeData);
    if (leftModeData.strokeWidth !== '1px') {
      throw new Error(`Expected stroke-width: 1px in left mode, got ${leftModeData.strokeWidth}`);
    }
    await cdp.screenshot('21_domain_tool_1px_left_mode.png');

    // 3. Test Right Mode
    console.log('\n--- Test 3: Right Mode (copywriters) ---');
    await cdp.eval(`
      (() => {
        const rightBtn = document.querySelector('[data-mode="right"]');
        if (rightBtn) rightBtn.click();
      })()
    `);
    await sleep(300);

    const rightModeData = await cdp.eval(`
      (() => {
        const svg = document.querySelector('#renderContainer svg');
        const outline = svg.querySelector('.domain-outline');
        return {
          strokeWidth: outline.style.strokeWidth,
          d: outline.getAttribute('d')
        };
      })()
    `);
    console.log('Right Mode SVG Data:', rightModeData);
    if (rightModeData.strokeWidth !== '1px') {
      throw new Error(`Expected stroke-width: 1px in right mode, got ${rightModeData.strokeWidth}`);
    }
    await cdp.screenshot('22_domain_tool_1px_right_mode.png');

    // 4. Test Multi-line "music composers" with Red BG
    console.log('\n--- Test 4: Multiline "music composers" (Red Preset) ---');
    await cdp.eval(`
      (() => {
        const chip = document.querySelector('.preset-chip[data-text*="music"][data-mode="center"]');
        if (chip) chip.click();
      })()
    `);
    await sleep(300);

    const musicData = await cdp.eval(`
      (() => {
        const svg = document.querySelector('#renderContainer svg');
        const outline = svg.querySelector('.domain-outline');
        const box = svg.querySelector('.domain-box');
        return {
          strokeWidth: outline.style.strokeWidth,
          fill: box.style.fill,
          d: outline.getAttribute('d')
        };
      })()
    `);
    console.log('Music Composers Data:', musicData);
    if (musicData.strokeWidth !== '1px') {
      throw new Error(`Expected stroke-width: 1px for multiline, got ${musicData.strokeWidth}`);
    }
    await cdp.screenshot('23_domain_tool_1px_music_composers.png');

    // 5. Test Board UI DomainPanel chips
    console.log('\n--- Test 5: Verify Board UI DomainPanel Chips ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(1000);

    await cdp.eval(`
      (() => {
        window.__nopitacBoardButtons.addPersonComponent.open();
      })()
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const domainField = document.querySelector('[data-field="domain"]');
        if (domainField) domainField.click();
      })()
    `);
    await sleep(400);

    const boardDomainChips = await cdp.eval(`
      (() => {
        const outlines = document.querySelectorAll('.domain-chip-wrapper .domain-outline');
        return Array.from(outlines).map(o => o.style.strokeWidth);
      })()
    `);
    console.log('Board UI Domain Chips outline stroke widths:', boardDomainChips);
    if (boardDomainChips.length === 0 || !boardDomainChips.every(w => w === '1px')) {
      throw new Error(`Expected all domain chips on board to have stroke-width: 1px, got: ${JSON.stringify(boardDomainChips)}`);
    }

    await cdp.screenshot('24_board_ui_domain_chips_1px.png');

    console.log('\n🎉 ALL 1PX OUTLINE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch (e) {}
  }
}

main().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
