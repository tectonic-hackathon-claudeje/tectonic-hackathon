import art from "./pixel-art.json";

/**
 * Pixel-art glyphs, 24 by 24, in three tones: ink (`#`), a soft fill (`o`) and an accent (`+`).
 * Generated from vector drawings by `npm run build:pixel-art`, so every glyph shares one weight
 * and one style. Every asset the map can show has one.
 */
const ART = art as Record<string, string[]>;
const GRID = 24;

type Paths = { ink: string; soft: string; accent: string };
const cache = new Map<string, Paths>();
function pathsFor(id: string): Paths {
  const hit = cache.get(id);
  if (hit) return hit;
  const rows = ART[id] ?? ART.coin;
  const out: Paths = { ink: "", soft: "", accent: "" };
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const cell = `M${x} ${y}h1v1h-1z`;
      if (c === "#") out.ink += cell;
      else if (c === "o") out.soft += cell;
      else if (c === "+") out.accent += cell;
    }),
  );
  cache.set(id, out);
  return out;
}

/** Drawn inside an <svg>: a glyph of `size` px with its top-left at (x, y). */
export function PixelGlyph({ id, x = 0, y = 0, size = 48, ink = "currentColor", accent = "var(--accent)" }: { id: string; x?: number; y?: number; size?: number; ink?: string; accent?: string }) {
  const p = pathsFor(id);
  return (
    <g transform={`translate(${x} ${y}) scale(${size / GRID})`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={p.soft} fill={ink} fillOpacity={0.3} />
      <path d={p.ink} fill={ink} />
      <path d={p.accent} fill={accent} />
    </g>
  );
}

/** The same glyph as a standalone element, for use in the page rather than inside the map. */
export function PixelIcon({ id, size = 24, ink = "currentColor", accent = "var(--accent)" }: { id: string; size?: number; ink?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} role="img" aria-hidden="true" style={{ display: "block" }}>
      <PixelGlyph id={id} size={GRID} ink={ink} accent={accent} />
    </svg>
  );
}

export const PIXEL_IDS = Object.keys(ART);
