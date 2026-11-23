import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const data = await res.json();
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Chrome remote debugging not ready');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    const wsUrl = await getWsUrl();
    console.log('Connected to Chrome:', wsUrl);
    const client = new CDPClient(wsUrl);
    await client.connect();

    // Create a new target page
    const { targetId } = await client.send('Target.createTarget', { url: 'http://localhost:5173/board.html' });
    const targetWsUrl = `ws://127.0.0.1:${PORT}/devtools/page/${targetId}`;
    const pageClient = new CDPClient(targetWsUrl);
    await pageClient.connect();

    await pageClient.send('Page.enable');
    await pageClient.send('DOM.enable');
    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('Waiting for board.html load...');
    await sleep(1500);

    // 1. Initial State Verification
    const evalResult = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const manager = window.__nopitacBoardButtons;
          const search = document.getElementById('boardBtn_search');
          const addPersonWidget = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          const line = document.getElementById('boardBottomLine');
          return {
            hasManager: !!manager,
            search: search ? { display: search.style.display, top: search.style.top, left: search.style.left, class: search.className } : null,
            addPerson: addPersonWidget ? { display: addPersonWidget.style.display, top: addPersonWidget.style.top, left: addPersonWidget.style.left, class: addPersonWidget.className } : null,
            sort: sort ? { display: sort.style.display, top: sort.style.top, right: sort.style.right, class: sort.className } : null,
            bottomLineTop: line ? line.style.top : null,
            usableHeight: manager ? manager.usableHeight : null
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Initial Button Positions:', JSON.stringify(evalResult.result.value, null, 2));

    // Capture initial screenshot
    const initScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_initial.png', Buffer.from(initScreenshot.data, 'base64'));
    console.log('Saved board_state_initial.png');

    // 2. Scroll DOWN (Clockwise)
    console.log('Dispatching scroll down (wheel deltaY = +500)...');
    await pageClient.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: 500
    });
    await sleep(600);

    const scrolledResult = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const manager = window.__nopitacBoardButtons;
          const search = document.getElementById('boardBtn_search');
          const addPersonWidget = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          return {
            scrollOffset: manager.scrollOffset,
            search: search ? { top: search.style.top, left: search.style.left, right: search.style.right, class: search.className } : null,
            addPerson: addPersonWidget ? { top: addPersonWidget.style.top, left: addPersonWidget.style.left, class: addPersonWidget.className } : null,
            sort: sort ? { top: sort.style.top, left: sort.style.left, right: sort.style.right, class: sort.className } : null
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Scrolled Down Positions:', JSON.stringify(scrolledResult.result.value, null, 2));

    const scrolledScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_scrolled_down.png', Buffer.from(scrolledScreenshot.data, 'base64'));
    console.log('Saved board_state_scrolled_down.png');

    // 3. Scroll UP (Anticlockwise)
    console.log('Dispatching scroll up (wheel deltaY = -1000)...');
    await pageClient.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: -1000
    });
    await sleep(600);

    const scrollUpResult = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const manager = window.__nopitacBoardButtons;
          const search = document.getElementById('boardBtn_search');
          const addPersonWidget = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          return {
            scrollOffset: manager.scrollOffset,
            search: search ? { top: search.style.top, left: search.style.left, right: search.style.right, class: search.className } : null,
            addPerson: addPersonWidget ? { top: addPersonWidget.style.top, left: addPersonWidget.style.left, class: addPersonWidget.className } : null,
            sort: sort ? { top: sort.style.top, left: sort.style.left, right: sort.style.right, class: sort.className } : null
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Scrolled Up Positions:', JSON.stringify(scrollUpResult.result.value, null, 2));

    const scrollUpScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_scrolled_up.png', Buffer.from(scrollUpScreenshot.data, 'base64'));
    console.log('Saved board_state_scrolled_up.png');

    // 4. Test clicking Add Person to expand anywhere on top edge
    console.log('Clicking Add Person button to test expansion on top edge...');
    await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const widget = document.querySelector('.add-person-widget');
          const header = widget.querySelector('.add-person-header');
          header.click();
        })()
      `
    });
    await sleep(700);

    const expandResult = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const widget = document.querySelector('.add-person-widget');
          const manager = window.__nopitacBoardButtons;
          return {
            isExpanded: widget.classList.contains('is-expanded'),
            width: widget.offsetWidth,
            height: widget.offsetHeight,
            left: widget.style.left,
            top: widget.style.top,
            scrollPaused: manager.addPersonComponent.isExpanded
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Add Person Expansion Result:', JSON.stringify(expandResult.result.value, null, 2));

    const expandedScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_expanded.png', Buffer.from(expandedScreenshot.data, 'base64'));
    console.log('Saved board_state_expanded.png');

    pageClient.close();
    client.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

