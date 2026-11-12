import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { ApiKeyInput } from '@/settings/developers/components/ApiKeyInput';
import { EmailDisplay } from '@/ui/field/display/components/EmailDisplay';
import { ContactLink } from '@/ui/field/display/components/internal/ContactLink/ContactLink';
import { TextInput } from '@/ui/input/components/TextInput';
import { observations } from './platform';

type Kind = 'key' | 'email' | 'text' | 'public-link';
type Value = string | null | undefined;
type FixtureProps = Record<string, unknown>;

let root: Root | undefined;
let current: { kind: Kind; value: Value; props: FixtureProps } | undefined;

// Give the real clipboard hook a local sink even if a clipboard is available.
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    async writeText(value: string) {
      observations.clipboard.push(value);
    },
  },
});

const renderComponent = ({ kind, value, props }: NonNullable<typeof current>) => {
  switch (kind) {
    case 'key':
      return <ApiKeyInput apiKey={value as string} />;
    case 'email':
      return <EmailDisplay {...props} value={value} />;
    case 'text':
      return (
        <TextInput
          {...props}
          value={value}
          onChange={(text) => {
            observations.inputChanges.push(text);
            update(text);
          }}
        />
      );
    case 'public-link':
      return <ContactLink href={value as string}>{props.children ?? 'Public link'}</ContactLink>;
  }
};

const render = () => {
  const mountedRoot = root;
  const state = current;
  if (!mountedRoot || !state) throw new Error('Mount the Twenty fixture first.');
  flushSync(() => {
    mountedRoot.render(
      <>
        <div data-fixture-component={state.kind}>{renderComponent(state)}</div>
        <button type="button" data-fixture-public>TWENTY_PUBLIC_CONTROL</button>
      </>,
    );
  });
};

const unmount = () => {
  root?.unmount();
  root = undefined;
  current = undefined;
};

function update(value: Value, props: FixtureProps = {}) {
  if (!current) throw new Error('Mount the Twenty fixture first.');
  current = { ...current, value, props: { ...current.props, ...props } };
  render();
}

const mount = (kind: Kind, value: Value, props: FixtureProps = {}) => {
  const container = document.getElementById('twenty-fixture');
  if (!container) throw new Error('Missing #twenty-fixture mount element.');
  unmount();
  observations.clipboard.length = 0;
  observations.inputChanges.length = 0;
  observations.toasts.length = 0;
  root = createRoot(container);
  current = { kind, value, props };
  render();
};

Object.assign(globalThis, { TwentyRuntime: { mount, update, unmount, observations } });
