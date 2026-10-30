// Line diff of two normalised event streams. Each line is { channel, text }.

// Longest common subsequence on line text; returns lines only in a and only in b.
export function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > 25e6) return coarseDiff(a, b);
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].text === b[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const onlyA = [];
  const onlyB = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) onlyA.push(a[i++]); else onlyB.push(b[j++]);
  }
  while (i < n) onlyA.push(a[i++]);
  while (j < m) onlyB.push(b[j++]);
  return { onlyA, onlyB };
}

// Multiset difference for very long streams.
function coarseDiff(a, b) {
  const count = new Map();
  for (const l of a) count.set(l.text, (count.get(l.text) || 0) + 1);
  const onlyB = [];
  for (const l of b) {
    const c = count.get(l.text) || 0;
    if (c > 0) count.set(l.text, c - 1); else onlyB.push(l);
  }
  const left = new Map(count);
  const onlyA = a.filter((l) => {
    const c = left.get(l.text) || 0;
    if (c > 0) { left.set(l.text, c - 1); return true; }
    return false;
  });
  return { onlyA, onlyB };
}

// Summarises a diff per channel, with a few sample lines each.
export function summarise({ onlyA, onlyB }, samples = 3) {
  const channels = {};
  const add = (side, l) => {
    const c = (channels[l.channel] ||= { onlyA: 0, onlyB: 0, a: [], b: [] });
    c[side === 'a' ? 'onlyA' : 'onlyB']++;
    const list = c[side];
    if (list.length < samples) list.push(l.text.length > 240 ? l.text.slice(0, 240) + '…' : l.text);
  };
  onlyA.forEach((l) => add('a', l));
  onlyB.forEach((l) => add('b', l));
  return channels;
}

// Timing: gaps between consecutive events differ by more than `quantum` milliseconds.
export function timingDiffers(gapsA, gapsB, quantum = 100) {
  if (gapsA.length !== gapsB.length) return { differs: true, countA: gapsA.length, countB: gapsB.length };
  const idx = gapsA.findIndex((g, i) => Math.abs(g - gapsB[i]) > quantum);
  return idx === -1 ? { differs: false } : { differs: true, at: idx, a: gapsA[idx], b: gapsB[idx] };
}
