import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9241;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'checks');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) =>
  new Promise((res, rej) =>
    http
      .get(u, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej)
  );

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.cbs = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && this.cbs.has(m.id)) {
          const p = this.cbs.get(m.id);
          this.cbs.delete(m.id);
          m.error ? p.rej(m.error) : p.res(m.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((res, rej) => {
      this.cbs.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }
  async shot(filename, clip = null) {
    const params = { format: 'png' };
    if (clip) params.clip = { ...clip, scale: 2 };
    const r = await this.send('Page.captureScreenshot', params);
    const out = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    console.log('Saved:', out);
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const proc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=/tmp/chrome_verify_16pt_${Date.now()}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  let failures = 0;
  const assert = (ok, msg) => {
    if (!ok) {
      console.error('FAIL:', msg);
      failures++;
    } else {
      console.log('PASS:', msg);
    }
  };

  try {
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      try {
        await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        break;
      } catch {}
    }
    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const cdp = new CDP(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });

    for (let i = 0; i < 40; i++) {
      await sleep(150);
      if (await cdp.ev('Boolean(window.__nopitacBoardButtons?.sortComponent)')) break;
    }
    await sleep(300);

    // 1. ADD PERSON TOP + DOMAIN PANEL
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.addPersonComponent.setEdge('top');
      m.addPersonComponent.widget.style.left = '420px';
      m.addPersonComponent.open();
    })()`);
    await sleep(500);
    await cdp.ev(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(680);
    const apTop = await cdp.ev(`(() => {
      const w = document.getElementById('addPersonWidget').getBoundingClientRect();
      const lbl = getComputedStyle(document.getElementById('labelFullName'));
      const done = getComputedStyle(document.getElementById('svgLabelDone'));
      const dp = document.getElementById('domainPanelWidget').getBoundingClientRect();
      return { w: w.width, h: w.height, fontSize: lbl.fontSize, fill: lbl.fill, doneFill: done.fill, dpOpen: dp.width > 100 };
    })()`);
    console.log('Add Person Top:', apTop);
    assert(Math.abs(apTop.w - 181.66) < 1 && Math.abs(apTop.h - 491.35) < 1, `Add Person Top dimensions 181.66x491.35 (${apTop.w.toFixed(2)}x${apTop.h.toFixed(2)})`);
    assert(apTop.fontSize === '16px', `Add Person label size is 16px (${apTop.fontSize})`);
    assert(apTop.dpOpen, `Domain panel attaches cleanly on Top edge`);
    await cdp.shot('38_add_person_top_16pt.png', { x: 240, y: 0, width: 540, height: 520 });

    // 2. ADD PERSON LEFT + DOMAIN PANEL
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.addPersonComponent.setEdge('left');
      m.addPersonComponent.widget.style.top = '340px';
      m.addPersonComponent.open();
    })()`);
    await sleep(500);
    await cdp.ev(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(680);
    const apLeft = await cdp.ev(`(() => {
      const w = document.getElementById('addPersonWidget').getBoundingClientRect();
      const dp = document.getElementById('domainPanelWidget').getBoundingClientRect();
      return { w: w.width, h: w.height, dpLeft: dp.left, dpBottom: dp.bottom, apTop: w.top };
    })()`);
    console.log('Add Person Left:', apLeft);
    assert(Math.abs(apLeft.w - 575.99) < 1 && Math.abs(apLeft.h - 157.25) < 1, `Add Person Left dimensions 575.99x157.25`);
    assert(Math.abs(apLeft.dpLeft - 41.23) < 1, `Left DomainPanel stays aligned at +41.23px (${apLeft.dpLeft.toFixed(2)})`);
    await cdp.shot('39_add_person_left_16pt.png', { x: 0, y: 140, width: 610, height: 380 });

    // 3. ADD PERSON RIGHT + DOMAIN PANEL
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.addPersonComponent.setEdge('right');
      m.addPersonComponent.widget.style.top = '340px';
      m.addPersonComponent.open();
    })()`);
    await sleep(500);
    await cdp.ev(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(680);
    const apRight = await cdp.ev(`(() => {
      const w = document.getElementById('addPersonWidget').getBoundingClientRect();
      const dp = document.getElementById('domainPanelWidget').getBoundingClientRect();
      return { w: w.width, h: w.height, apLeft: w.left, dpLeft: dp.left };
    })()`);
    console.log('Add Person Right:', apRight);
    assert(Math.abs(apRight.w - 579.87) < 1 && Math.abs(apRight.h - 157.25) < 1, `Add Person Right dimensions 579.87x157.25`);
    assert(Math.abs(apRight.dpLeft - (apRight.apLeft - 105.3871)) < 1, `Right DomainPanel stays aligned at apLeft - 105.39px`);
    await cdp.shot('40_add_person_right_16pt.png', { x: 730, y: 140, width: 710, height: 380 });
    await cdp.ev(`window.__nopitacBoardButtons.addPersonComponent.close(true);`);

    // 4. SORT TOP EDGE
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.sortComponent.setEdge('top');
      m.sortComponent.widget.style.left = '260px';
      m.sortComponent.open();
    })()`);
    await sleep(520);
    const sortTop = await cdp.ev(`(() => {
      const w = document.getElementById('sortWidget').getBoundingClientRect();
      const lbl = getComputedStyle(document.querySelector('#sortWidget .sort-option-label'));
      const chips = document.querySelectorAll('#sortWidget .sort-domain-chip svg').length;
      // Test selecting 'name' and 'artists'
      document.querySelector('#sortWidget [data-option="name"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.querySelector('#sortWidget [data-option="artists"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const selName = document.querySelector('#sortWidget [data-option="name"]').classList.contains('is-selected');
      const selArt = document.querySelector('#sortWidget [data-option="artists"]').classList.contains('is-selected');
      return { w: w.width, h: w.height, fontSize: lbl.fontSize, chips, selName, selArt };
    })()`);
    console.log('Sort Top:', sortTop);
    assert(Math.abs(sortTop.w - 134.10) < 1 && Math.abs(sortTop.h - 293.41) < 1, `Sort Top dimensions 134.10x293.41 (${sortTop.w.toFixed(2)}x${sortTop.h.toFixed(2)})`);
    assert(sortTop.fontSize === '16px', `Sort option label is 16px (${sortTop.fontSize})`);
    assert(sortTop.chips === 4 && sortTop.selName && sortTop.selArt, `Sort Top renders 4 DomainType chips & selection toggles work`);
    await cdp.shot('41_sort_top_16pt.png', { x: 240, y: 0, width: 200, height: 320 });

    // 5. SORT LEFT EDGE (check zero bottom bounce!)
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.sortComponent.setEdge('left');
      m.sortComponent.widget.style.bottom = '300px';
    })()`);
    await sleep(80);
    const leftBottomBefore = await cdp.ev(`document.getElementById('sortWidget').getBoundingClientRect().bottom`);
    await cdp.ev(`window.__nopitacBoardButtons.sortComponent.open();`);
    await sleep(520);
    const sortLeft = await cdp.ev(`(() => {
      const r = document.getElementById('sortWidget').getBoundingClientRect();
      const chips = document.querySelectorAll('#sortWidget .sort-domain-chip svg').length;
      return { w: r.width, h: r.height, bottom: r.bottom, chips };
    })()`);
    console.log('Sort Left:', sortLeft, 'bottomBefore:', leftBottomBefore);
    assert(Math.abs(sortLeft.w - 355.98) < 1 && Math.abs(sortLeft.h - 114.40) < 1, `Sort Left dimensions 355.98x114.40`);
    assert(Math.abs(sortLeft.bottom - leftBottomBefore) < 0.2, `Sort Left bottom anchored with ZERO bounce (${sortLeft.bottom} vs ${leftBottomBefore})`);
    assert(sortLeft.chips === 4, `Sort Left renders 4 DomainType chips in 2-col grid`);
    await cdp.shot('42_sort_left_16pt.png', { x: 0, y: 460, width: 400, height: 160 });

    // 6. SORT RIGHT EDGE
    await cdp.ev(`(() => {
      const m = window.__nopitacBoardButtons;
      m.sortComponent.setEdge('right');
      m.sortComponent.widget.style.top = '340px';
      m.sortComponent.open();
    })()`);
    await sleep(520);
    const sortRight = await cdp.ev(`(() => {
      const r = document.getElementById('sortWidget').getBoundingClientRect();
      const chips = document.querySelectorAll('#sortWidget .sort-domain-chip svg').length;
      return { w: r.width, h: r.height, chips };
    })()`);
    console.log('Sort Right:', sortRight);
    assert(Math.abs(sortRight.w - 355.98) < 1 && Math.abs(sortRight.h - 114.40) < 1, `Sort Right dimensions 355.98x114.40`);
    assert(sortRight.chips === 4, `Sort Right renders 4 DomainType chips in 2-col grid`);
    await cdp.shot('43_sort_right_16pt.png', { x: 1050, y: 320, width: 390, height: 160 });

    cdp.close();
    console.log(`\n=== 16pt Buttons Verification finished with ${failures} failure(s) ===`);
    process.exitCode = failures > 0 ? 1 : 0;
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    proc.kill();
  }
}

run();

