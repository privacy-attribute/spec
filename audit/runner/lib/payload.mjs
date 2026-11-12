// Inspect every emitted JSON field, including nested nodes, plugin data and object keys.
function channel(event, path) {
  if (event.type === 2) {
    if (path.includes('attributes')) return 'snapshot-attribute';
    if (path.at(-1) === 'textContent') return 'snapshot-text';
    return 'snapshot-other';
  }
  if (event.type === 3 && event.data?.source === 0) {
    if (path[1] === 'texts') return 'mutation-text';
    if (path[1] === 'attributes') return 'mutation-attribute';
    if (path[1] === 'adds') return 'mutation-add';
    if (path[1] === 'removes') return 'mutation-remove';
    return 'mutation-other';
  }
  if (event.type === 3 && event.data?.source === 5) return 'input';
  if (event.type === 4) return 'metadata';
  if (event.type === 5) return 'custom';
  if (event.type === 6) return 'plugin';
  return event.type === 3 ? `incremental:${event.data?.source}` : `event:${event.type}`;
}

const pointer = (path) => '/' + path.map((key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

export function inspectPayload(events, markers) {
  const matches = new Map(markers.map((marker) => [marker, []]));
  const channels = {};
  events.forEach((event, index) => {
    const seen = new Set();
    const visit = (value, path, key = false) => {
      const source = channel(event, path);
      seen.add(source);
      if (typeof value === 'string') {
        for (const [marker, positions] of matches) {
          if (value.includes(marker)) positions.push({ event: index, channel: source, path: pointer(path), ...(key && { key }) });
        }
      } else if (value && typeof value === 'object') {
        for (const [name, child] of Object.entries(value)) {
          const next = [...path, name];
          if (!Array.isArray(value)) visit(name, next, true);
          visit(child, next);
        }
      }
    };
    visit(event, []);
    for (const source of seen) channels[source] = (channels[source] ?? 0) + 1;
  });
  return { matches, channels, events: events.length };
}

function coveredBy(hits, probe) {
  return hits.some((hit) => !hit.key && hit.channel === probe.channel && (!probe.field || hit.path.endsWith('/' + probe.field)));
}

export function scorePayload({ events, reference, probes }) {
  const markers = [...new Set(probes.map((probe) => probe.marker))];
  const examined = inspectPayload(events, markers);
  const control = inspectPayload(reference, markers);
  const results = probes.map(({ marker, ...probe }) => {
    const matches = examined.matches.get(marker);
    const exercised = coveredBy(control.matches.get(marker), probe);
    const retained = coveredBy(matches, probe);
    const status = probe.private
      ? matches.length ? 'exposed' : exercised ? 'protected' : 'unverified'
      : retained ? 'retained' : exercised ? 'lost' : 'unverified';
    return { ...probe, status, matches, control_matches: control.matches.get(marker) };
  });
  const count = (status) => results.filter((probe) => probe.status === status).length;
  return {
    events: examined.events, channels: examined.channels,
    private: { protected: count('protected'), exposed: count('exposed'), unverified: results.filter((r) => r.private && r.status === 'unverified').length },
    public: { retained: count('retained'), lost: count('lost'), unverified: results.filter((r) => !r.private && r.status === 'unverified').length },
    probes: results,
  };
}
