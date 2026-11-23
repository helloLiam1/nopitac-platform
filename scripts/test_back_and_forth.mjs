import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9226;

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
    this.onEvent = null;
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
        } else if (msg.method && this.onEvent) {
          this.onEvent(msg.method, msg.params);
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

    const consoleErrors = [];
    pageClient.onEvent = (method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        consoleErrors.push(params.exceptionDetails);
        console.error('Captured Exception:', params.exceptionDetails.text, params.exceptionDetails.exception?.description);
      } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        consoleErrors.push(params.args);
        console.error('Captured Console Error:', params.args);
      }
    };

    await pageClient.connect();
    await pageClient.send('Runtime.enable');
    await pageClient.send('Page.enable');

    await sleep(1500);

    console.log('Testing rapid back-and-forth scrolling across edge transitions...');
    // Rapidly alternate scroll directions around the corner positions
    // deltaY: +200, -250, +300, -350, +500, -500, etc.
    const deltas = [
      200, -250, 300, -350, 500, -500,
      1200, -1200, 800, -900, 600, -600,
      300, -300, 1500, -1500, 200, -200
    ];

    for (let i = 0; i < deltas.length; i++) {
      const dy = deltas[i];
      await pageClient.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 720,
        y: 450,
        deltaX: 0,
        deltaY: dy
      });
      // Short delay between back-and-forth flicks
      await sleep(100);
    }

    await sleep(600);

    const checkRes = await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const manager = window.__nopitacBoardButtons;
          const search = document.getElementById('boardBtn_search');
          const addPerson = document.querySelector('.add-person-widget');
          const sort = document.getElementById('boardBtn_sort');
          return {
            isTicking: manager.isTicking,
            scrollOffset: Math.round(manager.scrollOffset),
            search: { top: search.style.top, left: search.style.left, class: search.className },
            addPerson: { top: addPerson.style.top, left: addPerson.style.left, display: addPerson.style.display },
            sort: { top: sort.style.top, right: sort.style.right, class: sort.className }
          };
        })()
      `,
      returnByValue: true
    });

    console.log('\nFinal State after back-and-forth:', checkRes.result.value);
    console.log('Total Console Errors captured:', consoleErrors.length);

    if (consoleErrors.length > 0) {
      console.error('FAILED: There were console errors during back-and-forth scrolling!');
      process.exit(1);
    } else {
      console.log('PASSED: Zero console errors, smooth back-and-forth scrolling verified!');
    }

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

