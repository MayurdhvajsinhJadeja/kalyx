const SAVE_KEYWORDS = [
  'save to', 'save into', 'write to', 'write into', 'export to', 'export into',
  'output to', 'store in', 'store into', 'dump to', 'append to'
];

export function isSaveIntent(query) {
  const q = (query || '').toLowerCase();
  return SAVE_KEYWORDS.some(k => q.includes(k)) || /\b(to|into)\s+.*\.(txt|log|csv|json|md)\b/i.test(q);
}

export function extractFileHint(query) {
  if (!query) return null;
  const m = query.match(/\b(?:to|into)\s+([^\s'"]+\.(?:txt|log|csv|json|md))\b/i);
  return m ? m[1] : null;
}
