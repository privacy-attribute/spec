import { readFile, readdir, writeFile } from 'node:fs/promises';

const catalogPath = new URL('./catalog.json', import.meta.url);
const outputDirectory = new URL('../skill/references/', import.meta.url);
const generatedNote = '<!-- Generated from scan/patterns/catalog.json by scan/patterns/render.mjs. -->';
const slug = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const evidenceReports = new Map([
  ['source-review', 'AGENT_REVIEW_RESULTS.md'],
  ['dom-runtime', 'RUNTIME_REVIEW_RESULTS.md'],
]);
const cardSections = [
  ['cues', 'Cues'],
  ['trace', 'Trace'],
  ['treatment', 'Treatment'],
  ['counterexample', 'Counterexample'],
  ['verify', 'Verify'],
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireFields(record, fields, context) {
  requireCondition(record && typeof record === 'object' && !Array.isArray(record), `${context} must be an object`);
  const keys = Object.keys(record);
  requireCondition(keys.length === fields.length && fields.every((field) => Object.hasOwn(record, field)),
    `${context} must contain exactly ${fields.join(', ')}`);
}

function requireText(value, context) {
  requireCondition(typeof value === 'string' && value.trim() === value && value.length > 0 && !/[\r\n]/.test(value),
    `${context} must be a nonempty single-line string`);
}

function validateCatalog(catalog) {
  requireFields(catalog, ['families', 'cards'], 'catalog');
  requireCondition(Array.isArray(catalog.families) && catalog.families.length > 0, 'families must be a nonempty array');
  requireCondition(Array.isArray(catalog.cards) && catalog.cards.length > 0, 'cards must be a nonempty array');

  const families = new Map();
  for (const family of catalog.families) {
    requireFields(family, ['id', 'title', 'scope'], 'family');
    requireText(family.id, 'family id');
    requireCondition(slug.test(family.id) && !families.has(family.id), `Invalid or duplicate family id: ${family.id}`);
    requireText(family.title, `${family.id} title`);
    requireText(family.scope, `${family.id} scope`);
    families.set(family.id, []);
  }

  const cards = new Map();
  const sectionFields = cardSections.map(([field]) => field);
  for (const card of catalog.cards) {
    requireFields(card, ['id', 'family', 'title', ...sectionFields, 'composes_with', 'evidence'], 'card');
    requireText(card.id, 'card id');
    requireCondition(families.has(card.family), `Unknown family for ${card.id}: ${card.family}`);
    const cardId = new RegExp(`^${card.family}-[0-9]{2,}$`);
    requireCondition(cardId.test(card.id) && !cards.has(card.id), `Invalid or duplicate card id: ${card.id}`);
    for (const field of ['title', ...sectionFields]) requireText(card[field], `${card.id} ${field}`);
    const wordCount = sectionFields.map((field) => card[field]).join(' ').split(/\s+/).length;
    requireCondition(wordCount >= 80 && wordCount <= 140, `${card.id} has ${wordCount} words, expected 80–140`);
    requireCondition(Array.isArray(card.composes_with) && card.composes_with.length > 0,
      `${card.id} composes_with must be a nonempty array`);
    requireCondition(Array.isArray(card.evidence), `${card.id} evidence must be an array`);
    for (const evidence of card.evidence) {
      requireFields(evidence, ['level', 'report', 'anchor', 'scope'], `${card.id} evidence`);
      requireCondition(evidenceReports.has(evidence.level), `${card.id} has unknown evidence level: ${evidence.level}`);
      requireCondition(evidenceReports.get(evidence.level) === evidence.report,
        `${card.id} evidence report does not match its level`);
      requireText(evidence.anchor, `${card.id} evidence anchor`);
      requireCondition(slug.test(evidence.anchor), `${card.id} has an invalid evidence anchor`);
      requireText(evidence.scope, `${card.id} evidence scope`);
    }
    cards.set(card.id, card);
    families.get(card.family).push(card);
  }

  for (const [family, members] of families) {
    requireCondition(members.length > 0, `Family has no cards: ${family}`);
  }
  for (const card of cards.values()) {
    const links = new Set();
    for (const link of card.composes_with) {
      requireCondition(cards.has(link) && link !== card.id && !links.has(link),
        `${card.id} has an unknown, self, or duplicate crosslink: ${link}`);
      links.add(link);
    }
  }
  return { cards, families };
}

function familyFile(id) {
  return `pattern-${id}.md`;
}

function renderCard(card, cards) {
  const links = card.composes_with.map((id) => {
    const target = cards.get(id);
    const file = target.family === card.family ? '' : familyFile(target.family);
    return `[${id} · ${target.title}](${file}#${id})`;
  });
  const evidence = card.evidence.map(({ level, report, anchor, scope }) =>
    `- [${level}](../../../${report}#${anchor}) — ${scope}`);
  return [
    `### ${card.id}`,
    `**${card.title}**`,
    ...cardSections.map(([field, label]) => `**${label}.** ${card[field]}`),
    `**Composes with.** ${links.join(', ')}.`,
    evidence.length ? `**Evidence.**\n\n${evidence.join('\n')}` : '**Evidence.** Teaching example. No observation is cited.',
  ].join('\n\n');
}

function renderCatalog(catalog, { cards, families }) {
  const contents = new Map();
  const routes = catalog.families.map(({ id, title, scope }) =>
    `| [${title}](${familyFile(id)}) | ${scope} | ${families.get(id).length} |`);
  contents.set('catalog.md', [
    '# Session privacy pattern catalog',
    generatedNote,
    `This finite working taxonomy contains ${cards.size} mechanisms in ${families.size} families. It does not establish coverage of every application, feature, or recorder channel.`,
    'Start with the family that explains the observed cue, then follow its crosslinks when a value changes source, state, destination, or recorder channel. Read further families as those changes appear. For each destination, confirm the application meaning, actual boundary, and recorder behavior before deciding treatment.',
    'Use each counterexample to identify the evidence that could change the decision. Mark missing semantic or placement evidence explicitly. Linked source-review and DOM-runtime observations apply to the stated scope. Cards without citations are teaching examples.',
    ['| Family | Read when | Cards |', '| --- | --- | ---: |', ...routes].join('\n'),
  ].join('\n\n') + '\n');

  for (const family of catalog.families) {
    const members = families.get(family.id);
    contents.set(familyFile(family.id), [
      `# ${family.title}`,
      generatedNote,
      '[Pattern catalog](catalog.md)',
      family.scope,
      members.map(({ id, title }) => `- [${id} · ${title}](#${id})`).join('\n'),
      ...members.map((card) => renderCard(card, cards)),
    ].join('\n\n') + '\n');
  }
  return contents;
}

async function main(args) {
  requireCondition(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Usage: node scan/patterns/render.mjs [--check]');
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const validated = validateCatalog(catalog);
  const outputs = renderCatalog(catalog, validated);
  const existingFiles = await readdir(outputDirectory);
  const unexpected = existingFiles.filter((file) => /^pattern-[a-z0-9-]+\.md$/.test(file) && !outputs.has(file)).sort();
  requireCondition(unexpected.length === 0, `Unexpected family files: ${unexpected.join(', ')}`);

  if (args.length === 1) {
    const stale = [];
    for (const [name, contents] of outputs) {
      const existing = existingFiles.includes(name) ? await readFile(new URL(name, outputDirectory), 'utf8') : undefined;
      if (existing !== contents) stale.push(name);
    }
    requireCondition(stale.length === 0, `Stale or missing generated files: ${stale.join(', ')}. Run node scan/patterns/render.mjs`);
  } else {
    for (const [name, contents] of outputs) await writeFile(new URL(name, outputDirectory), contents);
  }
  process.stdout.write(`${validated.cards.size} cards in ${validated.families.size} families (${outputs.size} Markdown files)\n`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
