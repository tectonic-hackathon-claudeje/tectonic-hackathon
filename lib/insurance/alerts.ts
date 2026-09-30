import type { AccessLevel, Asset, EgoModel, Reply } from "./ego";

/**
 * The open gaps for one person (most pressing first), and the pressing ones for the rest of the family.
 * Nothing the viewer may not see, and nothing they have said they do not need, is in here.
 */
export function alertsFor(ego: EgoModel, personId: string, levelOf: (id: string) => AccessLevel, responses: Record<string, Reply> = {}) {
  const rank = (a: Asset) => (a.kind === "employer" ? 4 : a.state === "upcoming" ? 0 : a.priority === "high" ? 1 : a.priority === "medium" ? 2 : 3);
  const all = Object.values(ego.assets)
    .filter((a) => (a.kind === "gap" || a.kind === "employer") && !responses[a.id] && levelOf(a.personIds[0]) !== "none")
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  return {
    mine: all.filter((a) => a.personIds.includes(personId)),
    // The rest of the family, but only what is pressing.
    others: all.filter((a) => !a.personIds.includes(personId) && rank(a) <= 1).slice(0, 6),
  };
}
