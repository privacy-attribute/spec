import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { componentImports, walk } from '../components.mjs';
import { applyAnnotations, isNativeTag, unifiedDiff } from '../patch.mjs';
import { spansFor } from '../templates.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const CATEGORIES = new Set(['secret', 'personal', 'third-party', 'public']);
const MASKED_ATTRIBUTES = new Set(['title', 'placeholder', 'aria-label']);
const VALUE_CHANNEL = /^(?:input|input:value|input:defaultvalue|attribute:value|attribute:defaultvalue)$/i;
const FIELD = /^(input|textarea)$/;
const PUBLIC_CONTROL = /^(?:a|audio|button|canvas|details|embed|hr|iframe|img|input|meter|object|option|progress|select|summary|svg|textarea|video)$/i;
const NON_DOM_ATTRIBUTE = /^(?:data-privacy|key|ref)$/i;
const NATIVE_WRAPPER = /^(?:a|article|aside|blockquote|body|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|header|hgroup|label|li|main|nav|ol|section|span|summary|table|tbody|td|tfoot|th|thead|tr|ul)$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = (value) => typeof value === 'string' && Boolean(value.trim());
const integerAtLeast = (value, min) => Number.isSafeInteger(value) && value >= min;
const inside = (start, end, outer) => outer.start <= start && end <= outer.end;
const ownerKey = (site) => `${site.file}:${site.target.start}`;

function relativeFile(file) {
  return typeof file === 'string' && !/[\\:\0]/.test(file)
    && file.split('/').every((part) => part && part !== '.' && part !== '..');
}

function sourceReader(root) {
  const sources = new Map();
  return (file) => {
    if (!relativeFile(file)) return { error: 'expected an in-root relative file path' };
    if (sources.has(file)) return sources.get(file);
    let source;
    try {
      const real = fs.realpathSync(path.join(root, file));
      const relative = path.relative(root, real);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
        || !fs.statSync(real).isFile()) {
        source = { error: 'expected an in-root regular file' };
      } else {
        const bytes = fs.readFileSync(real);
        source = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
      }
    } catch {
      source = { error: 'file could not be read' };
    }
    sources.set(file, source);
    return source;
  };
}

function sourceText(source) {
  if (source.text === undefined) source.text = source.bytes.toString('utf8');
  return source.text;
}

function lineOffsets(source) {
  if (!source.lineOffsets) {
    source.lineOffsets = [0];
    for (const newline of sourceText(source).matchAll(/\n/g)) source.lineOffsets.push(newline.index + 1);
  }
  return source.lineOffsets;
}

function evidenceFor(entry, site, read) {
  if (!isObject(entry) || !relativeFile(entry.file) || !SHA256.test(entry.sha256)
    || !integerAtLeast(entry.start_line, 1) || !integerAtLeast(entry.end_line, entry.start_line)
    || !hasText(entry.quote)) {
    return { error: 'evidence requires a relative file, SHA-256, line range, and literal quote' };
  }
  const source = read(entry.file);
  if (source.error) return { error: `evidence ${entry.file}: ${source.error}` };
  if (source.sha256 !== entry.sha256) return { error: `evidence SHA-256 changed for ${entry.file}` };
  const offsets = lineOffsets(source);
  if (entry.end_line > offsets.length) return { error: `evidence lines are outside ${entry.file}` };
  const start = offsets[entry.start_line - 1];
  const end = offsets[entry.end_line];
  const region = sourceText(source).slice(start, end);
  let index = region.indexOf(entry.quote);
  if (index < 0) return { error: `evidence quote does not occur within the cited lines of ${entry.file}` };
  if (entry.file === site.file) {
    while (index >= 0) {
      const at = start + index;
      if (at < site.end && at + entry.quote.length > site.start) return { anchor: true };
      index = region.indexOf(entry.quote, index + 1);
    }
  }
  return {};
}

function validReviewer(reviewer) {
  if (!isObject(reviewer) || !hasText(reviewer.id) || !['model', 'human'].includes(reviewer.kind)) return false;
  if (reviewer.usage == null) return true;
  return isObject(reviewer.usage) && ['input_tokens', 'output_tokens', 'total_tokens'].every((key) =>
    !(key in reviewer.usage) || integerAtLeast(reviewer.usage[key], 0));
}

function maskedChannel(site) {
  return site.channel === 'text'
    || (site.channel.startsWith('attribute:') && MASKED_ATTRIBUTES.has(site.channel.slice('attribute:'.length).toLowerCase()))
    || (FIELD.test(site.tag) && VALUE_CHANNEL.test(site.channel));
}

function treatmentError(decision, site, choiceOwners) {
  const { category, treatment, special_category: special } = decision;
  if (!CATEGORIES.has(category) || !['none', 'mask', 'block'].includes(treatment)) return 'unsupported category or treatment';
  if (special && !['personal', 'third-party'].includes(category)) return 'special category requires personal or third-party data';
  if (category === 'public') return treatment === 'none' ? null : 'public decisions require treatment none';
  if (treatment === 'none') return 'private data requires mask or block';
  if (category === 'secret' && treatment !== 'block') return 'secrets require block';
  if (special && treatment !== 'block' && choiceOwners.has(ownerKey(site))) return 'special-category choices require block';
  // The reviewer may know the semantic treatment for a custom prop. Only a
  // verified native destination can establish that treatment in a patch.
  if (site.native && treatment === 'mask' && !maskedChannel(site)) return 'the site channel requires block';
  return null;
}

function validSite(site) {
  return isObject(site) && hasText(site.id) && relativeFile(site.file) && hasText(site.tag)
    && hasText(site.channel) && hasText(site.expression) && typeof site.native === 'boolean'
    && integerAtLeast(site.line, 1) && integerAtLeast(site.column, 0)
    && integerAtLeast(site.start, 0) && integerAtLeast(site.end, site.start + 1)
    && isObject(site.target) && integerAtLeast(site.target.line, 1) && integerAtLeast(site.target.column, 0)
    && integerAtLeast(site.target.start, 0) && integerAtLeast(site.target.open_end, site.target.start + 1)
    && integerAtLeast(site.target.end, site.target.open_end);
}

function placementError(placement, read) {
  if (!isObject(placement) || !relativeFile(placement.file) || !integerAtLeast(placement.line, 1)
    || !integerAtLeast(placement.column, 0) || ![placement.tag, placement.kind, placement.rationale].every(hasText)
    || !Array.isArray(placement.evidence) || !placement.evidence.length) {
    return 'suggested placement requires a file, line, column, tag, kind, rationale, and evidence';
  }
  const source = read(placement.file);
  if (source.error) return `suggested placement ${placement.file}: ${source.error}`;
  const offsets = lineOffsets(source);
  const start = offsets[placement.line - 1];
  const end = offsets[placement.line] ?? sourceText(source).length;
  if (start === undefined || start + placement.column >= end) return 'suggested placement is outside its source line';
  let anchored = false;
  for (const entry of placement.evidence) {
    const { error, anchor } = evidenceFor(entry, { file: placement.file, start, end }, read);
    if (error) return `suggested placement ${error}`;
    anchored ||= Boolean(anchor);
  }
  return anchored ? null : 'suggested placement evidence must quote its source line';
}

function reviewInputs(review, errors) {
  const inputs = review.decisions.map((decision) => ({ decision }));
  const seen = new Set();
  for (const group of review.groups ?? []) {
    if (!isObject(group) || !hasText(group.id) || seen.has(group.id)
      || !Array.isArray(group.site_ids) || !group.site_ids.length || !group.site_ids.every(hasText)) {
      errors.push({ group_id: group?.id, reason: 'review group requires a unique ID and a nonempty array of site IDs' });
      continue;
    }
    const { id, site_ids, ...shared } = group;
    seen.add(id);
    for (const site_id of site_ids) inputs.push({ decision: { ...shared, site_id, group_id: id }, group_id: id });
  }
  return inputs;
}

function validateFindings(findings, sites, read, result) {
  for (const [index, finding] of findings.entries()) {
    const invalid = (reason) => result.errors.push({ finding_index: index, reason });
    if (!isObject(finding) || !relativeFile(finding.file) || !integerAtLeast(finding.line, 1)
      || ![finding.quote, finding.channel, finding.meaning, finding.reason].every(hasText)
      || (finding.site_id !== undefined && !hasText(finding.site_id))) {
      invalid('additional finding requires a file, line, quote, channel, meaning, and reason');
      continue;
    }
    const source = read(finding.file);
    if (source.error) {
      invalid(`additional finding ${finding.file}: ${source.error}`);
      continue;
    }
    const site = sites.get(finding.site_id);
    const matching = site?.file === finding.file && site.channel === finding.channel;
    const { error, anchor } = evidenceFor({
      file: finding.file, start_line: finding.line, end_line: finding.line, quote: finding.quote,
      sha256: finding.sha256 === undefined ? source.sha256 : finding.sha256,
    }, matching ? site : {}, read);
    if (error) {
      invalid(error);
      continue;
    }
    const checked = { ...finding, finding_index: index, sha256: source.sha256, status: 'unresolved' };
    result.additional_findings.push(checked);
    result.unresolved.push({
      finding_index: index, file: finding.file, line: finding.line,
      ...(anchor ? { site_id: site.id } : {}),
      reason: anchor ? 'additional finding awaits a verified decision and placement' : finding.reason,
    });
  }
}

function validate(root, inventory, review) {
  const result = { decisions: [], errors: [], unresolved: [], missing: [], additional_findings: [] };
  const { errors } = result;
  const sites = new Map();
  let read;
  let requestedRoot;
  try {
    requestedRoot = path.resolve(root);
    root = fs.realpathSync(root);
    read = sourceReader(root);
  } catch {
    errors.push({ reason: 'application root could not be read' });
    return { result, sites };
  }
  if (!isObject(inventory) || inventory.schema_version !== 1 || !Array.isArray(inventory.files)
    || !Array.isArray(inventory.sites) || !Array.isArray(inventory.failures)) {
    errors.push({ reason: 'expected a version 1 inventory with files, sites, and failures arrays' });
    return { result, sites, read };
  }
  if (typeof inventory.root !== 'string' || ![requestedRoot, root].includes(path.resolve(inventory.root))) {
    errors.push({ reason: 'inventory application root does not match the requested root' });
  }
  const files = new Map();
  for (const file of inventory.files) {
    if (!isObject(file) || !relativeFile(file.file) || files.has(file.file)
      || !['parsed', 'failed', 'unsupported'].includes(file.status)) {
      errors.push({ reason: 'invalid or duplicate file in the inventory' });
      continue;
    }
    files.set(file.file, file);
    if (!SHA256.test(file.sha256)) {
      if (file.status === 'parsed' || file.sha256 != null) errors.push({ file: file.file, reason: 'invalid inventory SHA-256' });
      continue;
    }
    const source = read(file.file);
    if (source.error) errors.push({ file: file.file, reason: source.error });
    else if (source.sha256 !== file.sha256) errors.push({ file: file.file, reason: 'inventory SHA-256 changed' });
  }
  for (const site of inventory.sites) {
    if (!validSite(site) || sites.has(site.id) || !SHA256.test(files.get(site.file)?.sha256)) {
      errors.push({ site_id: site?.id, reason: 'invalid or duplicate site in the inventory' });
      continue;
    }
    const source = read(site.file);
    if (!source.error) {
      const text = sourceText(source);
      const offset = lineOffsets(source)[site.line - 1];
      if (site.target.end > text.length || site.end > text.length || offset + site.column !== site.start
        || text.slice(site.start, site.end) !== site.expression) {
        errors.push({ site_id: site.id, reason: 'inventory site does not match its source span' });
        continue;
      }
    }
    sites.set(site.id, site);
  }
  if (!isObject(review) || review.schema_version !== 1 || !validReviewer(review.reviewer) || !Array.isArray(review.decisions)
    || (review.additional_findings !== undefined && !Array.isArray(review.additional_findings))
    || (review.groups !== undefined && !Array.isArray(review.groups))) {
    errors.push({ reason: 'expected a version 1 review with a valid reviewer and decisions, groups, and additional findings arrays when provided' });
    result.missing = [...sites.keys()];
    return { result, sites, read };
  }
  const submitted = new Set();
  const choiceOwners = new Set([...sites.values()]
    .filter((site) => /^(?:input|attribute):(?:checked|defaultchecked)$/i.test(site.channel))
    .map(ownerKey));
  const groupAnchors = new Map();
  const placementErrors = new Map();
  for (const { decision, group_id } of reviewInputs(review, errors)) {
    const id = decision?.site_id;
    const site = sites.get(id);
    if (!isObject(decision) || !site || submitted.has(id)) {
      errors.push({ site_id: id, reason: 'unknown, invalid, or duplicate site decision' });
      continue;
    }
    submitted.add(id);
    const invalid = (reason) => errors.push({ site_id: id, reason });
    if (!['decided', 'unresolved'].includes(decision.status) || typeof decision.special_category !== 'boolean'
      || typeof decision.meaning !== 'string' || typeof decision.rationale !== 'string' || !Array.isArray(decision.evidence)
      || (group_id === undefined && decision.group_id !== undefined)
      || (decision.accept_shared !== undefined && !hasText(decision.accept_shared))) {
      invalid('invalid decision status, flags, meaning, rationale, or evidence');
      continue;
    }
    const placement = decision.suggested_placement;
    if (placement !== undefined) {
      if (!placementErrors.has(placement)) placementErrors.set(placement, placementError(placement, read));
      if (placementErrors.get(placement)) {
        invalid(placementErrors.get(placement));
        continue;
      }
    }
    if (decision.status === 'unresolved') {
      if (decision.category !== null || decision.treatment !== null || decision.special_category
        || decision.accept_shared !== undefined || !hasText(decision.reason ?? decision.rationale)) {
        invalid('unresolved decisions require a reason and no category, treatment, or shared acceptance');
        continue;
      }
    } else {
      const policyError = treatmentError(decision, site, choiceOwners);
      if (policyError || !hasText(decision.meaning) || !hasText(decision.rationale) || !decision.evidence.length
        || (decision.category === 'public' && decision.accept_shared !== undefined)) {
        invalid(policyError || 'decided sites require meaning, rationale, and evidence; shared acceptance applies to a private site');
        continue;
      }
    }
    let anchored = false;
    const errorsBefore = errors.length;
    for (const entry of decision.evidence) {
      const { error, anchor } = evidenceFor(entry, site, read);
      if (error) invalid(error);
      anchored ||= Boolean(anchor);
    }
    if (errors.length !== errorsBefore) continue;
    if (decision.status === 'decided') {
      if (group_id !== undefined) groupAnchors.set(group_id, anchored || groupAnchors.get(group_id) || false);
      else if (!anchored) {
        invalid('evidence must quote the reviewed source span');
        continue;
      }
    }
    result.decisions.push(decision);
    if (decision.status === 'unresolved') result.unresolved.push({ site_id: id, reason: decision.reason ?? decision.rationale });
  }
  for (const [group_id, anchored] of groupAnchors) {
    if (!anchored) errors.push({ group_id, reason: 'group evidence must quote at least one reviewed source span' });
  }
  result.decisions = result.decisions.filter(({ group_id }) => groupAnchors.get(group_id) !== false);
  for (const id of sites.keys()) if (!submitted.has(id)) result.missing.push(id);
  validateFindings(review.additional_findings ?? [], sites, read, result);
  return { result, sites, read };
}

export function validateReview(root, inventory, review) {
  return validate(root, inventory, review).result;
}

function nativeTarget(site, spans) {
  const { target } = site;
  return site.native && isNativeTag(site.tag) && inside(site.start, site.end, target)
    && spans.some(([line, , , tag, column, start, end, open]) => line === target.line && tag === site.tag
      && column === target.column && start === target.start && end === target.end && open === target.open_end);
}

function publicLossAt(site, target, treatment) {
  if (!inside(site.target.start, site.target.end, target)) return false;
  if (treatment === 'mask') return maskedChannel(site);
  if (site.channel === 'text') return true;
  if (!site.native) return false;
  if (/^(?:html|input(?::.+)?)$/.test(site.channel)) return true;
  if (site.channel === 'element') return PUBLIC_CONTROL.test(site.tag);
  const name = site.channel.slice('attribute:'.length);
  return site.channel.startsWith('attribute:') && !NON_DOM_ATTRIBUTE.test(name) && !/^on[A-Z]/.test(name);
}

function needsScopeReview(site, target, treatment) {
  if (site.target.start === target.start || publicLossAt(site, target, treatment)) return true;
  // Spread bindings and component props can render values through channels
  // their source spans alone cannot identify.
  return inside(site.target.start, site.target.end, target)
    && /^(?:html|spread|prop:|directive:@render)/.test(site.channel);
}

// A cited caller can expose a public use of the same prop. This checks only
// exact local or direct-import bindings backed by the reviewers' decisions.
function sharedPublicUses(inventory, sites, decisions, read) {
  const imports = new Map(inventory.files.map(({ file, imports }) => [file, imports]));
  const bindings = new Map();
  const propSites = [...sites.values()].filter((site) => !site.native && site.channel.startsWith('prop:')
    && decisions.get(site.id)?.status === 'decided');
  const publicProps = propSites.filter((site) => decisions.get(site.id).category === 'public');
  const privateByFile = new Map();
  for (const site of propSites) {
    if (decisions.get(site.id).category === 'public') continue;
    if (!privateByFile.has(site.file)) privateByFile.set(site.file, []);
    privateByFile.get(site.file).push(site);
  }
  const bindingFor = ({ file, tag }, definition) => {
    if (!bindings.has(file)) {
      let names = null;
      if (/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file)) {
        try {
          const plugins = ['jsx', 'decorators-legacy'];
          if (/\.[cm]?tsx?$/i.test(file)) plugins.push('typescript');
          names = componentImports(parse(sourceText(read(file)), { sourceType: 'unambiguous', plugins }).program);
        } catch { /* Unsupported bindings remain unverified. */ }
      }
      bindings.set(file, names);
    }
    const names = bindings.get(file);
    if (!names) return null;
    const [name, member, ...rest] = tag.split('.');
    const binding = names.get(name);
    if (!binding) return file === definition && !member ? `local:${tag}` : null;
    if (rest.length || !imports.get(file)?.includes(definition)) return null;
    const [specifier, imported] = binding;
    if (!/^\.\.?\//.test(specifier) || Boolean(member) !== (imported === '*')) return null;
    const resolved = path.posix.join(path.posix.dirname(file), specifier);
    const stem = resolved.replace(/\.[cm]?jsx?$/i, '');
    const targetStem = definition.replace(/\.[^.\/]+$/, '');
    return resolved === definition || stem === targetStem || `${resolved}/index` === targetStem
      ? `import:${member || imported}` : null;
  };
  return (group) => {
    if (!publicProps.length) return [];
    const definition = group[0].site.file;
    const publicSites = new Set();
    for (const { decision } of group) for (const entry of decision.evidence) {
      for (const caller of privateByFile.get(entry.file) ?? []) {
        if (!evidenceFor(entry, caller, read).anchor) continue;
        const binding = bindingFor(caller, definition);
        if (!binding) continue;
        for (const site of publicProps) {
          if (site.channel === caller.channel && bindingFor(site, definition) === binding) publicSites.add(site);
        }
      }
    }
    return [...publicSites];
  };
}

function annotationFor(group) {
  const { site } = group[0];
  const strongest = group.filter(({ decision }) => decision.treatment === 'block');
  const { decision } = strongest.find(({ decision }) => decision.category === 'secret') ?? strongest[0] ?? group[0];
  return {
    file: site.file,
    line: site.target.line,
    column: site.target.column,
    match: `<${site.tag}`,
    value: decision.treatment,
    category: decision.category,
    special_category: decision.special_category,
    site_ids: group.map(({ site }) => site.id),
  };
}

function directNativeParents(file, source, spans, sites) {
  const byStart = new Map(spans.map((span) => [span[5], span]));
  const custom = new Set(sites.filter((site) => !site.native).map((site) => site.target.start));
  const native = new Set(sites.filter((site) => site.native).map((site) => site.target.start));
  const parents = new Map();
  const tableChildren = new Map([
    ['table', /^(?:caption|colgroup|tbody|tfoot|thead|tr)$/],
    ['tbody', /^tr$/], ['tfoot', /^tr$/], ['thead', /^tr$/], ['tr', /^(?:td|th)$/], ['colgroup', /^col$/],
  ]);
  const verified = (span) => !custom.has(span[5]) && isNativeTag(span[3])
    && (native.has(span[5]) || NATIVE_WRAPPER.test(span[3]));
  const connect = (childStart, parentStart) => {
    const parent = byStart.get(parentStart);
    const child = byStart.get(childStart);
    if (!parent || !child || childStart < parent[7] || child[6] >= parent[6] || !verified(parent) || !verified(child)) return;
    const permitted = tableChildren.get(parent[3]);
    if (/^(?:iframe|p|select)$/.test(parent[3]) || (permitted && !permitted.test(child[3]))) return;
    if (/\s(?:use:|v-teleport\b)/.test(source.slice(childStart, child[7]))) return;
    parents.set(childStart, parentStart);
  };
  if (/\.(?:tsx|jsx|ts|js|mjs)$/.test(file)) {
    try {
      const plugins = ['jsx', 'decorators-legacy'];
      if (/\.tsx?$/.test(file)) plugins.push('typescript');
      const ast = parse(source, { sourceType: 'unambiguous', plugins });
      const jsxParents = new WeakMap();
      walk(ast, (node, parent) => {
        jsxParents.set(node, parent);
        if (node.type !== 'JSXElement') return;
        // Direct JSX children and fragments render inside the parent. An
        // expression may be a portal, callback, or detached element.
        let branch = node;
        while (parent?.type === 'JSXFragment') {
          branch = parent;
          parent = jsxParents.get(parent);
        }
        if (parent?.type === 'JSXElement' && parent.children.includes(branch)) connect(node.start, parent.start);
      });
    } catch { /* Exact ancestry remains unavailable. */ }
  } else {
    const open = [];
    for (const span of [...spans].sort((a, b) => a[5] - b[5])) {
      while (open.length && open.at(-1)[6] <= span[5]) open.pop();
      const parent = open.at(-1);
      if (parent) connect(span[5], parent[5]);
      open.push(span);
    }
  }
  return { byStart, parents };
}

function minimalBlocks(file, before, spans, sites, candidates, allowed, existing, applied) {
  const original = { ...applied, effects: [...existing, ...applied.effects], covered: new Set() };
  const owners = new Map(sites.map((site) => [site.id, site.target.start]));
  const blocks = new Map(original.effects.filter(({ value }) => value === 'block').map((effect) => [effect.element[5], effect]));
  if (!candidates.length || (!blocks.size && !before.includes('data-privacy'))) return original;
  const { byStart, parents } = directNativeParents(file, before, spans, sites);
  const checked = new Set(blocks.keys());
  const existingBlocks = new Map();
  const redundant = new Map();
  for (const annotation of candidates) {
    const site = annotation.site_ids[0];
    let covering;
    for (let start = parents.get(owners.get(site)); start !== undefined; start = parents.get(start)) {
      const [line, , , tag, column, , , openEnd] = byStart.get(start);
      if (!checked.has(start) && before.slice(start, openEnd).includes('data-privacy')) {
        checked.add(start);
        const prior = applyAnnotations(file, before, [{
          ...annotation, line, column, match: `<${tag}`, value: 'block', site_ids: [],
        }], 'data-privacy');
        if (prior.text === before && prior.effects.length) {
          const [effect] = prior.effects;
          blocks.set(start, effect);
          existingBlocks.set(start, effect);
        }
      }
      if (blocks.has(start)) covering = start;
    }
    if (covering !== undefined) redundant.set(site, covering);
  }
  if (!redundant.size) return original;
  const reduced = applyAnnotations(file, before, allowed.filter(({ site_ids }) => !redundant.has(site_ids[0])), 'data-privacy');
  const effects = [...existing.filter(({ site_ids }) => !redundant.has(site_ids[0])), ...reduced.effects];
  const survivingBlocks = new Map(effects.filter(({ value }) => value === 'block').map((effect) => [effect.element[5], effect]));
  for (const start of new Set(redundant.values())) {
    if (!survivingBlocks.has(start) && existingBlocks.has(start)) {
      const effect = existingBlocks.get(start);
      effects.push(effect);
      survivingBlocks.set(start, effect);
    }
    if (!survivingBlocks.has(start)) return original;
  }
  for (const { site_ids } of candidates) {
    const covering = survivingBlocks.get(redundant.get(site_ids[0]));
    if (covering) covering.site_ids = [...covering.site_ids, ...site_ids];
  }
  return { ...reduced, effects, covered: new Set(redundant.keys()) };
}

function resolveFindings(proposal, decisions) {
  const protectedSites = new Set(proposal.annotations.flatMap(({ site_ids }) => site_ids));
  const resolved = new Set(proposal.unresolved.filter(({ finding_index, site_id }) =>
    finding_index !== undefined && (decisions.get(site_id)?.category === 'public' || protectedSites.has(site_id)))
    .map(({ finding_index }) => finding_index));
  for (const finding of proposal.additional_findings) {
    if (resolved.has(finding.finding_index)) finding.status = 'resolved';
  }
  proposal.unresolved = proposal.unresolved.filter(({ finding_index }) => !resolved.has(finding_index));
}

// All coordinates refer to the original source. The shared patcher resolves
// identical siblings before edits and verifies their effective final control.
export function proposeReviewPatch(root, inventory, review) {
  const { result, sites, read } = validate(root, inventory, review);
  const proposal = { ...result, annotations: [], patch: '', after: {}, public_losses: [] };
  if (result.errors.length) return proposal;
  const decisions = new Map(result.decisions.map((decision) => [decision.site_id, decision]));
  const sharedPublic = sharedPublicUses(inventory, sites, decisions, read);
  const byFile = new Map();
  for (const site of sites.values()) {
    if (!byFile.has(site.file)) byFile.set(site.file, []);
    byFile.get(site.file).push(site);
  }
  const unresolved = (ids, reason) => {
    for (const site_id of ids) proposal.unresolved.push({ site_id, reason });
  };
  for (const [file, fileSites] of byFile) {
    const privateSites = fileSites.filter((site) => ['mask', 'block'].includes(decisions.get(site.id)?.treatment));
    if (!privateSites.length) continue;
    const before = sourceText(read(file));
    const spans = spansFor(file, before);
    const groups = new Map();
    for (const site of privateSites) {
      if (!nativeTarget(site, spans)) {
        unresolved([site.id], 'no verified native destination contains the site');
        continue;
      }
      const { start } = site.target;
      if (!groups.has(start)) groups.set(start, []);
      groups.get(start).push({ site, decision: decisions.get(site.id) });
    }
    const candidates = [];
    const allowed = [];
    const existing = [];
    const losses = new Map();
    const rejected = [];
    for (const group of groups.values()) {
      const annotation = annotationFor(group);
      candidates.push(annotation);
      const target = group[0].site.target;
      const unreviewed = fileSites.filter((site) => needsScopeReview(site, target, annotation.value)
        && decisions.get(site.id)?.status !== 'decided');
      const publicSites = [...new Set([
        ...fileSites.filter((site) => publicLossAt(site, target, annotation.value) && decisions.get(site.id)?.category === 'public'),
        ...sharedPublic(group),
      ])];
      const accepted = group.find(({ decision }) => decision.treatment === annotation.value && decision.accept_shared)?.decision.accept_shared;
      if (unreviewed.length || publicSites.length) {
        const prior = applyAnnotations(file, before, [annotation], 'data-privacy');
        if (prior.text === before && prior.effects.length) {
          existing.push(...prior.effects);
          continue;
        }
      }
      if (unreviewed.length) {
        rejected.push({ annotation, reason: `target affects sites awaiting review: ${unreviewed.map(({ id }) => id).join(', ')}` });
        continue;
      }
      if (publicSites.length && !accepted) {
        rejected.push({ annotation, reason: `target affects public sites: ${publicSites.map(({ id }) => id).join(', ')}` });
        continue;
      }
      if (publicSites.length) losses.set(target.start, { publicSites, reason: accepted });
      allowed.push(annotation);
    }
    const batch = allowed.length ? applyAnnotations(file, before, allowed, 'data-privacy') : { text: before, failed: [], effects: [] };
    const applied = minimalBlocks(file, before, spans, fileSites, candidates, allowed, existing, batch);
    for (const { annotation, reason } of rejected) {
      if (!applied.covered.has(annotation.site_ids[0])) unresolved(annotation.site_ids, reason);
    }
    for (const failure of applied.failed) unresolved(failure.site_ids, failure.reason);
    for (const effect of applied.effects) {
      proposal.annotations.push(effect);
      const loss = losses.get(effect.element[5]);
      if (loss) for (const site of loss.publicSites) {
        proposal.public_losses.push({
          site_id: site.id, file: site.file, line: site.line, column: site.column,
          annotation_site_ids: effect.site_ids, treatment: effect.value, reason: loss.reason,
        });
      }
    }
    if (applied.text !== before) {
      Object.defineProperty(proposal.after, file, { value: applied.text, enumerable: true });
      proposal.patch += unifiedDiff(file, before, applied.text);
    }
  }
  resolveFindings(proposal, decisions);
  return proposal;
}
