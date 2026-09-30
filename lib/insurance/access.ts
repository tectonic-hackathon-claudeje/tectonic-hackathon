import type { EgoModel } from "./ego";

/**
 * The world as one viewer may see it. Where nothing is shared with someone (no joint account, no
 * mandate, no view access), only the cover both people are on stays visible; their gaps, accounts,
 * loans and alerts are simply not there. Everything else (scenes, bell, assistant) reads this view,
 * so there is one place where privacy is decided.
 */
export function forViewer(ego: EgoModel, viewer: string): EgoModel {
  const hidden = new Set(Object.entries(ego.access[viewer] ?? {}).filter(([, level]) => level === "none").map(([id]) => id));
  if (hidden.size === 0) return ego;

  const assets = { ...ego.assets };
  // A policy is shared when the viewer is on it too.
  const shared = (id: string) => Boolean(ego.assets[id]?.kind === "policy" && ego.assets[id].personState[viewer]);

  // On a shared policy, someone you cannot see is simply covered: their plans and needs stay theirs.
  const plain = (s: string | undefined) => (s === "covered" || s === "shared" ? s : "shared");

  for (const [id, a] of Object.entries(ego.assets)) {
    if ((a.kind === "gap" || a.kind === "employer") && a.personIds.every((p) => hidden.has(p))) delete assets[id];
    else if (a.kind === "policy") {
      const personState = { ...a.personState };
      for (const p of hidden) if (personState[p]) personState[p] = plain(personState[p]);
      assets[id] = { ...a, personState };
    } else if (a.kind === "product") {
      const personState = { ...a.personState };
      const via = { ...(a.via ?? {}) };
      for (const p of hidden) {
        if (!shared(via[p] ?? "")) {
          delete personState[p];
          delete via[p];
        } else personState[p] = plain(personState[p]);
      }
      assets[id] = { ...a, personState, via };
    } else if (a.kind === "property") {
      const personState = { ...a.personState };
      for (const p of hidden) if (personState[p]) personState[p] = plain(personState[p]);
      assets[id] = { ...a, personState };
    }
  }

  const byPerson = { ...ego.byPerson };
  for (const p of hidden)
    byPerson[p] = { insurance: ego.byPerson[p].insurance.filter(shared), money: [], credit: [], needs: [] };
  return { ...ego, assets, byPerson };
}
