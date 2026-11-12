import { cloneElement, createElement, type ReactElement } from 'react';

export const isFunction = (value: unknown) => typeof value === 'function';
export const isNull = (value: unknown) => value === null;
export const isUndefined = (value: unknown) => value === undefined;
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const tokens = (prefix: string, names: string[]) =>
  Object.fromEntries(
    names.map((name) => [name, 'var(--t-' + prefix + '-' + name + ')']),
  );

export const themeCssVariables = {
  spacing: tokens('spacing', ['0.5', '1', '2', '3', '5']),
  background: { transparent: tokens('background-transparent', ['light', 'lighter']) },
  border: {
    color: tokens('border-color', ['medium', 'danger']),
    radius: tokens('border-radius', ['md']),
  },
  color: tokens('color', ['blue']),
  font: {
    family: 'var(--t-font-family)',
    size: tokens('font-size', ['md']),
    weight: tokens('font-weight', ['regular', 'medium']),
    color: tokens('font-color', ['primary', 'secondary', 'tertiary', 'light']),
  },
};
export const useTheme = () => ({ icon: { size: { md: 16 } } });

const translate = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
export const useLingui = () => ({ t: translate });

export const Key = { Enter: 'Enter', Escape: 'Escape' };
export const usePushFocusItemToFocusStack = () => ({
  pushFocusItemToFocusStack: () => {},
});
export const useRemoveFocusItemFromFocusStackById = () => ({
  removeFocusItemFromFocusStackById: () => {},
});
export const useHotkeysOnFocusedElement = () => {};

export const observations = {
  clipboard: [] as string[],
  inputChanges: [] as string[],
  toasts: [] as { status: string; message: string }[],
};

export const useToast = () => ({
  enqueueToast: ({ status, children }: { status: string; children: string }) => {
    observations.toasts.push({ status, message: children });
  },
});

const Icon = () => <span aria-hidden="true" />;
export const IconCopy = Icon;
export const IconEye = Icon;
export const IconEyeOff = Icon;
export const IconExclamationCircle = Icon;

export const Button = ({ startIcon, children, onClick }) => (
  <button type="button" onClick={onClick}>
    {startIcon}
    {children}
  </button>
);

const renderFieldPart = (tag: 'label' | 'p' | 'div') =>
  ({ className, match, ...props }) =>
    createElement(tag, {
      ...props,
      className: typeof className === 'function' ? className({}) : className,
    });

export const Field = {
  Root: ({ render, children }: { render: ReactElement; children: React.ReactNode }) =>
    cloneElement(render, undefined, children),
  Label: renderFieldPart('label'),
  Description: renderFieldPart('p'),
  Error: renderFieldPart('div'),
};

export const useRender = ({ render, ref, props }) =>
  render ? cloneElement(render, { ...props, ref }) : createElement('div', { ...props, ref });
