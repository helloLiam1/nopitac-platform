import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9255;

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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getDebuggerUrl(port, maxRetries = 15) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await res.json();
      if (tabs.length && tabs[0].webSocketDebuggerUrl) {
        return tabs[0].webSocketDebuggerUrl;
      }
    } catch (e) {
      await sleep(300);
    }
  }
  throw new Error('Failed to connect to Chrome debugging port ' + port);
}

async function evalInPage(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function saveScreenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(filename, buffer);
  console.log(`Saved screenshot: ${filename}`);
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    const wsUrl = await getDebuggerUrl(DEBUG_PORT);
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('\n--- 1. Testing Auth Field Focus & Typing on home.html ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/home.html' });
    await sleep(2000);

    // Open sign in screen
    await evalInPage(cdp, `
      (() => {
        const btn = document.getElementById('btnSignIn');
        if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(700);

    const initialLabelOpacity = await evalInPage(cdp, `
      (() => {
        const row = document.querySelector('#authScreen .auth-field-row[data-field="signin-username"]');
        const label = row ? row.querySelector('.auth-field-label') : null;
        return {
          rowClass: row ? row.className : null,
          opacity: label ? window.getComputedStyle(label).opacity : null
        };
      })()
    `);
    console.log('Unfocused label opacity:', initialLabelOpacity);

    // Focus input without typing
    await evalInPage(cdp, `
      (() => {
        const input = document.getElementById('signInUsername');
        if (input) {
          input.focus();
          input.dispatchEvent(new Event('focus', { bubbles: true }));
        }
      })()
    `);
    await sleep(200);

    const focusedLabelOpacity = await evalInPage(cdp, `
      (() => {
        const row = document.querySelector('#authScreen .auth-field-row[data-field="signin-username"]');
        const label = row ? row.querySelector('.auth-field-label') : null;
        return {
          rowClass: row ? row.className : null,
          opacity: label ? window.getComputedStyle(label).opacity : null
        };
      })()
    `);
    console.log('Focused label opacity (no typing yet):', focusedLabelOpacity);

    // Type text into input
    await evalInPage(cdp, `
      (() => {
        const input = document.querySelector('#authScreen .auth-field-row input');
        if (input) {
          input.value = 'john.doe@example.com';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(200);

    const typedLabelState = await evalInPage(cdp, `
      (() => {
        const row = document.querySelector('#authScreen .auth-field-row');
        const label = row ? row.querySelector('.auth-field-label') : null;
        return label ? {
          opacity: window.getComputedStyle(label).opacity,
          visibility: window.getComputedStyle(label).visibility
        } : null;
      })()
    `);
    console.log('Typed label state:', typedLabelState);
    await saveScreenshot(cdp, '/tmp/auth_field_check.png');

    console.log('\n--- 2. Testing Landing Screen (/landing.html) ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/landing.html?color=%236a76ff' });
    await sleep(1000);

    const landingState = await evalInPage(cdp, `
      (() => {
        const card = document.getElementById('landingCenterCard');
        const btnCreate = document.getElementById('landingBtn_create-board');
        const btnExplore = document.getElementById('landingBtn_explore-boards');
        return {
          hasCard: Boolean(card),
          cardDimensions: card ? { w: card.offsetWidth, h: card.offsetHeight } : null,
          btnCreate: btnCreate ? { edge: btnCreate.className, left: btnCreate.style.left, top: btnCreate.style.top } : null,
          btnExplore: btnExplore ? { edge: btnExplore.className, left: btnExplore.style.left, top: btnExplore.style.top } : null
        };
      })()
    `);
    console.log('Landing state:', JSON.stringify(landingState, null, 2));

    // Scroll to test button circulation
    await evalInPage(cdp, `
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true }));
    `);
    await sleep(500);

    const landingScrolledState = await evalInPage(cdp, `
      (() => {
        const btnCreate = document.getElementById('landingBtn_create-board');
        const btnExplore = document.getElementById('landingBtn_explore-boards');
        return {
          btnCreate: btnCreate ? { edge: btnCreate.className, left: btnCreate.style.left, top: btnCreate.style.top } : null,
          btnExplore: btnExplore ? { edge: btnExplore.className, left: btnExplore.style.left, top: btnExplore.style.top } : null
        };
      })()
    `);
    console.log('Landing after scroll:', JSON.stringify(landingScrolledState, null, 2));
    await saveScreenshot(cdp, '/tmp/landing_screen_verified.png');

    console.log('\n--- 3. Testing Empty Board Mode (/board.html?mode=empty) ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html?mode=empty' });
    await sleep(3500);

    const emptyBoardCheck = await evalInPage(cdp, `
      (() => {
        const circlesSvg = document.getElementById('boardConcentricCirclesSvg');
        const centerPanel = document.getElementById('boardCenterInfoPanel');
        const logo = document.getElementById('boardLogo');
        const addNameBtn = document.getElementById('addPersonWidget') || document.getElementById('boardBtn_add-person');
        const searchBtn = document.getElementById('boardBtn_search');
        const sortBtn = document.getElementById('sortWidget') || document.getElementById('boardBtn_sort');
        const userBadge = document.getElementById('boardUserBadge');
        const cc = window.__boardConcentricCircles;

        return {
          circlesSvgDisplay: circlesSvg ? circlesSvg.style.display : null,
          centerPanelDisplay: centerPanel ? centerPanel.style.display : null,
          ringsCount: cc ? cc.rings.length : null,
          peopleCount: cc ? cc.people.size : null,
          hasLogo: Boolean(logo),
          hasAddNameBtn: Boolean(addNameBtn),
          hasSearchBtn: Boolean(searchBtn),
          hasSortBtn: Boolean(sortBtn),
          hasUserBadge: Boolean(userBadge)
        };
      })()
    `);
    console.log('Empty board verification:', JSON.stringify(emptyBoardCheck, null, 2));
    await saveScreenshot(cdp, '/tmp/empty_board_verified.png');

    console.log('\n--- 4. Adding person on empty board to verify transition ---');
    const addedState = await evalInPage(cdp, `
      (() => {
        const cc = window.__boardConcentricCircles;
        if (!cc) return null;
        cc.addPerson({
          fullName: 'jon contino',
          domain: 'artists',
          place: 'new york',
          year: '1983 -',
          whyCool: 'illustration as identity tool'
        });
        const circlesSvg = document.getElementById('boardConcentricCirclesSvg');
        const centerPanel = document.getElementById('boardCenterInfoPanel');
        return {
          circlesSvgDisplay: circlesSvg.style.display,
          centerPanelDisplay: centerPanel.style.display,
          ringsCount: cc.rings.length,
          peopleCount: cc.people.size,
          selectedPerson: cc.selectedPersonId
        };
      })()
    `);
    console.log('After adding person:', JSON.stringify(addedState, null, 2));
    await sleep(500);
    await saveScreenshot(cdp, '/tmp/empty_board_after_add_verified.png');

    cdp.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
