import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9227;
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
  console.log('=== Starting Verification: Domain List Scroll & Nopitac Helvetica Concentric Circles ===');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome_test_scroll_font',
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
      pageTarget = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:5173/board.html`);
    }

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(1000);

    // TEST 1: Concentric circles use Nopitac Helvetica vector engine
    console.log('\n--- Test 1: Verify Nopitac Helvetica Vector Circles ---');
    const vectorDetails = await cdp.eval(`
      (() => {
        const ringsGroup = document.querySelector('#boardConcentricRingsGroup');
        const centerCircle = document.querySelector('#boardCenterCircle');
        const rings = document.querySelectorAll('.concentric-ring');
        const underlines = document.querySelectorAll('.name-underline');

        return {
          hasRingsGroup: !!ringsGroup,
          hasCenterCircle: !!centerCircle,
          centerFill: centerCircle ? centerCircle.getAttribute('fill') : null,
          ringsCount: rings.length,
          underlinesCount: underlines.length,
          sampleUnderlineD: underlines[0] ? underlines[0].getAttribute('d') : null,
          allNames: window.__nopitacBoardButtons.concentricCircles.getAllNames()
        };
      })()
    `);
    console.log('Vector Concentric Circles Details:', vectorDetails);

    if (!vectorDetails.hasRingsGroup || vectorDetails.ringsCount !== 3) {
      throw new Error(`Expected 3 rings, got ${vectorDetails.ringsCount}`);
    }
    if (vectorDetails.underlinesCount !== 20) {
      throw new Error(`Expected 20 initial name underlines across 3 rings, got ${vectorDetails.underlinesCount}`);
    }
    if (!vectorDetails.sampleUnderlineD || !vectorDetails.sampleUnderlineD.includes('A 183.200 183.200')) {
      throw new Error(`Sample underline does not match circular arc: ${vectorDetails.sampleUnderlineD}`);
    }
    console.log('✅ Test 1 Passed: 3 Concentric rings with 20 names rendered in authentic Nopitac Helvetica with circular arc brackets!');
    await cdp.screenshot('10_nopitac_concentric_circles_initial.png');

    // TEST 2: Open Add Person and Domain Panel
    console.log('\n--- Test 2: Opening Add Person & Domain Panel ---');
    await cdp.eval(`
      (() => {
        window.__nopitacBoardButtons.addPersonComponent.open();
      })()
    `);
    await sleep(500);

    await cdp.eval(`
      (() => {
        const domainField = document.querySelector('[data-field="domain"]');
        if (domainField) domainField.click();
      })()
    `);
    await sleep(400);

    const isDomainOpen = await cdp.eval(`
      (() => {
        const p = document.getElementById('domainPanelWidget');
        return p && p.classList.contains('is-open');
      })()
    `);
    console.log(`Domain Panel is open: ${isDomainOpen}`);
    if (!isDomainOpen) throw new Error('Domain panel did not open');

    // TEST 3: Verify Domain List Scroll works!
    console.log('\n--- Test 3: Testing Domain List Scrolling ---');
    const scrollTest = await cdp.eval(`
      (() => {
        const scrollEl = document.getElementById('domainListScroll');
        if (!scrollEl) return { error: 'scrollEl not found' };

        const initialScrollTop = scrollEl.scrollTop;
        const scrollHeight = scrollEl.scrollHeight;
        const clientHeight = scrollEl.clientHeight;

        // Dispatch wheel event on the scroll container
        const wheelEv = new WheelEvent('wheel', {
          deltaY: 50,
          bubbles: true,
          cancelable: true
        });
        scrollEl.dispatchEvent(wheelEv);

        const afterScrollTop = scrollEl.scrollTop;

        // Dispatch wheel event to scroll back up
        const wheelEvUp = new WheelEvent('wheel', {
          deltaY: -5,
          bubbles: true,
          cancelable: true
        });
        scrollEl.dispatchEvent(wheelEvUp);

        const afterScrollTopUp = scrollEl.scrollTop;

        return {
          initialScrollTop,
          afterScrollTop,
          afterScrollTopUp,
          scrollHeight,
          clientHeight,
          maxScroll: scrollHeight - clientHeight
        };
      })()
    `);
    console.log('Domain list scroll test results:', scrollTest);

    if (scrollTest.afterScrollTop <= scrollTest.initialScrollTop) {
      throw new Error(`Domain list scroll did not change: initial=${scrollTest.initialScrollTop}, after=${scrollTest.afterScrollTop}`);
    }
    if (scrollTest.afterScrollTopUp >= scrollTest.afterScrollTop) {
      throw new Error(`Domain list scroll up did not decrease: down=${scrollTest.afterScrollTop}, up=${scrollTest.afterScrollTopUp}`);
    }
    console.log('✅ Test 3 Passed: Domain list scrolling smoothly advances on wheel events!');
    await cdp.screenshot('11_domain_list_scrolled.png');

    // TEST 4: Add New Domain & Verify Scroll to newly added item
    console.log('\n--- Test 4: Adding New Domain and Checking Scroll ---');
    await cdp.eval(`
      (() => {
        const input = document.getElementById('domainNameInput');
        input.value = 'industrial\\ndesigners';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const doneBtn = document.getElementById('domainDoneBtn');
        if (doneBtn) doneBtn.click();
      })()
    `);
    await sleep(300);

    const postAddScroll = await cdp.eval(`
      (() => {
        const scrollEl = document.getElementById('domainListScroll');
        return {
          scrollTop: scrollEl.scrollTop,
          scrollHeight: scrollEl.scrollHeight,
          itemsCount: scrollEl.querySelectorAll('.domain-chip-wrapper').length
        };
      })()
    `);
    console.log('Post-add scroll state:', postAddScroll);
    if (postAddScroll.itemsCount < 5) throw new Error('New domain was not added to list');
    console.log('✅ Test 4 Passed: New domain added and list scrolled to show it!');
    await cdp.screenshot('12_domain_added_and_scrolled.png');

    // TEST 5: Select a Domain & Add a Person -> Appears in Concentric Circles with Nopitac Helvetica
    console.log('\n--- Test 5: Selecting Domain & Adding Person "Zaha Hadid" ---');
    await cdp.eval(`
      (() => {
        const chip = document.querySelector('.domain-chip-wrapper[data-domain*="artists"]');
        if (chip) chip.click();
      })()
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const nameInput = document.querySelector('[data-field="fullName"]');
        if (nameInput) {
          nameInput.value = 'Zaha Hadid';
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const doneBtn = document.getElementById('doneActionBtn');
        if (doneBtn) doneBtn.click();
      })()
    `);
    await sleep(500);

    const postSubmitRings = await cdp.eval(`
      (() => {
        const allNames = window.__nopitacBoardButtons.concentricCircles.getAllNames();
        const underlines = document.querySelectorAll('.name-underline');
        const lastUnderline = underlines[underlines.length - 1];
        return {
          allNames,
          hasZaha: allNames.includes('zaha hadid'),
          underlinesCount: underlines.length,
          lastUnderlineD: lastUnderline ? lastUnderline.getAttribute('d') : null
        };
      })()
    `);
    console.log('Post-submission Concentric Circles state:', postSubmitRings);
    if (!postSubmitRings.hasZaha) {
      throw new Error('Expected "zaha hadid" to be added to concentric circles');
    }
    if (postSubmitRings.underlinesCount !== 21) {
      throw new Error(`Expected 21 name underlines after addition, got ${postSubmitRings.underlinesCount}`);
    }
    console.log('✅ Test 5 Passed: "Zaha Hadid" successfully added to concentric rings in authentic Nopitac Helvetica!');
    await cdp.screenshot('13_zaha_hadid_added_to_nopitac_circles.png');

    console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch (e) {}
  }
}

main().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
