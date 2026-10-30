// Drafts privacy-audit.json from runner results, so the agent only fills in what needs judgement:
// the code path, the fix and the verdict. One draft finding per channel and data category.
import fs from 'node:fs';
import path from 'node:path';

// Taxonomy leak class for each channel (see taxonomy.md).
const LEAK_CLASS = {
  'input-value': 'input-value', 'value-length': 'length-side-channel', 'emit-timing': 'timing-side-channel',
  'key-count': 'keystroke-dynamics', 'key-timing': 'keystroke-dynamics', 'checked-state': 'checked-state',
  'select-state': 'option-selected', focus: 'interaction-target', 'click-target': 'interaction-target',
  'pointer-path': 'pointer-position', 'touch-path': 'pointer-position', 'hover-state': 'widget-state',
  attribute: 'attribute', text: 'text-node', 'title-meta': 'url-meta', url: 'url-meta', stylesheet: 'css',
  canvas: 'media', image: 'media', iframe: 'coverage-gap', 'shadow-dom': 'coverage-gap', network: 'console-network',
  clipboard: 'clipboard-ime', selection: 'pointer-position', scroll: 'pointer-position', viewport: 'keystroke-dynamics',
  'layout-size': 'layout-size',
};

// Channels that carry the value itself, or enough to rebuild it with knowledge of the page layout.
const RECOVERABLE = new Set(['input-value', 'checked-state', 'select-state', 'click-target', 'pointer-path', 'touch-path',
  'attribute', 'text', 'title-meta', 'url', 'stylesheet', 'canvas', 'image', 'iframe', 'shadow-dom', 'network', 'clipboard']);

const STRICT = ['targeted', 'strictest', 'strictest-block', 'strictest-custom', 'custom-nonconstant'];
const PRIVACY_ORDER = ['strictest-block', 'strictest', 'targeted', 'strictest-custom', 'custom-nonconstant'];
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const CATEGORY_ORDER = ['secret', 'special', 'third-party', 'personal'];

// The Severity table in AGENTS.md.
export function grade({ category, special, recoverable, leaksUnder }) {
  const strict = leaksUnder.some((c) => STRICT.includes(c));
  const byDefault = leaksUnder.some((c) => c.startsWith('default-'));
  if (!strict && !byDefault) return 'low';
  if (category === 'secret') return 'critical';
  if (category === 'third-party' || (category === 'personal' && special)) {
    if (recoverable) return strict ? 'critical' : 'high';
    if (category === 'third-party') return 'medium';
    return strict ? 'high' : 'medium';
  }
  if (recoverable) return 'high';
  return strict ? 'medium' : 'low';
}

export function disclaimer(auditDir) {
  const text = fs.readFileSync(path.join(auditDir, 'AGENTS.md'), 'utf8');
  const m = text.match(/## Responsibility\n\n([^\n]+)/);
  return m ? m[1] : null;
}

export function draftFindings({ out, patterns, codeMap, auditDir }) {
  const rows = out.differential.filter((r) => !r.error && r.category && r.category !== 'public');
  const clusters = new Map();
  for (const r of rows) {
    const channels = Object.keys(r.channels || {});
    if (r.timing?.differs) channels.push('key-timing');
    for (const channel of new Set(channels)) {
      const key = `${channel}|${r.category}`;
      if (!clusters.has(key)) clusters.set(key, { channel, category: r.category, rows: [], evaluated: new Set() });
      clusters.get(key).rows.push(r);
    }
  }
  // Configs evaluated for a cluster: every config run on any of its patterns.
  for (const c of clusters.values()) {
    const ids = new Set(c.rows.map((r) => r.pattern));
    out.differential.filter((r) => ids.has(r.pattern)).forEach((r) => c.evaluated.add(r.config));
  }

  const findings = [...clusters.values()].map((c) => {
    const leaksUnder = [...new Set(c.rows.map((r) => r.config))];
    const patternIds = [...new Set(c.rows.map((r) => r.pattern))]
      .sort((a, b) => (patterns.get(a)?.rank ?? 999) - (patterns.get(b)?.rank ?? 999));
    const special = patternIds.some((p) => patterns.get(p)?.special_category);
    const recoverable = RECOVERABLE.has(c.channel);
    const evidence = [...c.rows]
      .sort((a, b) => (PRIVACY_ORDER.indexOf(a.config) + 99) % 99 - (PRIVACY_ORDER.indexOf(b.config) + 99) % 99)
      .slice(0, 3)
      .map((r) => ({
        pattern: r.pattern,
        config: r.config,
        a: r.channels[c.channel]?.a?.slice(0, 2) ?? [`timing gaps differ: ${JSON.stringify(r.timing)}`],
        b: r.channels[c.channel]?.b?.slice(0, 2) ?? [],
      }));
    const leakClass = c.category === 'third-party' && ['text', 'attribute', 'image'].includes(c.channel) ? 'third-party-content' : LEAK_CLASS[c.channel] || c.channel;
    return {
      id: null,
      fingerprint: `${leakClass}:${c.channel}:${c.category}`,
      kind: 'privacy',
      channel: c.channel,
      leak_class: leakClass,
      data_category: c.category,
      special_category: special,
      pattern: patternIds[0],
      pattern_rank: patterns.get(patternIds[0])?.rank ?? null,
      patterns: patternIds,
      title: `${c.channel} differs with the hidden value for ${c.category}${special ? ' (special category)' : ''} data: ${patternIds.slice(0, 4).join(', ')}${patternIds.length > 4 ? ` and ${patternIds.length - 4} more` : ''}`,
      sink: null,
      code: codeMap[c.channel]?.code ?? [],
      code_note: codeMap[c.channel]?.note ?? null,
      path: null,
      masking_checked: null,
      leaks_under: leaksUnder,
      safe_under: [...c.evaluated].filter((x) => !leaksUnder.includes(x)),
      not_evaluated: out.configs.map((x) => x.id).filter((x) => !c.evaluated.has(x)),
      severity: grade({ category: c.category, special, recoverable, leaksUnder }),
      recoverable,
      verdict: 'CONFIRMED',
      affected_since: null,
      affected_since_exact: false,
      status: 'new',
      reproduction: { runner: 'results.json differential[] rows for these patterns and configs', evidence },
      fix: null,
      fidelity_cost: null,
    };
  });

  // Number and range magnitude is its own finding (taxonomy class 2): the fix differs from text length.
  const NUMERIC = ['P-input-types', 'P-slider-secret'];
  const magnitude = findings.find((f) => f.channel === 'value-length' && f.data_category === 'personal' && f.patterns.some((p) => NUMERIC.includes(p)));
  if (magnitude) {
    findings.push({
      ...magnitude,
      fingerprint: 'length-side-channel:value-length:magnitude',
      channel: 'value-length-magnitude',
      patterns: magnitude.patterns.filter((p) => NUMERIC.includes(p)),
      pattern: magnitude.patterns.find((p) => NUMERIC.includes(p)),
      title: 'Masked number and range inputs keep one mask character per digit, so the order of magnitude (salary, age, balance) leaks',
      recoverable: false,
      severity: grade({ category: 'personal', special: false, recoverable: false, leaksUnder: magnitude.leaks_under }),
      reproduction: {
        runner: 'results.json differential[] rows for P-input-types (number 42 vs 125000) and P-slider-secret',
        evidence: rows.filter((r) => NUMERIC.includes(r.pattern) && r.channels['value-length'] && PRIVACY_ORDER.includes(r.config)).slice(0, 3)
          .map((r) => ({ pattern: r.pattern, config: r.config, a: r.channels['value-length'].a.slice(0, 2), b: r.channels['value-length'].b.slice(0, 2) })),
      },
    });
  }

  // Default divergence: a value channel that leaks under one package's defaults and not another's.
  // Pointer, timing and count channels are left out: they vary between runs of any config.
  const VALUE = new Set(['input-value', 'text', 'attribute', 'checked-state', 'select-state', 'url', 'title-meta', 'image']);
  const defaults = out.configs.map((c) => c.id).filter((id) => id.startsWith('default-'));
  if (defaults.length > 1) {
    const diverge = new Map();
    const byPattern = new Map();
    for (const r of rows.filter((x) => defaults.includes(x.config))) {
      if (!byPattern.has(r.pattern)) byPattern.set(r.pattern, new Map());
      byPattern.get(r.pattern).set(r.config, new Set(Object.keys(r.channels || {}).filter((c) => VALUE.has(c))));
    }
    for (const [pattern, perConfig] of byPattern) {
      for (const channel of new Set([...perConfig.values()].flatMap((x) => [...x]))) {
        const leaking = defaults.filter((d) => perConfig.get(d)?.has(channel));
        const safe = defaults.filter((d) => perConfig.has(d) && !perConfig.get(d).has(channel));
        if (leaking.length && safe.length) {
          const key = `${leaking.join('+')}>${safe.join('+')}`;
          if (!diverge.has(key)) diverge.set(key, { leaking, safe, items: [] });
          diverge.get(key).items.push({ pattern, channel });
        }
      }
    }
    for (const d of diverge.values()) {
      const patternIds = [...new Set(d.items.map((i) => i.pattern))].sort((a, b) => (patterns.get(a)?.rank ?? 999) - (patterns.get(b)?.rank ?? 999));
      const secret = patternIds.some((p) => patterns.get(p)?.category === 'secret');
      findings.push({
        id: null,
        fingerprint: `default-divergence:${d.leaking.join('+')}:${d.safe.join('+')}`,
        kind: 'privacy',
        channel: 'default-divergence',
        leak_class: 'default-divergence',
        data_category: secret ? 'secret' : 'personal',
        special_category: patternIds.some((p) => patterns.get(p)?.special_category),
        pattern: patternIds[0],
        pattern_rank: patterns.get(patternIds[0])?.rank ?? null,
        patterns: patternIds,
        title: `Defaults differ: ${d.leaking.join(', ')} leaks what ${d.safe.join(', ')} protects (${[...new Set(d.items.map((i) => i.channel))].join(', ')}) for ${patternIds.slice(0, 4).join(', ')}${patternIds.length > 4 ? ` and ${patternIds.length - 4} more` : ''}`,
        sink: null,
        code: [],
        code_note: 'Compare the default option values each package sets before calling the recorder.',
        path: null,
        masking_checked: null,
        leaks_under: d.leaking,
        safe_under: d.safe,
        not_evaluated: [],
        severity: secret ? 'critical' : 'high',
        recoverable: d.items.some((i) => RECOVERABLE.has(i.channel)),
        verdict: 'CONFIRMED',
        affected_since: null,
        affected_since_exact: false,
        status: 'new',
        reproduction: { runner: 'results.json differential[] rows under the default configs', evidence: d.items.slice(0, 3) },
        fix: null,
        fidelity_cost: null,
      });
    }
  }

  // Fidelity: public elements lost or changed, one draft per config across all pages.
  const fidelityByConfig = new Map();
  for (const f of out.fidelity.filter((x) => !x.error && x.mismatches.length)) {
    if (!fidelityByConfig.has(f.config)) fidelityByConfig.set(f.config, []);
    fidelityByConfig.get(f.config).push(f);
  }
  for (const [config, pages] of fidelityByConfig) {
    const targeted = config === 'targeted';
    const total = pages.reduce((n, p) => n + p.mismatches.length, 0);
    findings.push({
      id: null,
      fingerprint: `${targeted ? 'replay-distortion' : 'over-masking'}:public:${config}`,
      kind: 'fidelity',
      channel: null,
      leak_class: targeted ? 'replay-distortion' : 'over-masking',
      data_category: 'public',
      special_category: false,
      pattern: null,
      pattern_rank: null,
      title: `${total} public elements on ${pages.length} pages differ from the live page under ${config}`,
      leaks_under: [config],
      safe_under: [],
      not_evaluated: [],
      severity: targeted ? 'high' : config.startsWith('default-') ? 'medium' : 'low',
      verdict: 'CONFIRMED',
      reproduction: { runner: 'results.json fidelity[]', evidence: pages.slice(0, 3).map((p) => ({ page: p.page, mismatches: p.mismatches.slice(0, 2) })) },
      path: null,
      fix: null,
      fidelity_cost: null,
    });
  }

  const catRank = (f) => CATEGORY_ORDER.indexOf(f.special_category && f.data_category === 'personal' ? 'special' : f.data_category);
  const privRank = (f) => Math.min(...f.leaks_under.map((c) => (PRIVACY_ORDER.indexOf(c) + 99) % 99));
  findings.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'privacy' ? -1 : 1)
    || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    || catRank(a) - catRank(b)
    || Number(b.recoverable) - Number(a.recoverable)
    || privRank(a) - privRank(b));
  findings.forEach((f, i) => { f.id = `F${i + 1}`; });

  const byPattern = new Map();
  for (const r of out.differential) {
    if (!byPattern.has(r.pattern)) byPattern.set(r.pattern, { pattern: r.pattern, configs: new Set(), findings: new Set() });
    byPattern.get(r.pattern).configs.add(r.config);
  }
  for (const f of findings) for (const p of f.patterns || []) byPattern.get(p)?.findings.add(f.id);

  return {
    disclaimer: disclaimer(auditDir),
    audit_version: out.audit_version,
    audit_source: path.join(auditDir, 'AGENTS.md'),
    target: out.target,
    previous_audit: null,
    method_note: `Differential and end-state fidelity results from the audit runner ${out.runner_version} (${out.differential.length} differential runs, value A run twice as a noise baseline). Findings are drafts grouped by channel and data category; path, fix and verdict come from the agent's trace.`,
    configs: out.configs,
    sinks: Object.entries(codeMap).flatMap(([channel, v]) => v.code.filter((c) => c.file).map((c) => ({ channel, ...c }))),
    findings,
    resolved: [],
    feedback_applied: [],
    feedback_sent: [],
    pattern_coverage: [
      ...[...byPattern.values()].map((p) => ({ pattern: p.pattern, configs: [...p.configs], result: p.findings.size ? [...p.findings].join(', ') : 'no finding' })),
      ...out.not_run.map((n) => ({ pattern: n.pattern, configs: [], result: `not run: ${n.reason}` })),
    ],
    coverage: [],
  };
}

// Applies the agent's traces.json to the draft and checks every finding is complete.
export function merge(draft, traces) {
  const dropped = [];
  const findings = [];
  for (const f of draft.findings) {
    const byChannel = (f.channel && traces.channels?.[f.channel]) || {};
    const override = traces.findings?.[f.id] || {};
    if (override.drop) { dropped.push({ id: f.id, fingerprint: f.fingerprint, reason: override.drop }); continue; }
    const merged = { ...f, ...byChannel, ...override };
    if (!merged.sink && merged.path?.[0]) {
      const m = String(merged.path[merged.path.length - 1]).match(/^(\S+?):(\d+)/);
      if (m) merged.sink = { file: m[1], line: Number(m[2]) };
    }
    delete merged.code;
    delete merged.code_note;
    findings.push(merged);
  }
  for (const extra of traces.extra_findings || []) findings.push({ ...extra, id: `F${findings.length + 1}` });
  const incomplete = findings.filter((f) => !Array.isArray(f.path) || f.path.length < 2 || !f.fix).map((f) => f.id);
  return {
    report: {
      ...draft,
      method_note: [draft.method_note, traces.method_note].filter(Boolean).join(' '),
      findings,
      coverage: traces.coverage || draft.coverage,
      feedback_sent: traces.feedback_sent || draft.feedback_sent,
      dropped,
    },
    incomplete,
  };
}
