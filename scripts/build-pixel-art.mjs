// Builds app/insurance/pixel-art.json: every glyph as a 24x24 pixel grid.
// Icons are drawn as vectors on a 24-unit grid in three layers (soft fill, ink outline, accent)
// and rasterised with sharp, so they all share one weight and one style.
//   '#' ink   'o' soft tone   '+' accent   '.' empty
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const F = 'fill="#000" stroke="none"';
const person = (dx = 0) => `<g transform="translate(${dx} 0)"><circle cx="12" cy="7.5" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></g>`;

// soft: filled shapes. ink: 2px outlines. acc: 2px strokes, or filled where marked.
const ICONS = {
  adult: { soft: person(), ink: person(), acc: `<path d="M12 14.5v5"/>` },
  elder: { soft: person(-2), ink: person(-2), acc: `<path d="M21 13v9M21 13a2 2 0 0 0-4 0"/>` },
  young: { soft: person(), ink: person(), acc: `<path d="M7.5 6.5a4.5 4.5 0 0 1 9 0z" ${F}/><path d="M12 6.5h8"/>` },
  family: {
    soft: `<circle cx="7" cy="6.5" r="3"/><path d="M1.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/><circle cx="17" cy="6.5" r="3"/><path d="M11.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/>`,
    ink: `<circle cx="7" cy="6.5" r="3"/><path d="M1.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/><circle cx="17" cy="6.5" r="3"/><path d="M11.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/>`,
    acc: `<circle cx="12" cy="13" r="2.2" ${F}/><path d="M8.5 21v-1.5a3.5 3.5 0 0 1 7 0V21z" ${F}/>`,
  },
  bank: { soft: `<path d="M3 10 12 4l9 6z"/>`, ink: `<path d="M3 10 12 4l9 6z"/><path d="M6 12v6M12 12v6M18 12v6M3 21h18"/>`, acc: `<circle cx="12" cy="8.5" r="1.3" ${F}/>` },
  piggy: {
    soft: `<ellipse cx="11.5" cy="13" rx="8" ry="6"/>`,
    ink: `<ellipse cx="11.5" cy="13" rx="8" ry="6"/><path d="M15 8l2.5-3 1 4M7 18v3M16 18v3"/>`,
    acc: `<path d="M9 8.3h4"/><rect x="19" y="11" width="3" height="4" ${F}/><circle cx="15" cy="12" r="1" ${F}/>`,
  },
  coin: { soft: `<circle cx="12" cy="12" r="9"/>`, ink: `<circle cx="12" cy="12" r="9"/>`, acc: `<path d="M15 9.2a3.6 3.6 0 1 0 0 5.6M8 11h5M8 13.4h5"/>` },
  card: { soft: `<rect x="2" y="5" width="20" height="14" rx="2"/>`, ink: `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20" stroke-width="3"/>`, acc: `<rect x="5" y="14" width="5" height="2.5" ${F}/>` },
  chart: {
    soft: ``,
    ink: `<path d="M3 3v18h18"/><rect x="6" y="12" width="3" height="6" ${F}/><rect x="11" y="8" width="3" height="10" ${F}/>`,
    acc: `<rect x="16" y="5" width="3" height="13" ${F}/>`,
  },
  safe: {
    soft: `<rect x="3" y="4" width="18" height="16" rx="2"/>`,
    ink: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M6 20v2M18 20v2"/>`,
    acc: `<path d="M12 12l2.5-2.5"/><circle cx="12" cy="12" r="1" ${F}/>`,
  },
  key: { soft: `<circle cx="8" cy="10" r="5"/>`, ink: `<circle cx="8" cy="10" r="5"/><path d="M13 10h9M19 10v4M22 10v3"/>`, acc: `<circle cx="8" cy="10" r="1.6" ${F}/>` },
  flag: { soft: `<path d="M5 4h14l-3 4 3 4H5z"/>`, ink: `<path d="M5 3v19"/><path d="M5 4h14l-3 4 3 4H5"/>`, acc: `<circle cx="9" cy="8" r="1.2" ${F}/>` },
  home: { soft: `<path d="M5 10v11h14V10L12 4z"/>`, ink: `<path d="M3 11 12 3l9 8"/><path d="M5 10v11h14V10"/>`, acc: `<rect x="10" y="14" width="4" height="7" ${F}/>` },
  hospital: { soft: `<rect x="3" y="3" width="18" height="18" rx="3"/>`, ink: `<rect x="3" y="3" width="18" height="18" rx="3"/>`, acc: `<path d="M12 7v10M7 12h10" stroke-width="3"/>` },
  travel: { soft: `<path d="M21 3 3 10l7 3 3 7z"/>`, ink: `<path d="M21 3 3 10l7 3 3 7z"/><path d="M10 13 21 3"/>`, acc: `<path d="M2 16h4M1 20h6"/>` },
  liability: { soft: `<path d="M2 12a10 10 0 0 1 20 0z"/>`, ink: `<path d="M2 12a10 10 0 0 1 20 0z"/><path d="M12 12v7a2.5 2.5 0 0 1-5 0"/>`, acc: `<path d="M12 12V3"/>` },
  legal: {
    soft: `<path d="M4 7l-3 7a3 3 0 0 0 6 0z"/><path d="M20 7l-3 7a3 3 0 0 0 6 0z"/>`,
    ink: `<path d="M12 3v17M4 7h16M7 21h10"/><path d="M4 7l-3 7a3 3 0 0 0 6 0z"/><path d="M20 7l-3 7a3 3 0 0 0 6 0z"/>`,
    acc: `<circle cx="12" cy="4" r="1.6" ${F}/>`,
  },
  contents: { soft: `<rect x="4" y="5" width="16" height="11" rx="1"/>`, ink: `<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 19h20"/>`, acc: `<rect x="7" y="8" width="6" height="2" ${F}/>` },
  fraud: { soft: `<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>`, ink: `<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>`, acc: `<path d="M8 12l3 3 5-6"/>` },
  roadside: {
    soft: `<path d="M15 4a5 5 0 0 0-3 6L3 19l2 2 9-9a5 5 0 0 0 6-3l-3 1-2-2 1-3z"/>`,
    ink: `<path d="M15 4a5 5 0 0 0-3 6L3 19l2 2 9-9a5 5 0 0 0 6-3l-3 1-2-2 1-3z"/>`,
    acc: `<circle cx="5.5" cy="18.5" r="1.1" ${F}/>`,
  },
  care: { soft: `<path d="M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z"/>`, ink: `<path d="M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z"/>`, acc: `<path d="M12 9v6M9 12h6"/>` },
  income: { soft: `<rect x="2" y="6" width="20" height="14" rx="2"/>`, ink: `<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/>`, acc: `<rect x="15" y="13" width="7" height="4" ${F}/>` },
  mortgage: { soft: `<path d="M6 2h9l5 5v15H6z"/>`, ink: `<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/>`, acc: `<path d="M9 12h8M9 16h8"/>` },
  paw: {
    soft: `<ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="5" cy="10" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="19" cy="10" r="2"/>`,
    ink: `<ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="5" cy="10" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="19" cy="10" r="2"/>`,
    acc: `<ellipse cx="12" cy="16.5" rx="2.2" ry="1.6" ${F}/>`,
  },
  suitcase: { soft: `<rect x="3" y="7" width="18" height="13" rx="2"/>`, ink: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3"/>`, acc: `<path d="M3 13h18"/><rect x="11" y="12" width="2" height="3" ${F}/>` },
  lock: {
    soft: `<rect x="4" y="10" width="16" height="11" rx="2"/>`,
    ink: `<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>`,
    acc: `<circle cx="12" cy="15" r="1.8" ${F}/><rect x="11.2" y="15" width="1.6" height="3.5" ${F}/>`,
  },
  tree: {
    soft: `<circle cx="12" cy="9" r="6.5"/>`,
    ink: `<circle cx="12" cy="9" r="6.5"/><path d="M12 15.5V22M8 22h8"/>`,
    acc: `<circle cx="9.5" cy="8" r="1.1" ${F}/><circle cx="14.5" cy="10.5" r="1.1" ${F}/>`,
  },
  wave: { soft: ``, ink: `<path d="M2 8q2.5-3 5 0t5 0 5 0 5 0"/><path d="M2 14q2.5-3 5 0t5 0 5 0 5 0"/>`, acc: `<path d="M2 20q2.5-3 5 0t5 0 5 0 5 0"/>` },
  shovel: { soft: `<path d="M8 10h8l-1 8a3 3 0 0 1-6 0z"/>`, ink: `<path d="M12 2v8M9 2h6"/><path d="M8 10h8l-1 8a3 3 0 0 1-6 0z"/>`, acc: `<path d="M3 22h18"/>` },
  gem: {
    soft: `<path d="M3 9l4-6h10l4 6-9 12z"/>`,
    ink: `<path d="M3 9l4-6h10l4 6-9 12z"/><path d="M3 9h18" stroke-width="1.6"/>`,
    acc: `<path d="M12 9v4"/>`,
  },
  bike: { soft: ``, ink: `<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h6l2 8M10 8l4 8"/>`, acc: `<path d="M8.5 6h3M15 6h3"/>` },
  alert: { soft: `<path d="M12 3 2 21h20z"/>`, ink: `<path d="M12 3 2 21h20z"/>`, acc: `<path d="M12 9v5"/><rect x="11" y="16.5" width="2" height="2" ${F}/>` },
  flower: {
    soft: `<path d="M6 4c0 6 2.5 8.5 6 8.5S18 10 18 4l-3.2 2.2L12 3 9.2 6.2z"/>`,
    ink: `<path d="M6 4c0 6 2.5 8.5 6 8.5S18 10 18 4l-3.2 2.2L12 3 9.2 6.2z"/><path d="M12 12.5V22"/>`,
    acc: `<path d="M12 19c-4-.5-6-2.5-6-5 4 0 6 2 6 5z" ${F}/>`,
  },
  car: {
    soft: `<path d="M2 16v-3l2.5-5.5A2 2 0 0 1 6.4 6h11.2a2 2 0 0 1 1.9 1.5L22 13v3z"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="17.5" r="2.5"/>`,
    ink: `<path d="M2 16v-3l2.5-5.5A2 2 0 0 1 6.4 6h11.2a2 2 0 0 1 1.9 1.5L22 13v3z"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="17.5" r="2.5"/>`,
    acc: `<path d="M7.5 8h9l1.5 4H6z" ${F}/>`,
  },
};

const SIZE = 24;
async function layer(markup, kind) {
  if (!markup.trim()) return new Uint8Array(SIZE * SIZE);
  const attrs = kind === "soft" ? `fill="#000" stroke="none"` : `fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24"><g ${attrs}>${markup}</g></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) out[i] = data[i * info.channels + (info.channels - 1)] >= 110 ? 1 : 0;
  return out;
}

const art = {};
for (const [id, spec] of Object.entries(ICONS)) {
  const [soft, ink, acc] = await Promise.all([layer(spec.soft, "soft"), layer(spec.ink, "ink"), layer(spec.acc, "acc")]);
  art[id] = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => { const i = y * SIZE + x; return acc[i] ? "+" : ink[i] ? "#" : soft[i] ? "o" : "."; }).join(""));
}
writeFileSync("app/insurance/pixel-art.json", JSON.stringify(art));
console.log(`${Object.keys(art).length} glyphs`);
