// Builds data/kbc-insurance-catalogue.json from data/kbc_insurance_catalogue.csv.
// The CSV is the source of truth: edit it, then run `npm run build:catalogue`.
import { readFileSync, writeFileSync } from "node:fs";

function parse(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...body] = parse(readFileSync("data/kbc_insurance_catalogue.csv", "utf8"));
const records = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));

const categories = [];
const products = [];
const policyCovers = {};
for (const r of records) {
  if (!categories.some((c) => c.id === r.category_id)) categories.push({ id: r.category_id, label: r.category, glyph: r.category_glyph });
  // "also_in" puts a product in a second category too, e.g. "home:Home loan" for loan insurance.
  const alsoIn = r.also_in ? r.also_in.split("|").map((x) => { const [category, branch] = x.split(":"); return { category, branch }; }) : [];
  products.push({ id: r.product_id, category: r.category_id, name: r.product, short: r.short_label, covers: r.covers, glyph: r.glyph, branch: r.branch, alsoIn });
  if (r.stands_for_policy) (policyCovers[r.stands_for_policy] ??= []).push(r.product_id);
}
const out = {
  source: "Generated from data/kbc_insurance_catalogue.csv (the team's KBC grouping). Mock data, not an official KBC price list.",
  categories,
  products,
  policyCovers,
};
writeFileSync("data/kbc-insurance-catalogue.json", JSON.stringify(out, null, 2) + "\n");
console.log(`${categories.length} categories, ${products.length} products`);
