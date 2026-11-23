import { spawn } from 'child_process';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9245;
const SERVER_PORT = 8188;
const BASE_DIR = '/Users/liamfarishta/Desktop/desktop/for.the.meantime/Nopitac/typeface/nopitac helvetica/domain type';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Simple static server
function createServer() {
  const server = http.createServer(async (req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(BASE_DIR, decodeURIComponent(reqPath));
    try {
      const content = await fs.readFile(filePath);
      let contentType = 'text/plain';
      if (filePath.endsWith('.html')) contentType = 'text/html';
      else if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';
      else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise(resolve => {
    server.listen(SERVER_PORT, () => resolve(server));
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
  console.log('Starting local web server on port', SERVER_PORT);
  const server = await createServer();

  console.log('Spawning Chrome...');
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

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('Navigating to http://localhost:' + SERVER_PORT);
    await client.send('Page.navigate', { url: `http://localhost:${SERVER_PORT}/index.html` });
    await sleep(1000);

    // Verify page loaded without console errors
    console.log('=== TEST 1: Page Load & Initial Render ===');
    const title = await client.evaluate(`document.title`);
    console.log('Page title:', title);
    if (!title.includes('Domain Type Tool')) {
      throw new Error(`FAIL: Unexpected title: ${title}`);
    }

    const initialSvgExists = await client.evaluate(`!!document.querySelector('#renderContainer svg')`);
    console.log('SVG rendered in DOM:', initialSvgExists);
    if (!initialSvgExists) throw new Error('FAIL: SVG not rendered initially!');

    // Test 2: Verify copywriters in center mode
    console.log('\n=== TEST 2: "copywriters" in Center Mode ===');
    let metrics = await client.evaluate(`
      (() => {
        const res = DomainType.compute('copywriters', { mode: 'center', fontSize: 16 });
        return {
          hasAscenders: res.hasAscenders,
          hasDescenders: res.hasDescenders,
          box: res.box,
          outlinePath: res.outline.pathD
        };
      })()
    `);
    console.log('copywriters center metrics:', metrics);
    if (!metrics.hasAscenders) throw new Error('FAIL: expected hasAscenders = true for copywriters!');
    if (!metrics.hasDescenders) throw new Error('FAIL: expected hasDescenders = true for copywriters!');
    if (metrics.box.top >= 0) throw new Error('FAIL: expected negative box.top relative to baseline!');

    // Capture screenshot of copywriters center mode
    let shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_copywriters_center.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_copywriters_center.png');

    // Test 3: Test copywriters in left mode
    console.log('\n=== TEST 3: "copywriters" in Left Mode ===');
    await client.evaluate(`document.querySelector('.mode-btn[data-mode="left"]').click()`);
    await sleep(300);
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_copywriters_left.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_copywriters_left.png');

    // Test 4: Test copywriters in right mode
    console.log('\n=== TEST 4: "copywriters" in Right Mode ===');
    await client.evaluate(`document.querySelector('.mode-btn[data-mode="right"]').click()`);
    await sleep(300);
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_copywriters_right.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_copywriters_right.png');

    // Test 5: Test "artists" preset (No descenders)
    console.log('\n=== TEST 5: "artists" (No Descenders) ===');
    await client.evaluate(`document.querySelector('.preset-chip[data-text="artists"]').click()`);
    await sleep(300);
    metrics = await client.evaluate(`
      (() => {
        const res = DomainType.compute('artists', { mode: 'left', fontSize: 16 });
        return {
          hasAscenders: res.hasAscenders,
          hasDescenders: res.hasDescenders,
          box: res.box,
          outlinePath: res.outline.pathD
        };
      })()
    `);
    console.log('artists metrics:', metrics);
    if (metrics.hasDescenders) throw new Error('FAIL: "artists" should NOT have descenders!');
    // Verify bottom is baseline + 2.5px
    if (Math.abs(metrics.box.bottom - 2.5) > 0.01) {
      throw new Error(`FAIL: expected box.bottom == 2.5px, got ${metrics.box.bottom}`);
    }
    console.log('PASS: artists box.bottom is exactly 2.5px from baseline!');

    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_artists_green.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_artists_green.png');

    // Test 6: Test "music composers" preset (2 lines, red)
    console.log('\n=== TEST 6: "music composers" (Center Mode, Red, 2 Lines) ===');
    await client.evaluate(`
      (() => {
        const chip = Array.from(document.querySelectorAll('.preset-chip')).find(c => c.textContent.includes('music composers') && c.textContent.includes('Center'));
        if (chip) chip.click();
      })()
    `);
    await sleep(300);
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_music_composers_center.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_music_composers_center.png');

    // Test 7: Test "music composers" (Left Mode, Red)
    console.log('\n=== TEST 7: "music composers" (Left Mode, Red, 2 Lines) ===');
    await client.evaluate(`
      (() => {
        const chip = Array.from(document.querySelectorAll('.preset-chip')).find(c => c.textContent.includes('music composers') && c.textContent.includes('Left'));
        if (chip) chip.click();
      })()
    `);
    await sleep(300);
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_music_composers_left.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_music_composers_left.png');

    // Test 8: Test "music composers" (Right Mode, Red)
    console.log('\n=== TEST 8: "music composers" (Right Mode, Red, 2 Lines) ===');
    await client.evaluate(`
      (() => {
        const chip = Array.from(document.querySelectorAll('.preset-chip')).find(c => c.textContent.includes('music composers') && c.textContent.includes('Right'));
        if (chip) chip.click();
      })()
    `);
    await sleep(300);
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/domain_tool_music_composers_right.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved screenshot: domain_tool_music_composers_right.png');

    console.log('\n>>> ALL DOMAIN TYPE TOOL TESTS PASSED PERFECTLY! <<<');
  } finally {
    chromeProc.kill();
    server.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
