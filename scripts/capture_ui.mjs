import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9236;

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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then(r => r.json());
        if (res) break;
      } catch (e) {}
    }

    const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json());
    const pageTarget = targets.find(t => t.type === 'page');
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(800);

    // Open Add Person on top edge
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);
    await sleep(600);
    const ss1 = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/add_person_screenshot.png', Buffer.from(ss1.data, 'base64'));

    // Close Add Person, open Sort on right edge
    await client.evaluate(`(() => {
      window.__nopitacBoardButtons.addPersonComponent.close(true);
      window.__nopitacBoardButtons.sortComponent.open();
    })()`);
    await sleep(600);
    const ss2 = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/sort_right_screenshot.png', Buffer.from(ss2.data, 'base64'));

    // Move Sort to top edge and open
    await client.evaluate(`(() => {
      window.__nopitacBoardButtons.sortComponent.close(true);
      window.__nopitacBoardButtons.targetScrollOffset = 800;
      window.__nopitacBoardButtons.scrollOffset = 800;
      window.__nopitacBoardButtons.update();
      window.__nopitacBoardButtons.sortComponent.open();
    })()`);
    await sleep(600);
    const ss3 = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/sort_top_screenshot.png', Buffer.from(ss3.data, 'base64'));

    console.log('Screenshots captured to /tmp/');

  } finally {
    chromeProc.kill();
  }
}

run().catch(console.error);

