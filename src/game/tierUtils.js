export function withAlpha(hex, alphaHex) {
  if (typeof hex !== "string") return "#000000";
  const cleaned = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return "#000000";
  return `#${cleaned}${alphaHex}`;
}

export function normalizeTiers(tiers) {
  const out = {};
  Object.entries(tiers || {}).forEach(([key, value]) => {
    const color = String(value?.color || "#ffffff");
    out[key] = {
      min: Number(value?.min || 0),
      max: Number(value?.max || 0),
      price: Number(value?.price || 0),
      color,
      bg: value?.bg || withAlpha(color, "18"),
      border: value?.border || withAlpha(color, "55"),
    };
  });
  return out;
}

export function cloneTierConfig(tiers) {
  const out = {};
  Object.entries(tiers || {}).forEach(([key, value]) => {
    out[key] = {
      min: Number(value.min),
      max: Number(value.max),
      price: Number(value.price),
      color: String(value.color),
    };
  });
  return out;
}
