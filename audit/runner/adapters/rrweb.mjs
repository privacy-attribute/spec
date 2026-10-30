// rrweb adapter: builds the recorder from an rrweb checkout, defines the config matrix,
// and maps rrweb events to the channel ids in patterns.yaml.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

// Selectors built from the fixture labels (data-audit-category, data-audit-block).
const PRIVATE = '[data-audit-category="secret"],[data-audit-category="personal"],[data-audit-category="third-party"]';
const STRICT = {
  maskAllInputs: true,
  maskTextSelector: '*',
  blockSelector: 'img,picture,video,audio,canvas,object,embed,iframe',
  ignoreSelector: 'input,textarea,select',
  slimDOMOptions: 'all',
  inlineStylesheet: false,
  recordCanvas: false,
  inlineImages: false,
  collectFonts: false,
  recordCrossOriginIframes: false,
};

// `__mask` is resolved in the page into maskInputFn and maskTextFn: 'constant' or 'bucket'.
const configs = [
  { id: 'targeted', fidelity: true, options: { maskAllInputs: true, maskTextSelector: PRIVATE, blockSelector: '[data-audit-block]' }, note: 'Mask labelled private elements, block labelled widgets, record public content.' },
  { id: 'default-core', fidelity: true, options: {} },
  { id: 'default-browser-client', options: { maskAllInputs: true, slimDOMOptions: 'all', inlineStylesheet: true }, note: 'Defaults set by packages/browser-client/src/index.ts start().' },
  { id: 'strictest', fidelity: true, options: STRICT },
  { id: 'strictest-block', options: { ...STRICT, blockSelector: `${STRICT.blockSelector},[data-audit-block]` } },
  { id: 'strictest-custom', options: { ...STRICT, __mask: 'constant' } },
  { id: 'custom-nonconstant', options: { ...STRICT, ignoreSelector: null, __mask: 'bucket' } },
  { id: 'opt-in:recordCanvas', optIn: true, options: { recordCanvas: true } },
  { id: 'opt-in:inlineImages', optIn: true, options: { inlineImages: true } },
  { id: 'opt-in:network', optIn: true, options: { __network: true } },
];

const GLUE = `
(() => {
  if (window.top !== window || window.__audit) return;
  const events = [];
  let stop = null;
  window.__audit = {
    events,
    start(o) {
      const opts = { ...o };
      const mask = opts.__mask; delete opts.__mask;
      const network = opts.__network; delete opts.__network;
      if (mask === 'constant') { opts.maskInputFn = () => '*'; opts.maskTextFn = () => '*'; }
      if (mask === 'bucket') {
        const b = (s) => '*'.repeat(Math.ceil(String(s).length / 8) * 8);
        opts.maskInputFn = b; opts.maskTextFn = b;
      }
      if (network && window.__auditPlugins && window.__auditPlugins.network) opts.plugins = [window.__auditPlugins.network()];
      for (const k of Object.keys(opts)) if (opts[k] === null) delete opts[k];
      stop = window.__auditRecord({ ...opts, emit: (e) => events.push(e) });
    },
    finish() {
      // A second full snapshot, as checkoutEveryNms or a page visibility change would take.
      window.__auditRecord.takeFullSnapshot(true);
      if (stop) stop();
    },
  };
})();
`;

function packageVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch { return null; }
}

async function build(sdk) {
  const P = path.join(sdk, 'packages');
  const network = path.join(P, 'plugins/rrweb-plugin-network-record/src/index.ts');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-audit-'));
  const entry = path.join(tmp, 'entry.ts');
  fs.writeFileSync(entry, [
    `import record from ${JSON.stringify(path.join(P, 'rrweb/src/record/index.ts'))};`,
    `window.__auditRecord = record;`,
    fs.existsSync(network) ? `import { getRecordNetworkPlugin } from ${JSON.stringify(network)};\nwindow.__auditPlugins = { network: () => getRecordNetworkPlugin({}) };` : '',
  ].join('\n'));
  const out = path.join(tmp, 'bundle.js');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    outfile: out,
    logLevel: 'error',
    alias: {
      'rrweb-snapshot': path.join(P, 'rrweb-snapshot/src/index.ts'),
      rrdom: path.join(P, 'rrdom/src/index.ts'),
      rrweb: path.join(P, 'rrweb/src/index.ts'),
      '@rrweb/types': path.join(P, 'types/src/index.ts'),
      '@rrweb/utils': path.join(P, 'utils/src/index.ts'),
    },
    // Third-party dependencies resolve from the checkout, or from NODE_PATH for an extracted copy.
    nodePaths: [path.join(sdk, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
    plugins: [{
      // Worker imports (canvas FPS mode) are stubbed: that mode is not exercised by the fixtures.
      name: 'stub-worker',
      setup(b) {
        b.onResolve({ filter: /\?worker/ }, (a) => ({ path: a.path, namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default class { postMessage(){} terminate(){} };', loader: 'js' }));
      },
    }],
  });
  return fs.readFileSync(out, 'utf8');
}

async function prepare({ sdk, bundle }) {
  if (!sdk && !bundle) throw new Error('rrweb adapter needs --sdk <rrweb checkout or extracted source> or --bundle <file>');
  const recorder = bundle ? fs.readFileSync(bundle, 'utf8') : await build(path.resolve(sdk));
  let commit = null;
  if (sdk) {
    try { commit = execFileSync('git', ['-C', sdk, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout */ }
  }
  const P = sdk ? path.join(path.resolve(sdk), 'packages') : null;
  return {
    script: recorder + '\n' + GLUE,
    target: {
      repo: 'rrweb-io/rrweb',
      commit,
      source: sdk ? path.resolve(sdk) : path.resolve(bundle),
      packages: P ? Object.fromEntries(['rrweb', 'rrweb-snapshot', 'browser-client'].map((n) => [n === 'browser-client' ? '@rrweb/browser-client' : n, packageVersion(path.join(P, n))])) : {},
    },
  };
}

// --- normalisation: one line per observable fact, tagged with a channel id ---

const masked = (s) => typeof s === 'string' && /^(?=.*\*)[*\s]+$/.test(s);

// rrweb node ids are assigned in document order, so a value that adds nodes early on the page
// shifts every later id. Lines use a stable key instead: the nearest labelled ancestor
// (data-audit-id) plus the child-index path below it.
function nodeKeys() {
  const reg = new Map();
  const counts = new Map();
  const register = (node, parent) => {
    const idx = counts.get(parent) ?? 0;
    counts.set(parent, idx + 1);
    reg.set(node.id, { parent, idx, audit: node.attributes?.['data-audit-id'] });
    (node.childNodes || []).forEach((c) => register(c, node.id));
    if (node.contentDocument) register(node.contentDocument, node.id);
  };
  const key = (id) => {
    if (id === undefined || id === null || id < 0) return 'none';
    const path = [];
    let cur = id;
    while (reg.has(cur)) {
      const r = reg.get(cur);
      if (r.audit !== undefined) return `@${r.audit}${path.length ? '/' + path.reverse().join('.') : ''}`;
      path.push(r.idx);
      cur = r.parent;
    }
    return path.length ? `/${path.reverse().join('.')}` : 'unknown';
  };
  const reset = () => { reg.clear(); counts.clear(); };
  return { register, key, reset };
}

function attrLines(prefix, k, tag, attrs, out) {
  for (const [name, v] of Object.entries(attrs || {})) {
    let channel = 'attribute';
    if (name === 'value') channel = masked(v) ? 'value-length' : 'input-value';
    else if (name === 'checked') channel = 'checked-state';
    else if (name === 'selected') channel = 'select-state';
    else if (name === 'rr_width' || name === 'rr_height') channel = 'layout-size';
    else if (name === 'src' || name === 'srcset' || name === 'rr_dataURL') channel = tag === 'iframe' ? 'iframe' : 'image';
    else if (name === '_cssText') channel = 'stylesheet';
    else if (name === 'href' && tag === 'a') channel = 'url';
    else if (name === 'rr_src') channel = 'iframe';
    out.push({ channel, text: `${prefix} ${k} <${tag}> ${name}=${JSON.stringify(v)}` });
  }
}

function flatten(node, prefix, out, K, ctx = {}) {
  if (!node) return;
  const k = K.key(node.id);
  if (node.type === 2) {
    const inShadow = ctx.shadow || node.isShadowHost;
    out.push({ channel: inShadow ? 'shadow-dom' : 'attribute', text: `${prefix} ${k} <${node.tagName}>` });
    attrLines(prefix, k, node.tagName, node.attributes, out);
    const inner = { ...ctx, style: node.tagName === 'style', title: node.tagName === 'title', svg: ctx.svg || node.isSVG };
    (node.childNodes || []).forEach((c) => flatten(c, prefix, out, K, { ...inner, shadow: ctx.shadow || c.isShadow }));
    if (node.contentDocument) flatten(node.contentDocument, prefix, out, K, { ...inner, frame: true });
  } else if (node.type === 3) {
    const t = node.textContent ?? '';
    const channel = ctx.style ? 'stylesheet' : ctx.title ? 'title-meta' : ctx.shadow ? 'shadow-dom' : ctx.frame ? 'iframe' : masked(t) ? 'value-length' : 'text';
    out.push({ channel, text: `${prefix} ${k} text ${JSON.stringify(t)}` });
  } else if (node.type === 5) {
    out.push({ channel: 'text', text: `${prefix} ${k} comment ${JSON.stringify(node.textContent)}` });
  } else {
    (node.childNodes || []).forEach((c) => flatten(c, prefix, out, K, ctx));
  }
}

const MOUSE = ['mouseup', 'mousedown', 'click', 'contextmenu', 'dblclick', 'focus', 'blur', 'touchstart', 'touchmove_departed', 'touchend', 'touchcancel'];

function normalise(events) {
  const lines = [];
  const gaps = [];
  const K = nodeKeys();
  const k = K.key;
  let prev = events[0]?.timestamp ?? 0;
  let snapshots = 0;
  for (const e of events) {
    gaps.push(e.timestamp - prev);
    prev = e.timestamp;
    if (e.type === 4) {
      lines.push({ channel: 'url', text: `meta href=${e.data.href}` });
      lines.push({ channel: 'viewport', text: `meta size=${e.data.width}x${e.data.height}` });
    } else if (e.type === 2) {
      K.reset();
      K.register(e.data.node, null);
      flatten(e.data.node, `full${snapshots++}`, lines, K);
    } else if (e.type === 3) {
      const d = e.data;
      switch (d.source) {
        case 0:
          d.removes.forEach((r) => lines.push({ channel: 'text', text: `remove ${k(r.id)}` }));
          d.adds.forEach((a) => { K.register(a.node, a.parentId); flatten(a.node, `add ${k(a.parentId)}`, lines, K); });
          d.texts.forEach((t) => lines.push({ channel: masked(t.value) ? 'value-length' : 'text', text: `text ${k(t.id)} ${JSON.stringify(t.value)}` }));
          d.attributes.forEach((a) => attrLines('attr', k(a.id), '', a.attributes, lines));
          break;
        case 1: case 12:
          d.positions.forEach((p) => lines.push({ channel: 'pointer-path', text: `move ${k(p.id)} ${p.x},${p.y}` }));
          break;
        case 6:
          d.positions.forEach((p) => lines.push({ channel: 'touch-path', text: `touchmove ${k(p.id)} ${p.x},${p.y}` }));
          break;
        case 2: {
          const kind = MOUSE[d.type] ?? `type${d.type}`;
          const channel = kind === 'focus' || kind === 'blur' ? 'focus' : 'click-target';
          lines.push({ channel, text: `${kind} ${k(d.id)}${d.x !== undefined ? ` ${Math.round(d.x)},${Math.round(d.y)}` : ''}` });
          break;
        }
        case 3: lines.push({ channel: 'scroll', text: `scroll ${k(d.id)} ${d.x},${d.y}` }); break;
        case 4: lines.push({ channel: 'viewport', text: `viewport ${d.width}x${d.height}` }); break;
        case 5:
          lines.push({ channel: masked(d.text) ? 'value-length' : 'input-value', text: `input ${k(d.id)} ${JSON.stringify(d.text)}` });
          lines.push({ channel: 'checked-state', text: `input ${k(d.id)} checked=${d.isChecked}` });
          lines.push({ channel: 'key-count', text: `input-event ${k(d.id)}` });
          break;
        case 7: lines.push({ channel: 'attribute', text: `media ${k(d.id)} ${d.type}` }); break;
        case 8: case 13: case 15: lines.push({ channel: 'stylesheet', text: `css ${JSON.stringify({ ...d, source: undefined })}` }); break;
        case 9: lines.push({ channel: 'canvas', text: `canvas ${k(d.id)} ${JSON.stringify(d.commands || d.args || d.property || '').slice(0, 400)}` }); break;
        case 10: lines.push({ channel: 'stylesheet', text: `font ${d.family}` }); break;
        case 14: lines.push({ channel: 'selection', text: `selection ${JSON.stringify((d.ranges || []).map((r) => ({ ...r, start: k(r.start), end: k(r.end) })))}` }); break;
        case 16: lines.push({ channel: 'shadow-dom', text: `custom-element ${JSON.stringify(d.define)}` }); break;
        default: lines.push({ channel: 'attribute', text: `source${d.source} ${JSON.stringify(d).slice(0, 300)}` });
      }
    } else if (e.type === 6) {
      const isNet = /network/.test(e.data.plugin || '');
      lines.push({ channel: isNet ? 'network' : 'attribute', text: `plugin ${e.data.plugin} ${JSON.stringify(e.data.payload).slice(0, 400)}` });
    } else if (e.type === 5) {
      lines.push({ channel: 'attribute', text: `custom ${e.data.tag} ${JSON.stringify(e.data.payload).slice(0, 200)}` });
    }
  }
  return { lines, gaps };
}

// Public elements as the last full snapshot records them, keyed by data-audit-id.
function publicFromEvents(events) {
  const full = [...events].reverse().find((e) => e.type === 2);
  const out = {};
  if (!full) return out;
  const text = (n) => (n.type === 3 ? n.textContent || '' : (n.childNodes || []).map(text).join(''));
  const walk = (n) => {
    if (n.type === 2 && n.attributes?.['data-audit-category'] === 'public') {
      out[n.attributes['data-audit-id']] = {
        text: text(n).replace(/\s+/g, ' ').trim(),
        src: n.attributes.src ?? null,
        inlined: Boolean(n.attributes.rr_dataURL),
      };
    }
    (n.childNodes || []).forEach(walk);
  };
  walk(full.data.node);
  return out;
}

export default { name: 'rrweb', configs, prepare, normalise, publicFromEvents };
