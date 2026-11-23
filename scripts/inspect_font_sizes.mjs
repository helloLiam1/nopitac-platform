import { spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9235;

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

    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      mgr.addPersonComponent.open();
    })()`);
    await sleep(600);

    const apData = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      const apLabel = document.querySelector('#labelFullName');
      const apBox = apLabel ? apLabel.getBoundingClientRect() : null;
      const apFont = apLabel ? window.getComputedStyle(apLabel).fontSize : null;
      const widget = mgr.addPersonComponent.widget;
      const box = widget.getBoundingClientRect();
      return {
        labelFont: apFont,
        labelBBox: apBox ? { width: apBox.width, height: apBox.height } : null,
        edge: mgr.addPersonComponent.edge,
        widgetWidth: box.width,
        widgetHeight: box.height
      };
    })()`);

    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      mgr.addPersonComponent.close(true);
      mgr.sortComponent.open();
    })()`);
    await sleep(600);

    const sortData = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      const sortLabel = document.querySelector('[data-option="name"] text');
      const sortBox = sortLabel ? sortLabel.getBoundingClientRect() : null;
      const sortFont = sortLabel ? window.getComputedStyle(sortLabel).fontSize : null;
      
      const sortTitle = document.querySelector('.sort-section-title');
      const sortTitleBox = sortTitle ? sortTitle.getBoundingClientRect() : null;
      const sortTitleFont = sortTitle ? window.getComputedStyle(sortTitle).fontSize : null;

      const widget = mgr.sortComponent.widget;
      const box = widget.getBoundingClientRect();

      return {
        labelFont: sortFont,
        labelBBox: sortBox ? { width: sortBox.width, height: sortBox.height } : null,
        titleFont: sortTitleFont,
        titleBBox: sortTitleBox ? { width: sortTitleBox.width, height: sortTitleBox.height } : null,
        edge: mgr.sortComponent.edge,
        widgetWidth: box.width,
        widgetHeight: box.height
      };
    })()`);

    console.log(JSON.stringify({ addPerson: apData, sort: sortData }, null, 2));

  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
