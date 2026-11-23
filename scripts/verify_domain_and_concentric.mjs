import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9226;
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
  console.log('=== Starting Verification: Domain Selection Panel & Concentric Circles ===');

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome_domain_test',
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
    await sleep(800);

    // 1. Verify Concentric Circles on Board
    console.log('\n--- Test 1: Verifying Board Concentric Circles ---');
    const centerCircleInfo = await cdp.eval(`
      (() => {
        const circle = document.querySelector('#boardCenterCircle');
        if (!circle) return null;
        return {
          cx: circle.getAttribute('cx'),
          cy: circle.getAttribute('cy'),
          r: circle.getAttribute('r'),
          fill: circle.getAttribute('fill')
        };
      })()
    `);
    console.log('Center Circle info:', centerCircleInfo);
    if (!centerCircleInfo || centerCircleInfo.fill !== '#44edff') {
      throw new Error('Center circle is missing or has incorrect fill');
    }

    const ringsCount = await cdp.eval(`
      (() => {
        const rings = document.querySelectorAll('.concentric-ring-text');
        return rings.length;
      })()
    `);
    console.log(`Initial concentric rings count: ${ringsCount}`);
    if (ringsCount < 3) throw new Error('Expected at least 3 concentric rings');

    await cdp.screenshot('01_board_initial_state.png');

    // 2. Open Add Person on Top Edge
    console.log('\n--- Test 2: Expanding Add Person on Top Edge ---');
    await cdp.eval(`
      (() => {
        const manager = window.__nopitacBoardButtons;
        manager.addPersonComponent.open();
      })()
    `);
    await sleep(500);

    const isExpanded = await cdp.eval(`
      (() => {
        const w = document.getElementById('addPersonWidget');
        return w ? w.classList.contains('is-expanded') : false;
      })()
    `);
    console.log(`Add Person is-expanded: ${isExpanded}`);
    if (!isExpanded) throw new Error('Add Person did not expand');
    await cdp.screenshot('02_add_person_expanded_top.png');

    // 3. Click Domain Field to Open DomainPanel
    console.log('\n--- Test 3: Opening DomainPanel from Add Person ---');
    await cdp.eval(`
      (() => {
        const domainInput = document.querySelector('[data-field="domain"]');
        if (domainInput) domainInput.click();
      })()
    `);
    await sleep(400);

    const domainPanelState = await cdp.eval(`
      (() => {
        const p = document.getElementById('domainPanelWidget');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        const chips = Array.from(p.querySelectorAll('.domain-chip-wrapper')).map(c => c.getAttribute('data-domain'));
        return {
          isOpen: p.classList.contains('is-open'),
          edge: p.getAttribute('data-edge'),
          side: p.getAttribute('data-side'),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          chips: chips
        };
      })()
    `);
    console.log('DomainPanel state:', domainPanelState);
    if (!domainPanelState || !domainPanelState.isOpen) {
      throw new Error('DomainPanel did not open');
    }
    if (domainPanelState.chips.length < 4) {
      throw new Error(`Expected at least 4 default domain chips, got ${domainPanelState.chips.length}`);
    }
    await cdp.screenshot('03_domain_panel_open_top.png');

    // 4. Create New Domain ("designers") with Custom Color
    console.log('\n--- Test 4: Creating New Domain "designers" ---');
    await cdp.eval(`
      (() => {
        const input = document.getElementById('domainNameInput');
        input.value = 'designers';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Pick 5th color preset (orange)
        const dots = document.querySelectorAll('.domain-color-dot');
        if (dots[4]) dots[4].click();

        // Click Done button
        const doneBtn = document.getElementById('domainDoneBtn');
        if (doneBtn) doneBtn.click();
      })()
    `);
    await sleep(300);

    const updatedChips = await cdp.eval(`
      (() => {
        const p = document.getElementById('domainPanelWidget');
        return Array.from(p.querySelectorAll('.domain-chip-wrapper')).map(c => c.getAttribute('data-domain'));
      })()
    `);
    console.log('Updated domain chips after adding "designers":', updatedChips);
    if (!updatedChips.includes('designers')) {
      throw new Error('New domain "designers" was not added to the domains list');
    }
    await cdp.screenshot('04_domain_added_designers.png');

    // 5. Select a Domain ("web designer")
    console.log('\n--- Test 5: Selecting Domain "web\\ndesigner" ---');
    await cdp.eval(`
      (() => {
        const chip = document.querySelector('.domain-chip-wrapper[data-domain*="web"]');
        if (chip) chip.click();
      })()
    `);
    await sleep(400);

    const formDomainValue = await cdp.eval(`
      (() => {
        const input = document.querySelector('[data-field="domain"]');
        const p = document.getElementById('domainPanelWidget');
        return {
          inputValue: input ? input.value : '',
          isPanelClosed: p ? !p.classList.contains('is-open') : true
        };
      })()
    `);
    console.log('Form domain value & panel closed status:', formDomainValue);
    if (!formDomainValue.inputValue.includes('web designer')) {
      throw new Error(`Expected domain input to be "web designer", got "${formDomainValue.inputValue}"`);
    }
    if (!formDomainValue.isPanelClosed) {
      throw new Error('DomainPanel did not close after selecting a domain');
    }
    await cdp.screenshot('05_domain_selected_in_form.png');

    // 6. Submit Add Person with Full Name -> Appears in Concentric Circles
    console.log('\n--- Test 6: Submitting Person "Henry Cole" ---');
    await cdp.eval(`
      (() => {
        const nameInput = document.querySelector('[data-field="fullName"]');
        if (nameInput) {
          nameInput.value = 'Henry Cole';
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const doneBtn = document.getElementById('doneActionBtn');
        if (doneBtn) doneBtn.click();
      })()
    `);
    await sleep(500);

    const allNamesAfterSubmit = await cdp.eval(`
      (() => {
        const manager = window.__nopitacBoardButtons;
        return manager.concentricCircles.getAllNames();
      })()
    `);
    console.log('All names in concentric circles after submission:', allNamesAfterSubmit);
    if (!allNamesAfterSubmit.includes('henry cole')) {
      throw new Error('Expected "henry cole" to be present in concentric circles');
    }
    await cdp.screenshot('06_person_added_to_concentric_circles.png');

    // 7. Test Left Edge Extension Placement
    console.log('\n--- Test 7: Testing Domain Panel on Left Edge ---');
    await cdp.eval(`
      (() => {
        const manager = window.__nopitacBoardButtons;
        manager.addPersonComponent.setEdge('left');
        manager.addPersonComponent.widget.style.top = '200px';
        manager.addPersonComponent.open();
      })()
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const domainInput = document.querySelector('[data-field="domain"]');
        if (domainInput) domainInput.click();
      })()
    `);
    await sleep(400);

    const leftEdgePanelState = await cdp.eval(`
      (() => {
        const p = document.getElementById('domainPanelWidget');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        return {
          isOpen: p.classList.contains('is-open'),
          edge: p.getAttribute('data-edge'),
          side: p.getAttribute('data-side'),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      })()
    `);
    console.log('Left Edge DomainPanel state:', leftEdgePanelState);
    if (!leftEdgePanelState || leftEdgePanelState.edge !== 'left') {
      throw new Error('DomainPanel failed to adapt to Left Edge');
    }
    await cdp.screenshot('07_domain_panel_left_edge.png');

    // 8. Test Right Edge Extension Placement
    console.log('\n--- Test 8: Testing Domain Panel on Right Edge ---');
    await cdp.eval(`
      (() => {
        const manager = window.__nopitacBoardButtons;
        manager.addPersonComponent.close(true);
        manager.addPersonComponent.setEdge('right');
        manager.addPersonComponent.widget.style.top = '300px';
        manager.addPersonComponent.open();
      })()
    `);
    await sleep(400);

    await cdp.eval(`
      (() => {
        const domainInput = document.querySelector('[data-field="domain"]');
        if (domainInput) domainInput.click();
      })()
    `);
    await sleep(400);

    const rightEdgePanelState = await cdp.eval(`
      (() => {
        const p = document.getElementById('domainPanelWidget');
        if (!p) return null;
        const rect = p.getBoundingClientRect();
        return {
          isOpen: p.classList.contains('is-open'),
          edge: p.getAttribute('data-edge'),
          side: p.getAttribute('data-side'),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      })()
    `);
    console.log('Right Edge DomainPanel state:', rightEdgePanelState);
    if (!rightEdgePanelState || rightEdgePanelState.edge !== 'right') {
      throw new Error('DomainPanel failed to adapt to Right Edge');
    }
    await cdp.screenshot('08_domain_panel_right_edge.png');

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
