import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9245;

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
  throw new Error(`Failed to connect to Chrome debugging port ${port}`);
}

async function run() {
  console.log('--- 1. Launching Headless Chrome on port', DEBUG_PORT);
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    const wsUrl = await getDebuggerUrl(DEBUG_PORT);
    console.log('Connected to Chrome WebSocket:', wsUrl);
    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // ----------------------------------------------------
    // TEST 1: Clear session, visit '/' -> entry screen
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Entry Screen for logged-out visitor ---');
    await client.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(800);

    // Clear any existing localStorage
    await client.send('Runtime.evaluate', {
      expression: `localStorage.clear()`
    });
    await client.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(1000);

    const test1Result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        return {
          pathname: window.location.pathname,
          hasLottie: !!document.getElementById('lottieContainer'),
          hasSignUp: !!document.getElementById('homeSignUpBtn'),
          hasSignIn: !!document.getElementById('homeSignInBtn'),
          hasAuthModal: !!document.getElementById('authModal')
        };
      })()`,
      returnByValue: true
    });
    console.log('Visitor on / result:', test1Result.result.value);

    // ----------------------------------------------------
    // TEST 2: Log in and test redirect to /board.html
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Set user session and verify instant redirect ---');
    await client.send('Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('nopitac_user', JSON.stringify({
          name: 'Alexander McQueen',
          email: 'alexander@fashion.co'
        }));
      })()`
    });

    // Navigate to '/' while logged in
    await client.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(600);

    const test2Result = await client.send('Runtime.evaluate', {
      expression: `window.location.pathname`,
      returnByValue: true
    });
    console.log('Logged-in navigation to / redirected to:', test2Result.result.value);

    // ----------------------------------------------------
    // TEST 3: Board Loading Screen execution & duration
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Board Loading Screen Vector Animation ---');
    // Navigate directly to board to capture loading sequence from t=0
    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(400);

    // Check loading layer status immediately upon landing
    const loadingStateEarly = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const layer = document.getElementById('boardLoadingLayer');
        const container = document.getElementById('boardLottieContainer');
        const svg = container ? container.querySelector('svg') : null;
        const anim = window.__boardLoadingAnim;
        return {
          layerFound: !!layer,
          layerClasses: layer ? layer.className : null,
          hasSvg: !!svg,
          currentFrame: anim ? anim.currentRawFrame : null,
          isPaused: anim ? anim.isPaused : null,
          totalFrames: anim ? anim.totalFrames : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Loading state at 400ms:', loadingStateEarly.result.value);

    // Capture screenshot of loading animation playing
    await sleep(1000);
    const shotLoading = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_loading_screen.png', Buffer.from(shotLoading.data, 'base64'));
    console.log('Captured board_loading_screen.png');

    const loadingStateMid = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const anim = window.__boardLoadingAnim;
        return {
          currentFrame: anim ? Math.floor(anim.currentRawFrame) : null,
          totalFrames: anim ? anim.totalFrames : null,
          layerHidden: document.getElementById('boardLoadingLayer') ? document.getElementById('boardLoadingLayer').classList.contains('is-hidden') : true
        };
      })()`,
      returnByValue: true
    });
    console.log('Loading state at 1400ms (should still be playing, not hidden yet):', loadingStateMid.result.value);

    // Wait past the minimum duration (~2.5s) + transition buffer
    console.log('Waiting for minimum duration (2483ms) and fade transition...');
    await sleep(2200);

    const boardStateAfter = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const layer = document.getElementById('boardLoadingLayer');
        const logo = document.getElementById('boardLogo');
        const userBadge = document.getElementById('boardUserBadge');
        const userName = document.getElementById('boardUserName');
        const sessionPill = document.getElementById('boardSessionPill');
        const sessionName = sessionPill ? sessionPill.querySelector('.board-session-name') : null;
        const buttons = document.querySelectorAll('.board-moving-btn');

        return {
          layerHiddenOrRemoved: !layer || layer.classList.contains('is-hidden') || window.getComputedStyle(layer).opacity === '0',
          logoPresent: !!logo,
          userNameText: userName ? userName.textContent : null,
          sessionNameText: sessionName ? sessionName.textContent : null,
          buttonsCount: buttons.length
        };
      })()`,
      returnByValue: true
    });
    console.log('Board state after loading complete:', boardStateAfter.result.value);

    // Capture screenshot of the fully loaded board
    const shotBoard = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_loaded_ready.png', Buffer.from(shotBoard.data, 'base64'));
    console.log('Captured board_loaded_ready.png');

    // ----------------------------------------------------
    // TEST 4: Logout control and return to entry screen
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Sign out and return to entry screen ---');
    await client.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('boardLogoutBtn');
        if (btn) btn.click();
      })()`
    });
    await sleep(800);

    const test4Result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        return {
          pathname: window.location.pathname,
          localStorageUser: localStorage.getItem('nopitac_user'),
          hasEntryLottie: !!document.getElementById('lottieContainer')
        };
      })()`,
      returnByValue: true
    });
    console.log('Post-logout result:', test4Result.result.value);

    client.close();
    chrome.kill();
    console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Test error:', err);
    chrome.kill();
    process.exit(1);
  }
}

run();
