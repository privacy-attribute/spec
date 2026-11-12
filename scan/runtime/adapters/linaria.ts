import runtimeStyled from 'fixture:linaria-styled';
import { compile, serialize, stringify } from 'stylis';

export { default as cx } from 'fixture:linaria-cx';

let styleElement: HTMLStyleElement | undefined;
let nextClass = 0;

export const installCss = (source: string) => {
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.setAttribute('data-fixture-styles', '');
    document.head.append(styleElement);
  }
  styleElement.append(serialize(compile(source), stringify));
};

const registerTemplate = (strings: TemplateStringsArray, values: unknown[]) => {
  const className = 'fixture-css-' + nextClass++;
  const vars = {};
  const source = strings.reduce((text, part, index) => {
    const value = values[index];
    if (typeof value !== 'function') return text + part + (value ?? '');
    const name = className + '-' + index;
    vars[name] = [value, ''];
    return text + part + 'var(--' + name + ')';
  }, '');
  installCss('.' + className + '{' + source + '}');
  return { className, vars };
};

export const css = (strings: TemplateStringsArray, ...values: unknown[]) =>
  registerTemplate(strings, values).className;

// Feed compiled template metadata to the pinned Linaria runtime. The runtime
// handles native tag creation, refs, DOM prop filtering and dynamic variables.
const styledTag = (tag: 'div' | 'input') =>
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const { className, vars } = registerTemplate(strings, values);
    return runtimeStyled(tag)({ class: className, name: className, vars });
  };

export const styled = { div: styledTag('div'), input: styledTag('input') };
