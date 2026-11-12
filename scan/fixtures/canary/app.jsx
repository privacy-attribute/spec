// @jsx h

function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

const useCurrentUser = (model) => model.user;
const useFixtureCard = (model) => model.customer;

export function AccountPage(model) {
  const user = useCurrentUser(model);
  const card = useFixtureCard(model);
  const account = model.account;
  return (
    <main>
      <h1 id="canary-heading">CanaryPublicHeading</h1>
      <p id="canary-name">{user.fullName}</p>
      <label for="canary-notes">CanaryPublicNotesLabel</label>
      <input id="canary-notes" name="notes" value={user.notes} aria-describedby="canary-hint" />
      <p id="canary-hint">CanaryPublicHint</p>
      <p id="canary-customer">{card.handleCode}</p>
      <p id="canary-help" title="CanaryPublicTitle">CanaryPublicHelp</p>
      <output id="canary-key" data-token={account.apiKey}>{account.apiKey}</output>
      <button id="canary-button" type="button">CanaryPublicButton</button>
      <p id="canary-status">CanaryPublicIdle</p>
    </main>
  );
}
