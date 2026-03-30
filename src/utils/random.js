export function shuffleArray(items) {
  const out = Array.isArray(items) ? [...items] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rotateArray(items, step = 1) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const size = items.length;
  const offset = ((step % size) + size) % size;
  if (offset === 0) return [...items];
  return [...items.slice(offset), ...items.slice(0, offset)];
}