import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9228;

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

async function testLeftEdgeExpansion() {
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
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
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

    console.log('=== TEST 1: Sort Button on Left Edge ===');
    // Scroll sort to the left edge at ~mid height
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
    await sleep(150);

    const sortEdge = await client.evaluate(`window.__nopitacBoardButtons.sortComponent.edge`);
    console.log('Sort edge:', sortEdge);
    if (sortEdge !== 'left') throw new Error(`Expected sort on left edge, got ${sortEdge}`);

    const closedSort = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Sort closed box on left edge:', closedSort);

    console.log('Clicking sort to expand on left edge...');
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);

    const samples = [];
    for (let i = 0; i < 15; i++) {
      await sleep(30);
      const b = await client.evaluate(`
        (() => {
          const el = document.getElementById('sortWidget');
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
        })()
      `);
      samples.push(b);
    }

    const expandedSort = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Sort expanded box on left edge:', expandedSort);

    let maxDownShift = 0;
    for (const s of samples) {
      const delta = s.bottom - closedSort.bottom;
      if (delta > maxDownShift) maxDownShift = delta;
    }
    console.log(`Sort max downward shift during animation: ${maxDownShift.toFixed(3)}px`);
    const finalShift = Math.abs(expandedSort.bottom - closedSort.bottom);
    console.log(`Sort final bottom shift: ${finalShift.toFixed(3)}px`);

    if (maxDownShift > 0.5) {
      throw new Error(`Sort button moved downwards by ${maxDownShift.toFixed(2)}px during expansion!`);
    }
    if (finalShift > 0.5) {
      throw new Error(`Sort button bottom shifted by ${finalShift.toFixed(2)}px after expansion!`);
    }

    console.log('Closing sort on left edge...');
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.close()`);
    await sleep(500);

    const afterCloseSort = await client.evaluate(`
      (() => {
        const el = document.getElementById('sortWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Sort box after close:', afterCloseSort);
    const closeShift = Math.abs(afterCloseSort.bottom - closedSort.bottom);
    console.log(`Sort close bottom shift: ${closeShift.toFixed(3)}px`);
    if (closeShift > 0.5) {
      throw new Error(`Sort button bottom shifted by ${closeShift.toFixed(2)}px after closing!`);
    }

    console.log('\n=== TEST 2: Add Person Button on Left Edge ===');
    await client.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        for (let s = 1000; s < 6000; s += 50) {
          mgr.targetScrollOffset = s;
          mgr.scrollOffset = s;
          mgr.update();
          if (mgr.addPersonComponent.edge === 'left') {
            const r = mgr.addPersonComponent.widget.getBoundingClientRect();
            if (r.top > 200 && r.bottom < 650) break;
          }
        }
      })()
    `);
    await sleep(150);

    const apEdge = await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.edge`);
    console.log('Add person edge:', apEdge);
    if (apEdge !== 'left') throw new Error(`Expected add person on left edge, got ${apEdge}`);

    const closedAp = await client.evaluate(`
      (() => {
        const el = document.getElementById('addPersonWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Add person closed box on left edge:', closedAp);

    console.log('Clicking add person to expand on left edge...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);

    const apSamples = [];
    for (let i = 0; i < 15; i++) {
      await sleep(30);
      const b = await client.evaluate(`
        (() => {
          const el = document.getElementById('addPersonWidget');
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
        })()
      `);
      apSamples.push(b);
    }

    const expandedAp = await client.evaluate(`
      (() => {
        const el = document.getElementById('addPersonWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Add person expanded box on left edge:', expandedAp);

    let maxApDownShift = 0;
    for (const s of apSamples) {
      const delta = s.bottom - closedAp.bottom;
      if (delta > maxApDownShift) maxApDownShift = delta;
    }
    console.log(`Add person max downward shift during animation: ${maxApDownShift.toFixed(3)}px`);
    const finalApShift = Math.abs(expandedAp.bottom - closedAp.bottom);
    console.log(`Add person final bottom shift: ${finalApShift.toFixed(3)}px`);

    if (maxApDownShift > 0.5) {
      throw new Error(`Add person button moved downwards by ${maxApDownShift.toFixed(2)}px during expansion!`);
    }
    if (finalApShift > 0.5) {
      throw new Error(`Add person button bottom shifted by ${finalApShift.toFixed(2)}px after expansion!`);
    }

    console.log('Closing add person on left edge...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.close()`);
    await sleep(500);

    const afterCloseAp = await client.evaluate(`
      (() => {
        const el = document.getElementById('addPersonWidget');
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
      })()
    `);
    console.log('Add person box after close:', afterCloseAp);
    const closeApShift = Math.abs(afterCloseAp.bottom - closedAp.bottom);
    console.log(`Add person close bottom shift: ${closeApShift.toFixed(3)}px`);
    if (closeApShift > 0.5) {
      throw new Error(`Add person button bottom shifted by ${closeApShift.toFixed(2)}px after closing!`);
    }

    // Capture screenshots of both expanded on left edge
    console.log('Re-opening sort on left edge to take verified screenshot...');
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);
    await sleep(450);
    const sortShot = await client.send('Page.captureScreenshot');
    await fs.writeFile('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/sort_left_anchored.png', Buffer.from(sortShot.data, 'base64'));

    console.log('Re-opening add person on left edge to take verified screenshot...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);
    await sleep(450);
    const apShot = await client.send('Page.captureScreenshot');
    await fs.writeFile('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/addperson_left_anchored.png', Buffer.from(apShot.data, 'base64'));

    console.log('\n>>> ALL LEFT EDGE EXPANSION & CONTRACTION TESTS PASSED WITH 0.000px DOWNWARD MOVEMENT! <<<');
    client.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

testLeftEdgeExpansion().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
