import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9225;

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
    const client = new CDPClient(wsUrl);
    await client.connect();

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

    await sleep(1500);

    // Initial check
    const initRes = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const search = document.getElementById('boardBtn_search');
          const addPerson = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          return {
            searchTop: parseFloat(search.style.top),
            addPersonLeft: parseFloat(addPerson.style.left),
            sortTop: parseFloat(sort.style.top)
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Initial positions:', initRes.result.value);

    // TEST 1: Speed Verification (1:1 Ratio)
    // Scroll down by exactly 100px
    console.log('\n--- TEST 1: Speed Verification (1:1 Ratio) ---');
    await pageClient.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: 100
    });
    await sleep(400);

    const speedRes = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const search = document.getElementById('boardBtn_search');
          const addPerson = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          const manager = window.__nopitacBoardButtons;
          return {
            scrollOffset: manager.scrollOffset,
            searchTop: parseFloat(search.style.top),
            addPersonLeft: parseFloat(addPerson.style.left),
            sortTop: parseFloat(sort.style.top)
          };
        })()
      `,
      returnByValue: true
    });
    console.log('After 100px scroll:', speedRes.result.value);
    const searchDeltaY = initRes.result.value.searchTop - speedRes.result.value.searchTop;
    const addDeltaX = speedRes.result.value.addPersonLeft - initRes.result.value.addPersonLeft;
    const sortDeltaY = speedRes.result.value.sortTop - initRes.result.value.sortTop;
    console.log(`Search moved UP: ${searchDeltaY.toFixed(2)}px (for 100px scroll, ratio = ${(searchDeltaY / 100).toFixed(3)})`);
    console.log(`Add Person moved RIGHT: ${addDeltaX.toFixed(2)}px (for 100px scroll, ratio = ${(addDeltaX / 100).toFixed(3)})`);
    console.log(`Sort moved DOWN: ${sortDeltaY.toFixed(2)}px (for 100px scroll, ratio = ${(sortDeltaY / 100).toFixed(3)})`);

    // TEST 2: Infinite Down Scrolling (Multiple Revolutions)
    console.log('\n--- TEST 2: Infinite Downward Scrolling (3 Full Revolutions) ---');
    // Track length is ~2767px. Let's scroll 3000px, 6000px, 9000px
    for (let loop = 1; loop <= 3; loop++) {
      await pageClient.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 720,
        y: 450,
        deltaX: 0,
        deltaY: 2767.52
      });
      await sleep(500);

      const loopRes = await pageClient.send('Runtime.evaluate', {
        expression: `
          (() => {
            const manager = window.__nopitacBoardButtons;
            const search = document.getElementById('boardBtn_search');
            const addPerson = document.querySelector('.add-person-widget');
            const sort = document.getElementById('boardBtn_sort');
            return {
              loop: ${loop},
              scrollOffset: Math.round(manager.scrollOffset),
              searchEdge: search.className.split(' ').pop(),
              searchTop: search.style.top,
              searchLeft: search.style.left,
              addPersonLeft: addPerson.style.left,
              sortTop: sort.style.top
            };
          })()
        `,
        returnByValue: true
      });
      console.log(`Full loop ${loop} completed:`, loopRes.result.value);
    }

    // TEST 3: Infinite Upward Scrolling (Negative Revolutions)
    console.log('\n--- TEST 3: Infinite Upward Scrolling (-5 Full Revolutions) ---');
    for (let loop = 1; loop <= 5; loop++) {
      await pageClient.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 720,
        y: 450,
        deltaX: 0,
        deltaY: -2767.52
      });
      await sleep(500);

      const loopUpRes = await pageClient.send('Runtime.evaluate', {
        expression: `
          (() => {
            const manager = window.__nopitacBoardButtons;
            const search = document.getElementById('boardBtn_search');
            const addPerson = document.querySelector('.add-person-widget');
            const sort = document.getElementById('boardBtn_sort');
            return {
              negativeLoop: ${loop},
              scrollOffset: Math.round(manager.scrollOffset),
              searchEdge: search.className.split(' ').pop(),
              searchTop: search.style.top,
              addPersonLeft: addPerson.style.left,
              sortTop: sort.style.top
            };
          })()
        `,
        returnByValue: true
      });
      console.log(`Negative loop -${loop} completed:`, loopUpRes.result.value);
    }

    // Capture screenshot of state
    const screenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/infinite_scroll_verified.png', Buffer.from(screenshot.data, 'base64'));
    console.log('\nSaved infinite_scroll_verified.png');

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

