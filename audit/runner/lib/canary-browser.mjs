import { pathToFileURL } from 'node:url';
import { launch } from './browser.mjs';

// Runs inside the synthetic page. The emit callback clones each event at capture
// time, before any recorder or page object can mutate a reference in the payload.
export async function captureCanary(cases, runId, trusted) {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 75));
  const recordings = {};
  const fill = trusted
    ? (selector, value) => new Promise((resolve) => { window.__canaryInput = { selector, value, resolve }; })
    : async (selector, value) => {
      const el = document.querySelector(selector);
      el.focus();
      el.value = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
      await settle();
    };
  for (const { id, makeFixture, options } of cases) {
    const { root, drive } = makeFixture();
    document.body.replaceChildren(root);
    await settle();
    const events = [];
    const stop = window.__auditRecord({ ...options, emit: (event) => events.push(JSON.parse(JSON.stringify(event))) });
    if (typeof stop !== 'function') throw new Error('rrweb did not start recording');
    try {
      await settle();
      await drive({ fill, settle });
      await settle();
      window.__auditRecord.takeFullSnapshot(true);
      await settle();
    } finally {
      stop();
    }
    recordings[id] = events;
  }
  return { runId, browser: navigator.userAgent, input: trusted ? 'browser keyboard' : 'scripted DOM input event', recordings };
}

const script = (source) => '<script>' + source.replace(/<\/script/gi, '<\\/script') + '</script>';

export function browserPage({ recorder, fixtureBundle, cases, runId }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Privacy canary</title></head>
<body><p>Recording synthetic fixtures…</p>
${script(recorder)}
${script(fixtureBundle)}
${script(`
window.addEventListener('load', async () => {
  document.querySelectorAll('script').forEach((node) => node.remove());
  try {
    const cases = ${JSON.stringify(cases)}.map(({ fixture, ...entry }) => ({
      ...entry,
      makeFixture: window.CanaryFixtures[fixture],
    }));
    const result = await (${captureCanary})(cases, ${JSON.stringify(runId)}, location.hash === '#trusted');
    window.__canaryResult = result;
    const heading = document.createElement('h1');
    heading.textContent = 'Synthetic browser recording complete';
    const detail = document.createElement('p');
    detail.textContent = Object.entries(result.recordings).map(([id, events]) => id + ': ' + events.length).join(' | ');
    const button = document.createElement('a');
    button.textContent = 'Download complete synthetic recording';
    button.href = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: 'application/json' }));
    button.download = 'privacy-canary-' + result.runId + '.json';
    document.body.replaceChildren(heading, detail, button);
  } catch (error) {
    window.__canaryError = String(error.stack || error);
    document.body.textContent = window.__canaryError;
  }
});
`)}
</body></html>`;
}

export async function runBrowserCanary(file, chrome) {
  const browser = await launch(chrome, { pipe: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });
    await page.emulateTimezone('UTC');
    await page.goto(`${pathToFileURL(file)}#trusted`, { waitUntil: 'load' });
    for (;;) {
      await page.waitForFunction(() => window.__canaryInput || window.__canaryResult || window.__canaryError, { timeout: 15000 });
      const state = await page.evaluate(() => {
        const { __canaryResult: result, __canaryError: error, __canaryInput: input } = window;
        return { result, error, input: input && { selector: input.selector, value: input.value } };
      });
      if (state.error) throw new Error(state.error);
      if (state.result) return { ...state.result, browser_version: await browser.version() };
      await page.click(state.input.selector);
      await page.keyboard.press('Home');
      await page.keyboard.down('Shift');
      await page.keyboard.press('End');
      await page.keyboard.up('Shift');
      await page.keyboard.type(state.input.value, { delay: 10 });
      await page.evaluate(() => {
        const input = window.__canaryInput;
        if (document.querySelector(input.selector).value !== input.value) throw new Error('Canary input value was not entered');
        window.__canaryInput = undefined;
        input.resolve();
      });
    }
  } finally {
    await browser.close();
  }
}
