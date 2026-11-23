import { spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9230;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
  const chrome = spawn(CHROME_PATH, ['--headless=new', '--remote-debugging-port=' + DEBUG_PORT, '--no-sandbox', '--disable-gpu', '--window-size=1440,900']);
  await sleep(1500);
  const listRes = await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json');
  const tabs = await listRes.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === curId) { ws.removeEventListener('message', handler); resolve(msg.result); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:5173/home.html' });

  // Let's seek specifically to frame 30, 75, 130, 225, 280 and check what is in the SVG
  for (const frame of [30, 75, 130, 225, 280, 310, 340]) {
    await send('Runtime.evaluate', { expression: `window.homeApp.anim.goToAndStop(${frame}, true)` });
    await sleep(100);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    import('fs').then(fs => {
      fs.writeFileSync(`/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/frame_${frame}.png`, Buffer.from(snap.data, 'base64'));
    });
    console.log(`Captured frame_${frame}.png`);
  }

  ws.close();
  chrome.kill();
}
test().catch(console.error);

