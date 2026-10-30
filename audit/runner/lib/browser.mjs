// Browser, local server and journey helpers shared by every adapter.
import http from 'node:http';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { shell } from './shell.mjs';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome(explicit) {
  const path = [explicit, ...CHROME_PATHS].find((p) => p && fs.existsSync(p));
  if (!path) throw new Error('No Chrome found. Pass --chrome <path> or set CHROME_PATH.');
  return path;
}

// Two origins (127.0.0.1 and localhost) so fixtures can embed a cross-origin iframe.
export async function startServer() {
  const pages = new Map();
  const handler = async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const entry = pages.get(u.searchParams.get('run'));
    if (u.pathname === '/p' && entry) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(entry.html);
    }
    if (u.pathname === '/frame' && entry?.frames?.[u.searchParams.get('f')]) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(entry.frames[u.searchParams.get('f')]);
    }
    if (u.pathname === '/api') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ q: u.searchParams.get('q') }));
    }
    if (u.pathname === '/img.svg') {
      res.setHeader('content-type', 'image/svg+xml');
      const c = (u.searchParams.get('c') || '888').replace(/[^0-9a-f]/gi, '');
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#${c}"/></svg>`);
    }
    res.statusCode = 404;
    res.end('');
  };
  const a = http.createServer(handler);
  await new Promise((r) => a.listen(0, '127.0.0.1', r));
  const b = http.createServer(handler);
  await new Promise((r) => b.listen(0, 'localhost', r));
  return {
    port: a.address().port,
    port2: b.address().port,
    put: (id, entry) => pages.set(id, entry),
    drop: (id) => pages.delete(id),
    close: () => { a.close(); b.close(); },
  };
}

export async function launch(chrome) {
  return puppeteer.launch({
    executablePath: findChrome(chrome),
    headless: true,
    args: ['--lang=en-US', '--no-first-run'],
    env: { ...process.env, TZ: 'UTC', LANG: 'en_US.UTF-8' },
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Realistic input: pointer moves with intermediate steps, real key presses with a fixed delay.
// Changing isMobile or hasTouch with page.setViewport reloads the page and ends the recording,
// so fixtures resize with width and height only; h.tap emulates touch only on a touch viewport.
export function helpers(page, server) {
  const h = {
    page,
    port: server.port,
    port2: server.port2,
    wait,
    async box(sel) {
      const el = await page.$(sel);
      if (!el) throw new Error(`fixture selector not found: ${sel}`);
      return el.boundingBox();
    },
    async move(sel, fx = 0.5, fy = 0.5) {
      const b = await h.box(sel);
      await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 10 });
    },
    async click(sel, fx, fy) {
      await h.move(sel, fx, fy);
      await page.mouse.down();
      await wait(60);
      await page.mouse.up();
      await wait(120);
    },
    async type(text, delay = 90) {
      await page.keyboard.type(String(text), { delay });
    },
    async fill(sel, text, delay = 90) {
      await h.click(sel);
      await h.type(text, delay);
    },
    async press(key, times = 1) {
      for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
        await wait(80);
      }
    },
    async tap(sel) {
      const b = await h.box(sel);
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await wait(120);
    },
    async drag(points) {
      const [first, ...rest] = points;
      await page.mouse.move(first[0], first[1], { steps: 8 });
      await page.mouse.down();
      for (const [x, y] of rest) await page.mouse.move(x, y, { steps: 8 });
      await page.mouse.up();
      await wait(100);
    },
  };
  return h;
}

// Wraps fixture body content in the public shell and labels every labelled element with a stable id.
export function wrap(fixtureHtml) {
  const body = fixtureHtml.includes('<body') ? fixtureHtml : `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title></head><body>${fixtureHtml}</body></html>`;
  return body
    .replace(/<head>/, `<head><meta charset="utf-8">${shell.head}`)
    .replace(/<body([^>]*)>/, (m) => `${m}${shell.top}`)
    .replace('</body>', `${shell.bottom}<script>document.querySelectorAll('[data-audit-category]').forEach((e,i)=>e.setAttribute('data-audit-id',String(i)))</script></body>`);
}

// Text and attributes of every public element, as the live page shows them.
export async function livePublic(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-audit-category="public"]').forEach((e) => {
      out[e.getAttribute('data-audit-id')] = {
        text: (e.textContent || '').replace(/\s+/g, ' ').trim(),
        tag: e.tagName.toLowerCase(),
        src: e.getAttribute('src') ? e.src : null,
      };
    });
    return out;
  });
}
