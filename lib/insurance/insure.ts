import type { Asset, EgoModel } from "./ego";

/**
 * The world after some missing covers have been taken out (demo: nothing is really bought).
 * Each insured gap becomes a policy, the danger disappears, the product and the home it is for
 * count as covered, and everyone who shares the gap on the same home is insured together.
 */
export function applyInsured(ego: EgoModel, gapIds: string[]): EgoModel {
  if (gapIds.length === 0) return ego;
  const assets: Record<string, Asset> = { ...ego.assets };
  const byPerson = { ...ego.byPerson };

  for (const gapId of gapIds) {
    const gap = ego.assets[gapId];
    if (!gap || gap.kind !== "gap") continue;
    const property = gap.related.map((r) => ego.assets[r.id]).find((a) => a?.kind === "property");
    const group = [gap, ...Object.values(ego.assets).filter((a) => a.kind === "gap" && a.id !== gap.id && a.kbcId === gap.kbcId && property && a.related.some((r) => r.id === property.id))];
    const people = [...new Set(group.flatMap((g) => g.personIds))];
    const newId = `pol:new:${gapId}`;
    const template = Object.values(ego.assets).find((a) => a.kind === "policy" && a.coverId && a.coverId === gap.coverId && !a.id.startsWith("pol:new"));
    const monthly = gap.product?.monthly ?? 0;
    const name = (gap.product?.name ?? gap.label).replace(/^KBC /, "");

    assets[newId] = {
      id: newId,
      kind: "policy",
      label: name,
      caption: `KBC · €${monthly} monthly`,
      glyph: gap.glyph,
      state: "covered",
      personIds: people,
      roles: Object.fromEntries(people.map((p) => [p, "insured"])),
      personState: Object.fromEntries(people.map((p) => [p, "covered" as const])),
      detail: `${name}, taken out just now (demo).`,
      facts: [{ k: "Insurer", v: "KBC" }, { k: "Premium", v: `€${monthly} monthly (estimate)` }],
      source: "Demo: nothing was really bought",
      related: property ? [{ id: property.id, relation: "insures" }] : [],
      links: gap.links,
      coverId: gap.coverId,
      products: gap.kbcId ? [gap.kbcId] : [],
      scenarios: template?.scenarios,
      meta: { monthly },
    };

    for (const g of group) delete assets[g.id];
    const productId = gap.kbcId ? `kbc:${gap.kbcId}` : "";
    const product = assets[productId];
    if (product)
      assets[productId] = {
        ...product,
        personState: { ...product.personState, ...Object.fromEntries(people.map((p) => [p, "covered" as const])) },
        via: { ...(product.via ?? {}), ...Object.fromEntries(people.map((p) => [p, newId])) },
      };
    if (property) {
      const current = assets[property.id];
      assets[property.id] = {
        ...current,
        state: "covered",
        personState: { ...current.personState, ...Object.fromEntries(people.map((p) => [p, "covered" as const])) },
        related: [...current.related.filter((r) => !r.id.startsWith("gap:")), { id: newId, relation: "insured by" }],
      };
    }
    for (const p of people)
      byPerson[p] = { ...byPerson[p], insurance: [...byPerson[p].insurance, newId], needs: byPerson[p].needs.filter((id) => !group.some((g) => g.id === id)) };
  }
  return { ...ego, assets, byPerson };
}
