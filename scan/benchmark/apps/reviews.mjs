const TYPES = new Set(['human', 'model']);
const key = ({ file, line, column }) => JSON.stringify([file, line, column ?? null]);
const verdict = (row) => row ? `${row.category}/${row.value}` : null;
export const validVerdict = ({ category, value }) => (
  category === 'public' ? value === 'none'
    : category === 'secret' ? value === 'block'
      : ['personal', 'third-party'].includes(category) && ['block', 'mask'].includes(value)
);

// Review files preserve each submitted verdict, including decisions superseded in
// adjudication. A missing verdict is a disagreement only within a reviewer's scope.
export function summarizeReviews(labels, sample) {
  const review = labels.review || {};
  const submissions = review.submissions || [];
  const adjudications = review.adjudications || [];
  const reviewers = new Set();
  const byLocation = new Map();
  const decisions = new Map();
  for (const submission of submissions) {
    const { id, kind, files, rows } = submission;
    if (!id || reviewers.has(id) || !TYPES.has(kind) || !Array.isArray(files) || !files.length
      || new Set(files).size !== files.length || files.some((file) => !Object.hasOwn(labels.files, file))
      || !Array.isArray(rows) || typeof submission.method !== 'string' || !submission.method.trim()) {
      throw new Error('Invalid benchmark review submission.');
    }
    reviewers.add(id);
    const ownRows = new Set();
    for (const row of rows) {
      const location = key(row);
      if (!files.includes(row.file) || !Number.isInteger(row.line) || row.line < 1
        || !validVerdict(row) || ownRows.has(location) || typeof row.what !== 'string' || !row.what.trim()) {
        throw new Error(`Invalid or duplicate benchmark review row ${location}.`);
      }
      ownRows.add(location);
      const submitted = byLocation.get(location) || { file: row.file, line: row.line, column: row.column, votes: new Map() };
      submitted.votes.set(id, verdict(row));
      byLocation.set(location, submitted);
    }
  }
  for (const ruling of adjudications) {
    const location = key(ruling);
    if (decisions.has(location) || !ruling.reviewer?.id || !TYPES.has(ruling.reviewer.kind)
      || typeof ruling.reason !== 'string' || !ruling.reason.trim()
      || (ruling.chosen !== null && (!ruling.chosen || !validVerdict(ruling.chosen)))) {
      throw new Error(`Invalid or duplicate benchmark adjudication ${location}.`);
    }
    decisions.set(location, ruling);
  }
  const chosen = new Map(Object.entries(labels.files).flatMap(([file, rows]) => rows.map((row) => [key({ ...row, file }), row])));
  const disagreements = [];
  let agreed = 0;
  let humanAgreed = 0;
  for (const [location, { file, line, column, votes }] of byLocation) {
    const inScope = submissions.filter((submission) => submission.files.includes(file));
    const distinct = new Set(inScope.map(({ id }) => votes.get(id) ?? null));
    const ruling = decisions.get(location);
    if (distinct.size > 1) {
      if (ruling && verdict(chosen.get(location)) !== verdict(ruling.chosen)) {
        throw new Error(`Adjudication disagrees with the published benchmark label ${location}.`);
      }
      if (sample.has(file)) disagreements.push({
        file, line, column,
        votes: inScope.map(({ id, kind }) => ({ id, kind, verdict: votes.get(id) ?? null })),
        adjudication: ruling ?? null,
      });
      decisions.delete(location);
    } else if (inScope.length > 1 && sample.has(file)) {
      if (verdict(chosen.get(location)) !== [...distinct][0]) {
        throw new Error(`Agreed review differs from the published benchmark label ${location}.`);
      }
      agreed++;
      if (inScope.filter(({ kind }) => kind === 'human').length >= 2) humanAgreed++;
    }
  }
  if (decisions.size) throw new Error('Benchmark adjudication does not refer to a recorded disagreement.');
  const sampled = submissions.filter(({ files }) => files.some((file) => sample.has(file)));
  return {
    status: review.status ?? 'unverified',
    human_submissions: sampled.filter(({ kind }) => kind === 'human').length,
    model_submissions: sampled.filter(({ kind }) => kind === 'model').length,
    agreed,
    human_agreed: humanAgreed,
    disagreements,
    unresolved: disagreements.filter(({ adjudication }) => !adjudication).length,
  };
}
