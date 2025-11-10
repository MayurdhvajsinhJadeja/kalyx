export const MODEL_CATALOG = [
  {
    name: 'phi3:mini',
    display: 'Phi-3 Mini (Instruct)',
    approxSize: '2.2 GB',
    hint: 'Very fast on CPU. Great for CLI suggestions.',
    recommended: true
  },
  {
    name: 'qwen2.5:3b-instruct',
    display: 'Qwen2.5 3B (Instruct)',
    approxSize: '2.8 GB',
    hint: 'Balanced quality/speed. Solid reasoning for commands.'
  },
  {
    name: 'llama3.1',
    display: 'Llama 3.1 8B (Instruct)',
    approxSize: '4–5 GB',
    hint: 'Higher quality; slower/large download.'
  },
  {
    name: 'mistral:7b-instruct',
    display: 'Mistral 7B (Instruct)',
    approxSize: '4–5 GB',
    hint: 'Popular alternative; good general performance.'
  }
];

// Resolve a name to the catalog entry (by exact name or startsWith)
export function findModelInfo(name) {
  if (!name) return null;
  const exact = MODEL_CATALOG.find(m => m.name === name);
  if (exact) return exact;
  const lo = name.toLowerCase();
  return MODEL_CATALOG.find(m => m.name.toLowerCase().startsWith(lo)) || null;
}

// Best default when nothing provided.
export function defaultModelName() {
  const rec = MODEL_CATALOG.find(m => m.recommended);
  return rec ? rec.name : MODEL_CATALOG[0].name;
}
