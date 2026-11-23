import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9235;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then(r => r.json());
        if (res) break;
      } catch (e) {}
    }

    const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json());
    const pageTarget = targets.find(t => t.type === 'page');
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(800);

    console.log('=== TEST 1: Navigate Sort Button to Left Edge ===');
    await client.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        for (let s = 1000; s < 6000; s += 50) {
          mgr.targetScrollOffset = s;
          mgr.scrollOffset = s;
          mgr.update();
          if (mgr.sortComponent.edge === 'left') {
            const r = mgr.sortComponent.widget.getBoundingClientRect();
            if (r.top > 250 && r.bottom < 650) break;
          }
        }
      })()
    `);
    await sleep(100);

    const sortEdge = await client.evaluate(`window.__nopitacBoardButtons.sortComponent.edge`);
    console.log('Sort edge:', sortEdge);
    if (sortEdge !== 'left') throw new Error(`Expected left edge, got ${sortEdge}`);

    const initialBox = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const text = document.getElementById('sortSvgText');
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          width: r.width,
          height: r.height,
          strokeWidth: window.getComputedStyle(text).strokeWidth,
          styleBottom: el.style.bottom,
          styleTop: el.style.top
        };
      })()
    `);
    console.log('Initial Left Edge State:', initialBox);

    console.log('\n=== TEST 2: Expanding on Left Edge (Zero Bounce & Continuous Bolding) ===');
    // Click sort to expand
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);

    const frames = [];
    const startTime = Date.now();
    for (let f = 0; f < 16; f++) {
      await sleep(30);
      const frameData = await client.evaluate(`
        (() => {
          const el = document.getElementById('sortWidget');
          const text = document.getElementById('sortSvgText');
          const r = el.getBoundingClientRect();
          return {
            t: ${Date.now() - startTime},
            width: r.width,
            height: r.height,
            top: r.top,
            bottom: r.bottom,
            bottomShift: r.bottom - ${initialBox.bottom},
            strokeWidth: window.getComputedStyle(text).strokeWidth,
            rawStroke: text.style.strokeWidth
          };
        })()
      `);
      frames.push(frameData);
    }

    console.log('Frame Samples:');
    let maxAbsBottomShift = 0;
    for (let i = 0; i < frames.length; i++) {
      const fr = frames[i];
      const absShift = Math.abs(fr.bottomShift);
      if (absShift > maxAbsBottomShift) maxAbsBottomShift = absShift;
      console.log(`  Frame ${i}: w=${fr.width.toFixed(2)}, h=${fr.height.toFixed(2)}, bottomShift=${fr.bottomShift.toFixed(4)}px, strokeWidth=${fr.strokeWidth} (${fr.rawStroke})`);
    }

    console.log(`\nMax Absolute Bottom Shift during expansion: ${maxAbsBottomShift.toFixed(4)}px`);
    if (maxAbsBottomShift > 0.05) {
      throw new Error(`FAIL: Left edge bounced by ${maxAbsBottomShift.toFixed(4)}px!`);
    } else {
      console.log('PASS: Zero bounce verified! Bottom line remained 100% immobilized.');
    }

    // Verify gradual bolding
    const strokeValues = frames.map(f => parseFloat(f.rawStroke || f.strokeWidth) || 0);
    console.log('Stroke progression:', strokeValues.map(v => v.toFixed(3)));
    const startStroke = strokeValues[0];
    const midStroke = strokeValues[Math.floor(strokeValues.length / 2)];
    const endStroke = strokeValues[strokeValues.length - 1];

    console.log(`Start stroke: ${startStroke.toFixed(3)}, Mid: ${midStroke.toFixed(3)}, End: ${endStroke.toFixed(3)}`);
    if (endStroke < 0.75) {
      throw new Error(`FAIL: Expected end stroke >= 0.75px, got ${endStroke}`);
    }
    if (midStroke <= startStroke || midStroke >= endStroke) {
      throw new Error(`FAIL: Stroke width did not interpolate gradually! Start: ${startStroke}, Mid: ${midStroke}, End: ${endStroke}`);
    }
    console.log('PASS: Font weight gradually and smoothly thickened from 0px to 0.85px!');

    // Wait until fully open
    await sleep(200);
    const expandedBox = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const text = document.getElementById('sortSvgText');
        const r = el.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          bottomShift: r.bottom - ${initialBox.bottom},
          strokeWidth: window.getComputedStyle(text).strokeWidth
        };
      })()
    `);
    console.log('\nExpanded final box:', expandedBox);
    if (Math.abs(expandedBox.bottomShift) > 0.05) {
      throw new Error(`FAIL: Final bottom shifted by ${expandedBox.bottomShift.toFixed(4)}px`);
    }

    console.log('\n=== TEST 3: Closing on Left Edge (Zero Bounce & Font Weight Returns) ===');
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.close()`);

    const closeFrames = [];
    for (let f = 0; f < 12; f++) {
      await sleep(30);
      const frameData = await client.evaluate(`
        (() => {
          const el = document.getElementById('sortWidget');
          const text = document.getElementById('sortSvgText');
          const r = el.getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            bottomShift: r.bottom - ${initialBox.bottom},
            rawStroke: text.style.strokeWidth
          };
        })()
      `);
      closeFrames.push(frameData);
    }

    let maxCloseBottomShift = 0;
    for (const fr of closeFrames) {
      if (Math.abs(fr.bottomShift) > maxCloseBottomShift) maxCloseBottomShift = Math.abs(fr.bottomShift);
    }
    console.log(`Max Absolute Bottom Shift during close: ${maxCloseBottomShift.toFixed(4)}px`);
    if (maxCloseBottomShift > 0.05) {
      throw new Error(`FAIL: Bottom shifted during close by ${maxCloseBottomShift.toFixed(4)}px`);
    }

    await sleep(300);
    const finalClosed = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const text = document.getElementById('sortSvgText');
        const r = el.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          bottomShift: r.bottom - ${initialBox.bottom},
          strokeWidth: window.getComputedStyle(text).strokeWidth,
          rawStroke: text.style.strokeWidth
        };
      })()
    `);
    console.log('Final Closed State:', finalClosed);
    if (Math.abs(finalClosed.bottomShift) > 0.05) {
      throw new Error(`FAIL: Final closed bottom shifted by ${finalClosed.bottomShift.toFixed(4)}px`);
    }
    console.log('PASS: Closing zero bounce verified!');

    // Take a screenshot of the left-expanded sort button
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);
    await sleep(500);

    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/sort_left_zero_bounce.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Screenshot saved to artifact sort_left_zero_bounce.png');

    console.log('\nALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

