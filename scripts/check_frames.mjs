import { spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9232;
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

  for (const frame of [10, 20, 26, 27, 28, 29, 30, 35, 50, 75]) {
    await send('Runtime.evaluate', { expression: `window.homeApp.anim.goToAndStop(${frame}, true)` });
    const vis = await send('Runtime.evaluate', { expression: `(() => {
      const svg = document.querySelector("#lottieContainer svg");
      const bboxes = Array.from(svg.querySelectorAll("path")).map(p => p.getBoundingClientRect()).filter(b => b.width > 0);
      return { frame: ${frame}, count: bboxes.length, firstBox: bboxes[0] ? { x: Math.round(bboxes[0].x), y: Math.round(bboxes[0].y), w: Math.round(bboxes[0].width), h: Math.round(bboxes[0].height) } : null };
    })()`, returnByValue: true });
    console.log(vis.result.value);
  }
  ws.close();
  chrome.kill();
}
test().catch(console.error);

