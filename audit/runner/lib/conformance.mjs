import { launch, startServer } from './browser.mjs';
import { record } from './run.mjs';

const expected = [
  ['public snapshot text', 'PASPublicBefore', true],
  ['public mutation text', 'PASPublicDuring', true],
  ['masked element structure', 'pas-masked', true],
  ['masked descendant text', 'PASPrivateTextBefore', false],
  ['masked descendant mutation', 'PASPrivateTextDuring', false],
  ['new masked descendant text', 'PASPrivateAddedText', false],
  ['masked title', 'PASPrivateTitle', false],
  ['masked aria-label mutation', 'PASPrivateAriaLabel', false],
  ['masked input value', 'PASPrivateInputBefore', false],
  ['masked input event', 'PASPrivateInputDuring', false],
  ['masked placeholder', 'PASPrivatePlaceholder', false],
  ['unknown value preserves element structure', 'pas-unknown', true],
  ['unknown value masks content', 'PASPrivateUnknown', false],
  ['empty value preserves element structure', 'pas-empty', true],
  ['empty value masks content', 'PASPrivateEmpty', false],
  ['block overrides a descendant annotation', 'pas-blocked-child', false],
  ['blocked descendant text', 'PASPrivateBlocked', false],
  ['blocked element attribute', 'PASPrivateBlockedAttribute', false],
  ['new blocked descendant', 'PASPrivateBlockedAdded', false],
  ['classification token retains masked structure', 'pas-token-mask', true],
  ['classification token masks text', 'PASPrivateTokenMask', false],
  ['block supersedes mask and classification', 'PASPrivateTokenBlock', false],
  ['block token omits URL', 'PASPrivateTokenURL', false],
  ['block token omits input', 'pas-token-input', false],
  ['block token omits input event', 'PASPrivateTokenInputDuring', false],
  ['block token omits mutation', 'PASPrivateTokenMutation', false],
  ['block first also supersedes mask', 'PASPrivateReverseBlock', false],
  ['block substring retains masked structure', 'pas-token-substring', true],
  ['unknown token masks text', 'PASPrivateTokenUnknown', false],
];

const journey = {
  pattern: 'privacy-attribute',
  async run({ page, fill, wait }) {
    await page.evaluate(() => {
      document.querySelector('#pas-public').firstChild.data = 'PASPublicDuring';
      document.querySelector('#pas-masked span').firstChild.data = 'PASPrivateTextDuring';
      document.querySelector('#pas-masked').setAttribute('aria-label', 'PASPrivateAriaLabel');
      document.querySelector('#pas-masked').insertAdjacentHTML('beforeend', '<p>PASPrivateAddedText</p>');
      document.querySelector('#pas-blocked').insertAdjacentHTML('beforeend', '<p>PASPrivateBlockedAdded</p>');
    });
    await fill('#pas-input', 'PASPrivateInputDuring', 15);
    await fill('#pas-token-input', 'PASPrivateTokenInputDuring', 15);
    await page.evaluate(() => {
      document.querySelector('#pas-token-block a').setAttribute('href', '/PASPrivateTokenMutation');
    });
    await wait(100);
    // Clear the values before the final snapshot so these checks exercise live updates.
    await page.evaluate(() => document.querySelector('main').remove());
  },
};

const fixture = {
  html: () => `<main>
  <p id="pas-public">PASPublicBefore</p>
  <section id="pas-masked" data-privacy="mask" title="PASPrivateTitle">
    <span>PASPrivateTextBefore</span>
    <input id="pas-input" value="PASPrivateInputBefore" placeholder="PASPrivatePlaceholder">
  </section>
  <p id="pas-unknown" data-privacy="msak">PASPrivateUnknown</p>
  <p id="pas-empty" data-privacy="">PASPrivateEmpty</p>
  <section id="pas-blocked" data-privacy="block" data-example="PASPrivateBlockedAttribute">
    <p id="pas-blocked-child" data-privacy="unmask">PASPrivateBlocked</p>
  </section>
  <p id="pas-token-mask" data-privacy="mask confidential">PASPrivateTokenMask</p>
  <section id="pas-token-block" data-privacy="mask confidential block">
    <a href="/PASPrivateTokenURL">PASPrivateTokenBlock</a>
    <input id="pas-token-input" value="PASPrivateTokenInputBefore">
  </section>
  <section data-privacy="block restricted mask"><span>PASPrivateReverseBlock</span></section>
  <p id="pas-token-substring" data-privacy="blocked">PASPrivateTokenUnknown</p>
</main>`,
};

export async function checkPrivacyAttribute({ adapter, sdk, bundle, chrome }) {
  const config = adapter.configs.find((entry) => entry.id === 'privacy-attribute');
  if (!config) throw new Error(`The ${adapter.name} adapter has no privacy-attribute config`);
  const { script, target } = await adapter.prepare({ sdk, bundle });
  const server = await startServer();
  let browser;
  try {
    browser = await launch(chrome);
    const { events } = await record({
      browser, server, script, fixture, journeys: [journey], values: {}, config,
    });
    const recording = JSON.stringify(events);
    const checks = expected.map(([name, marker, present]) => ({
      name,
      passed: recording.includes(marker) === present,
    }));
    return { target, checks };
  } finally {
    server.close();
    await browser?.close();
  }
}
