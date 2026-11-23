import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9237;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'checks');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
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

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('--- Launching Chrome for Left Edge Position & Domain Animations Verification ---');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=/tmp/chrome_verify_domain_anim_${Date.now()}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  let failures = 0;
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`PASS: ${msg}`);
    }
  };

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        connected = true;
        break;
      } catch (e) {}
    }
    if (!connected) throw new Error('Could not connect to Chrome debugging port');

    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      try {
        if (await cdp.evaluate('Boolean(window.__nopitacBoardButtons?.addPersonComponent)')) {
          ready = true;
          break;
        }
      } catch (e) {}
    }
    if (!ready) throw new Error('BoardButtonsManager not initialized');
    await sleep(350);

    // TEST 1: Left Edge — Space on Top (Position + Live Animation Capture)
    console.log('\n--- TEST 1: Left Edge Space on Top + Live Animation Check ---');
    await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        mgr.addPersonComponent.setEdge('left');
        const w = mgr.addPersonComponent.widget;
        w.style.top = '350px';
        w.style.left = '0px';
        mgr.addPersonComponent.open();
      })()
    `);
    await sleep(500); // Let Add Person finish expanding

    // Trigger domain panel open and sample animation at t=110ms, t=310ms, t=700ms
    await cdp.evaluate(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(110);
    const animEarly = await cdp.evaluate(`
      (() => {
        const border = document.querySelector('#domainPanelWidget .domain-outer-border');
        const s1 = document.querySelector('#domainPanelWidget .domain-stagger-1');
        const s6 = document.querySelector('#domainPanelWidget .domain-stagger-6');
        return {
          totalLen: border ? border.getTotalLength() : 0,
          dashOffset: border ? parseFloat(getComputedStyle(border).strokeDashoffset) : -1,
          s1Opacity: s1 ? parseFloat(getComputedStyle(s1).opacity) : -1,
          s6Opacity: s6 ? parseFloat(getComputedStyle(s6).opacity) : -1
        };
      })()
    `);
    console.log('Left edge animation @ ~110ms:', animEarly);
    assert(animEarly.dashOffset > 10 && animEarly.dashOffset < animEarly.totalLen, `Border drawing in progress at 110ms (offset=${animEarly.dashOffset.toFixed(1)} / ${animEarly.totalLen.toFixed(1)})`);
    assert(animEarly.s6Opacity === 0, `Done layer (stagger-6) not yet revealed at 110ms (opacity=${animEarly.s6Opacity})`);

    await sleep(200); // ~310ms
    const animMid = await cdp.evaluate(`
      (() => {
        const border = document.querySelector('#domainPanelWidget .domain-outer-border');
        const s1 = document.querySelector('#domainPanelWidget .domain-stagger-1');
        const s2 = document.querySelector('#domainPanelWidget .domain-stagger-2');
        const s6 = document.querySelector('#domainPanelWidget .domain-stagger-6');
        return {
          dashOffset: border ? parseFloat(getComputedStyle(border).strokeDashoffset) : -1,
          s1Opacity: s1 ? parseFloat(getComputedStyle(s1).opacity) : -1,
          s2Opacity: s2 ? parseFloat(getComputedStyle(s2).opacity) : -1,
          s6Opacity: s6 ? parseFloat(getComputedStyle(s6).opacity) : -1
        };
      })()
    `);
    console.log('Left edge animation @ ~310ms:', animMid);
    await cdp.screenshot(path.join(SCREENSHOT_DIR, '34_domain_anim_mid_frame.png'));
    assert(animMid.s1Opacity > 0.5 && animMid.s6Opacity === 0, `Staggered reveal active at 310ms (s1=${animMid.s1Opacity.toFixed(2)}, s6=${animMid.s6Opacity.toFixed(2)})`);

    await sleep(420); // ~730ms — fully settled
    const leftTopState = await cdp.evaluate(`
      (() => {
        const ap = document.getElementById('addPersonWidget').getBoundingClientRect();
        const dpEl = document.getElementById('domainPanelWidget');
        const dp = dpEl.getBoundingClientRect();
        const border = dpEl.querySelector('.domain-outer-border');
        const s6 = dpEl.querySelector('.domain-stagger-6');
        const list = dpEl.querySelector('#domainListScroll');
        const webChip = dpEl.querySelector('[data-domain*="web"]');
        const listRect = list.getBoundingClientRect();
        const chipRect = webChip ? webChip.getBoundingClientRect() : null;
        return {
          apLeft: ap.left,
          apTop: ap.top,
          dpLeft: dp.left,
          dpTop: dp.top,
          dpBottom: dp.bottom,
          dpSide: dpEl.getAttribute('data-side'),
          dashOffset: parseFloat(getComputedStyle(border).strokeDashoffset),
          s6Opacity: parseFloat(getComputedStyle(s6).opacity),
          webChipClippedPx: chipRect ? Math.max(0, chipRect.bottom - listRect.bottom) : -1
        };
      })()
    `);
    console.log('Left edge (Space on Top) settled:', leftTopState);

    // Expected left border stroke center = apLeft + 41.9777, widget left = apLeft + 41.23
    const expectedLeft = leftTopState.apLeft + 41.9777 - 0.75;
    assert(Math.abs(leftTopState.dpLeft - expectedLeft) < 0.5, `Left edge widget left matches SVG (+41.23px, got ${leftTopState.dpLeft.toFixed(2)}px)`);
    assert(Math.abs(leftTopState.dpBottom - (leftTopState.apTop + 0.75)) < 1.0, `Left edge space-on-top bottom flush with Add Person top (${leftTopState.dpBottom.toFixed(2)} vs ${(leftTopState.apTop + 0.75).toFixed(2)})`);
    assert(leftTopState.dpSide === 'top', `Left edge side is 'top'`);
    assert(leftTopState.dashOffset === 0 && leftTopState.s6Opacity === 1, `Animation settled cleanly (dashOffset=0, s6Opacity=1)`);
    assert(leftTopState.webChipClippedPx <= 1.0, `All 4 domain chips unclipped in scroll box (clipped=${leftTopState.webChipClippedPx.toFixed(2)}px)`);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, '32_domain_left_edge_space_on_top.png'));

    // TEST 2: Left Edge — Space on Bottom
    console.log('\n--- TEST 2: Left Edge Space on Bottom ---');
    await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        mgr.addPersonComponent.domainPanel.close();
        const w = mgr.addPersonComponent.widget;
        w.style.top = '40px';
      })()
    `);
    await sleep(360);
    await cdp.evaluate(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(720);

    const leftBottomState = await cdp.evaluate(`
      (() => {
        const ap = document.getElementById('addPersonWidget').getBoundingClientRect();
        const dpEl = document.getElementById('domainPanelWidget');
        const dp = dpEl.getBoundingClientRect();
        return {
          apLeft: ap.left,
          apBottom: ap.bottom,
          dpLeft: dp.left,
          dpTop: dp.top,
          dpSide: dpEl.getAttribute('data-side')
        };
      })()
    `);
    console.log('Left edge (Space on Bottom) settled:', leftBottomState);
    const expectedLeft2 = leftBottomState.apLeft + 41.9777 - 0.75;
    assert(Math.abs(leftBottomState.dpLeft - expectedLeft2) < 0.5, `Left edge (bottom) widget left matches SVG (+41.23px, got ${leftBottomState.dpLeft.toFixed(2)}px)`);
    assert(Math.abs(leftBottomState.dpTop - (leftBottomState.apBottom - 0.75)) < 1.0, `Left edge space-on-bottom top flush with Add Person bottom (${leftBottomState.dpTop.toFixed(2)} vs ${(leftBottomState.apBottom - 0.75).toFixed(2)})`);
    assert(leftBottomState.dpSide === 'bottom', `Left edge side is 'bottom'`);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, '33_domain_left_edge_space_on_bottom.png'));

    // TEST 3: Top Edge Animation Check
    console.log('\n--- TEST 3: Top Edge Animation Check ---');
    await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        mgr.addPersonComponent.setEdge('top');
        const w = mgr.addPersonComponent.widget;
        w.style.left = '495px';
        w.style.top = '0px';
        mgr.addPersonComponent.open();
      })()
    `);
    await sleep(500);
    await cdp.evaluate(`window.__nopitacBoardButtons.addPersonComponent.openDomainPanel();`);
    await sleep(110);
    const topEarly = await cdp.evaluate(`
      (() => {
        const border = document.querySelector('#domainPanelWidget .domain-outer-border');
        return {
          totalLen: border.getTotalLength(),
          dashOffset: parseFloat(getComputedStyle(border).strokeDashoffset)
        };
      })()
    `);
    console.log('Top edge animation @ ~110ms:', topEarly);
    assert(topEarly.dashOffset > 10 && topEarly.dashOffset < topEarly.totalLen, `Top edge outer border animating smoothly at 110ms`);
    await sleep(650);
    await cdp.screenshot(path.join(SCREENSHOT_DIR, '35_domain_top_edge_settled.png'));

    cdp.close();
    console.log(`\n=== Verification finished with ${failures} failure(s) ===`);
    process.exitCode = failures > 0 ? 1 : 0;
  } catch (err) {
    console.error('Error during verification:', err);
    process.exitCode = 1;
  } finally {
    chromeProcess.kill();
  }
}

run();

