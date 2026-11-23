import { spawn } from 'child_process';

const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=9228', '--window-size=1440,900', 'about:blank'
]);

async function main() {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9228/json/version').then(r => r.json());
      if (res) break;
    } catch (e) {}
  }
  const targets = await fetch('http://127.0.0.1:9228/json/list').then(r => r.json());
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise(r => {
    const cur = id++;
    const h = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === cur) { ws.removeEventListener('message', h); r(m.result); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: cur, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:5173/board.html' });
  await new Promise(r => setTimeout(r, 800));

  await send('Runtime.evaluate', {
    expression: 'window.__nopitacBoardButtons.targetScrollOffset = 1100; window.__nopitacBoardButtons.scrollOffset = 1100; window.__nopitacBoardButtons.update();'
  });
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const el = ap.widget;
      return {
        className: el.className,
        style: el.getAttribute("style"),
        computedWidth: window.getComputedStyle(el).width,
        computedHeight: window.getComputedStyle(el).height,
        rules: Array.from(document.styleSheets).flatMap(s => {
          try { return Array.from(s.cssRules || []); } catch (e) { return []; }
        }).filter(r => r.selectorText && el.matches(r.selectorText)).map(r => r.cssText)
      };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
}

main().catch(console.error).finally(() => proc.kill('SIGTERM'));
