import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9257;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
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
  close() { if (this.ws) this.ws.close(); }
}

async function getTabs(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      return await res.json();
    } catch(e) { await sleep(400); }
  }
  throw new Error('Chrome failed to start');
}

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  const tabs = await getTabs();
  const client = new CDPClient(tabs[0].webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
  // Wait for loading screen to complete and board to settle
  await sleep(3500);

  // 1. Verify Contracted Top Edge Button
  console.log('--- 1. Testing Top Edge "add name" button ---');
  const topInfo = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const widget = document.querySelector('.add-person-widget');
      const textEl = document.querySelector('#addPersonSvgText');
      const cs = textEl ? window.getComputedStyle(textEl) : null;
      const rect = widget ? widget.getBoundingClientRect() : null;
      return {
        text: textEl ? textEl.textContent.trim() : null,
        fontFamily: cs ? cs.fontFamily : null,
        fontWeight: cs ? cs.fontWeight : null,
        fontSize: cs ? cs.fontSize : null,
        width: rect ? rect.width : null,
        height: rect ? rect.height : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Top Edge Info:', topInfo.result.value);

  // Check actual platform font
  const doc = await client.send('DOM.getDocument');
  const textNode = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#addPersonSvgText' });
  const platformFonts = await client.send('CSS.getPlatformFontsForNode', { nodeId: textNode.nodeId });
  console.log('Platform Fonts for #addPersonSvgText:', JSON.stringify(platformFonts));

  const shotTop = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_add_name_top.png', Buffer.from(shotTop.data, 'base64'));
  console.log('Saved board_add_name_top.png');

  // 2. Expand Button on Top Edge
  console.log('\n--- 2. Testing Click to Expand ---');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('#addPersonHeader');
      if (header) header.click();
    })()`
  });
  await sleep(800);

  const expandInfo = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const widget = document.querySelector('.add-person-widget');
      const isExpanded = widget ? widget.classList.contains('is-expanded') : false;
      const rect = widget ? widget.getBoundingClientRect() : null;
      return { isExpanded, width: rect ? rect.width : null, height: rect ? rect.height : null };
    })()`,
    returnByValue: true
  });
  console.log('Expanded Info:', expandInfo.result.value);

  const shotExpand = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_add_name_expanded.png', Buffer.from(shotExpand.data, 'base64'));
  console.log('Saved board_add_name_expanded.png');

  // Collapse back
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('#addPersonHeader');
      if (header) header.click();
    })()`
  });
  await sleep(600);

  // 3. Test revolving to Left Edge
  console.log('\n--- 3. Testing Revolving to Left Edge ---');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      window.__nopitacBoardButtons.addPersonComponent.setEdge('left');
      window.__nopitacBoardButtons.updateAddPersonButton({ edge: 'left', x: 0, y: 300 }, true);
    })()`
  });
  await sleep(300);

  const leftInfo = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const textEl = document.querySelector('#addPersonSvgText');
      return { text: textEl ? textEl.textContent.trim() : null };
    })()`,
    returnByValue: true
  });
  console.log('Left Edge Info:', leftInfo.result.value);

  const shotLeft = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_add_name_left.png', Buffer.from(shotLeft.data, 'base64'));
  console.log('Saved board_add_name_left.png');

  // 4. Test revolving to Right Edge
  console.log('\n--- 4. Testing Revolving to Right Edge ---');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      window.__nopitacBoardButtons.addPersonComponent.setEdge('right');
      window.__nopitacBoardButtons.updateAddPersonButton({ edge: 'right', x: 1440, y: 300 }, true);
    })()`
  });
  await sleep(300);

  const rightInfo = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const textEl = document.querySelector('#addPersonSvgText');
      return { text: textEl ? textEl.textContent.trim() : null };
    })()`,
    returnByValue: true
  });
  console.log('Right Edge Info:', rightInfo.result.value);

  const shotRight = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_add_name_right.png', Buffer.from(shotRight.data, 'base64'));
  console.log('Saved board_add_name_right.png');

  client.close();
  chrome.kill();
  console.log('\n=== ADD NAME BUTTON VERIFICATION COMPLETE ===');
}

run();
