import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9235;
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
  console.log('--- Launching Chrome for Center Circle, Colors, Dots, Scroll & Motion Verification ---');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=/tmp/chrome_verify_${Date.now()}`,
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
        if (await cdp.evaluate('Boolean(window.__nopitacBoardButtons?.concentricCircles)')) {
          ready = true;
          break;
        }
      } catch (e) {}
    }
    if (!ready) throw new Error('BoardButtonsManager not initialized');
    await sleep(450); // Allow initial background transition

    // TEST 1: Initial State — 315x315 White Circle, Invisible Square, 16px Body, Green Background, 2 Square Dots
    console.log('\n--- TEST 1: Center Circle Geometry, Colors, Dots, Kerning ---');
    const t1 = await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        const cc = mgr.concentricCircles;
        const panel = document.getElementById('boardCenterInfoPanel');
        const square = document.getElementById('centerInfoSquare');
        const header = document.getElementById('centerInfoHeader');
        const scroll = document.getElementById('centerInfoScroll');
        const body = document.getElementById('centerInfoBody');
        const viewport = document.getElementById('boardViewport');
        const apWidget = document.getElementById('addPersonWidget');

        const panelRect = panel.getBoundingClientRect();
        const squareRect = square.getBoundingClientRect();
        const panelStyle = getComputedStyle(panel);
        const squareStyle = getComputedStyle(square);
        const bodyStyle = getComputedStyle(body);
        const vpStyle = getComputedStyle(viewport);
        const apStyle = getComputedStyle(apWidget);

        const dots = document.querySelectorAll('.selected-person-dots rect');
        const selectedGroup = document.querySelector('.concentric-name-group.is-selected');
        const nameSvg = header.querySelector('svg');

        return {
          panelW: panelRect.width,
          panelH: panelRect.height,
          panelBg: panelStyle.backgroundColor,
          panelBorderRadius: panelStyle.borderRadius,
          squareW: squareRect.width,
          squareH: squareRect.height,
          squareBorderWidth: squareStyle.borderTopWidth,
          squareOverflow: squareStyle.overflow,
          bodyFontSize: bodyStyle.fontSize,
          vpBg: vpStyle.backgroundColor,
          apBgContracted: apStyle.backgroundColor,
          dotsCount: dots.length,
          selectedPersonId: selectedGroup?.getAttribute('data-person-id'),
          hasNameSvg: Boolean(nameSvg),
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
          tracking: cc.tracking,
          speedMultiplier: cc.speedMultiplier,
          peopleCount: cc.people.size
        };
      })()
    `);
    console.log('Test 1 result:', t1);

    assert(Math.abs(t1.panelW - 315) < 0.5 && Math.abs(t1.panelH - 315) < 0.5, `Center circle is 315x315px (${t1.panelW}x${t1.panelH})`);
    assert(t1.panelBg === 'rgb(255, 255, 255)', `Center circle is white (${t1.panelBg})`);
    assert(t1.squareBorderWidth === '0px' && t1.squareOverflow === 'hidden', `Inscribed square is invisible clipping mask`);
    assert(t1.bodyFontSize === '16px', `Main body type size is 16px (${t1.bodyFontSize})`);
    assert(t1.vpBg === 'rgb(39, 255, 131)', `Board background is artists domain color #27ff83 (${t1.vpBg})`);
    assert(t1.apBgContracted === 'rgba(0, 0, 0, 0)', `Contracted edge button background is transparent (${t1.apBgContracted})`);
    assert(t1.dotsCount === 2, `Two square dots rendered under selected person (${t1.dotsCount})`);
    assert(t1.selectedPersonId === 'paula scher', `Paula Scher selected initially (${t1.selectedPersonId})`);
    assert(t1.hasNameSvg, `Fixed name header rendered as Nopitac SVG`);
    assert(t1.scrollHeight > t1.clientHeight, `Description overflows invisible square and is scrollable (${t1.scrollHeight} > ${t1.clientHeight})`);
    assert(t1.tracking === -3, `Kerning is -3 (${t1.tracking})`);
    assert(t1.speedMultiplier === 0.2, `Speed multiplier is 0.2x (${t1.speedMultiplier})`);
    assert(t1.peopleCount === 20, `All 20 names have person metadata + domains + lorem ipsum (${t1.peopleCount})`);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, '27_board_center_circle_initial.png'));

    // TEST 2: Scroll inside the invisible square — name stays fixed, edge buttons don't move
    console.log('\n--- TEST 2: Scroll Clipping & Fixed Name Header ---');
    const t2 = await cdp.evaluate(`
      (() => {
        const mgr = window.__nopitacBoardButtons;
        const header = document.getElementById('centerInfoHeader');
        const scroll = document.getElementById('centerInfoScroll');
        const headerTopBefore = header.getBoundingClientRect().top;
        const btnOffsetBefore = mgr.targetScrollOffset;

        // Dispatch wheel event inside scroll area (should NOT scroll edge buttons)
        const wheelEvt = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
        scroll.dispatchEvent(wheelEvt);
        scroll.scrollTop = 100;

        const headerTopAfter = header.getBoundingClientRect().top;
        const btnOffsetAfter = mgr.targetScrollOffset;

        return {
          headerTopBefore,
          headerTopAfter,
          scrollTopAfter: scroll.scrollTop,
          btnOffsetBefore,
          btnOffsetAfter
        };
      })()
    `);
    console.log('Test 2 result:', t2);
    assert(t2.scrollTopAfter >= 80, `Text scrolled cleanly inside square (scrollTop=${t2.scrollTopAfter})`);
    assert(Math.abs(t2.headerTopAfter - t2.headerTopBefore) < 0.1, `Name on top remained fixed after scrolling`);
    assert(t2.btnOffsetAfter === t2.btnOffsetBefore, `Wheel inside circle did not move edge buttons`);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, '28_board_center_circle_scrolled.png'));

    // TEST 3: Animation 1 (flow) + Animation 2 (center rotation) at 0.2x speed
    console.log('\n--- TEST 3: Animation 1 + Animation 2 at 0.2x Speed ---');
    const anim0 = await cdp.evaluate(`
      (() => {
        const cc = window.__nopitacBoardButtons.concentricCircles;
        return {
          animOffset: cc.animOffset,
          rotationAngle: cc.rotationAngle,
          masterTransform: document.getElementById('boardConcentricRingsGroup')?.getAttribute('transform'),
          ring0Transform: document.getElementById('concentricRing_0')?.getAttribute('transform'),
          ring2Transform: document.getElementById('concentricRing_2')?.getAttribute('transform')
        };
      })()
    `);
    await sleep(750);
    const anim1 = await cdp.evaluate(`
      (() => {
        const cc = window.__nopitacBoardButtons.concentricCircles;
        return {
          animOffset: cc.animOffset,
          rotationAngle: cc.rotationAngle,
          masterTransform: document.getElementById('boardConcentricRingsGroup')?.getAttribute('transform'),
          ring0Transform: document.getElementById('concentricRing_0')?.getAttribute('transform'),
          ring2Transform: document.getElementById('concentricRing_2')?.getAttribute('transform')
        };
      })()
    `);
    console.log('Anim t0:', anim0);
    console.log('Anim t1:', anim1);

    const dOffset = anim1.animOffset - anim0.animOffset;
    const dRot = ((anim1.rotationAngle - anim0.rotationAngle) + 360) % 360;
    assert(dOffset > 5 && dOffset < 25, `Animation 1 (circular flow) moving at ~0.2x speed (dOffset=${dOffset.toFixed(2)} in 0.75s)`);
    assert(dRot > 1.2 && dRot < 6.0, `Animation 2 (center rotation) moving at ~0.2x speed (dRot=${dRot.toFixed(2)} deg in 0.75s)`);
    assert(anim0.ring0Transform !== anim1.ring0Transform, `Ring 0 SVG transform actively updating`);

    // TEST 4: Clicking different names switches domain background color & moves 2 square dots
    console.log('\n--- TEST 4: Selecting People Across All 4 Domains ---');
    const selections = [
      { id: 'david carson', expectedBg: 'rgb(216, 255, 42)', file: '29_board_selected_copywriters.png' },
      { id: 'stefan sagmeister', expectedBg: 'rgb(245, 0, 58)', file: '30_board_selected_music_composers.png' },
      { id: 'jessica walsh', expectedBg: 'rgb(106, 118, 255)', file: '31_board_selected_web_designer.png' }
    ];

    for (const sel of selections) {
      await cdp.evaluate(`
        (() => {
          const g = document.querySelector('.concentric-name-group[data-person-id="${sel.id}"]');
          if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        })()
      `);
      await sleep(450); // Allow background-color transition to complete

      const state = await cdp.evaluate(`
        (() => {
          const vp = document.getElementById('boardViewport');
          const panel = document.getElementById('boardCenterInfoPanel');
          const selectedGroup = document.querySelector('.concentric-name-group.is-selected');
          const dots = selectedGroup ? selectedGroup.querySelectorAll('.selected-person-dots rect').length : 0;
          return {
            vpBg: getComputedStyle(vp).backgroundColor,
            panelBg: getComputedStyle(panel).backgroundColor,
            selectedId: selectedGroup?.getAttribute('data-person-id'),
            dots,
            place: document.getElementById('centerInfoPlace')?.textContent,
            year: document.getElementById('centerInfoYear')?.textContent,
            bodyLen: document.getElementById('centerInfoBody')?.textContent?.length || 0
          };
        })()
      `);
      console.log(`Selected ${sel.id}:`, state);
      assert(state.selectedId === sel.id, `Clicked name selected: ${sel.id}`);
      assert(state.dots === 2, `Two square dots moved to ${sel.id}`);
      assert(state.vpBg === sel.expectedBg, `Board background switched to ${sel.expectedBg} (got ${state.vpBg})`);
      assert(state.panelBg === 'rgb(255, 255, 255)', `Center circle stayed white`);
      assert(state.bodyLen > 100, `Lorem ipsum description populated (${state.bodyLen} chars)`);

      await cdp.screenshot(path.join(SCREENSHOT_DIR, sel.file));
    }

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
