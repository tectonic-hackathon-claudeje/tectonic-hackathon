import kbc from "@/data/kbc-insurance-catalogue.json";

// Client-safe: no file access here, so the browser bundle can use the catalogue.
export type KbcProduct = { id: string; category: string; name: string; short: string; covers: string; glyph: string; branch: string; alsoIn: { category: string; branch: string }[] };
export type KbcCategory = { id: string; label: string; glyph: string };
export const KBC = { categories: kbc.categories as KbcCategory[], products: kbc.products as KbcProduct[], policyCovers: kbc.policyCovers as Record<string, string[]> };
