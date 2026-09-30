import type { Asset, AssetState, EgoModel } from "@/lib/insurance/ego";

export type SceneNode = {
  id: string;
  label: string;
  caption: string;
  glyph: string;
  state: AssetState;
  /** Drawn in lighter shades: someone (or something) that is not the person being looked at. */
  faded?: boolean;
  /** A fact rather than an object: shown, but there is nothing to open. */
  info?: boolean;
};
export type Side = "n" | "e" | "s" | "w" | "s2";
export type SceneTerritory = { id: string; label: string; side: Side; nodes: SceneNode[] };
export type Scene = { key: string; title: string; subtitle: string; center: SceneNode; territories: SceneTerritory[] };

const node = (a: Asset, personId: string, overrides: Partial<SceneNode> = {}): SceneNode => ({
  id: a.id,
  label: a.label,
  caption: a.caption,
  glyph: a.glyph,
  // A policy can be yours, or cover you through someone else: show the state for this person.
  state: a.kind === "policy" ? (a.personState[personId] ?? a.state) : a.state,
  ...overrides,
});

const count = (t: SceneTerritory[]) => t.reduce((n, x) => n + x.nodes.length, 0);

/** One person in the middle, everything of theirs around them. */
export function personScene(ego: EgoModel, personId: string): Scene {
  const me = ego.assets[`person:${personId}`];
  const mine = ego.byPerson[personId];
  const pick = (ids: string[]) => ids.map((id) => ego.assets[id]).filter(Boolean);
  const territories = ([
    { id: "insurance", label: "Insurance", side: "n", nodes: pick(mine.insurance).map((a) => node(a, personId)) },
    {
      id: "money",
      label: "Accounts & cards",
      side: "w",
      nodes: pick(mine.money).map((a) => node(a, personId, { caption: a.roles[personId] && a.roles[personId] !== "owner" && a.roles[personId] !== "holder" ? `${a.roles[personId]} · ${a.caption}` : a.caption })),
    },
    { id: "credit", label: "Borrowing & saving", side: "s", nodes: pick(mine.credit).map((a) => node(a, personId)) },
    { id: "needs", label: "Missing & coming up", side: "e", nodes: pick(mine.needs).map((a) => node(a, personId)) },
    {
      id: "family",
      label: "Family",
      side: "s2",
      nodes: (ego.family[personId] ?? []).map((r) => {
        const p = ego.assets[`person:${r.id}`];
        return { id: p.id, label: p.label, caption: r.relation, glyph: p.glyph, state: "neutral" as const, faded: true };
      }),
    },
  ] as SceneTerritory[]).filter((t) => t.nodes.length > 0);
  const things = count(territories.filter((t) => t.id !== "family"));
  return {
    key: `person:${personId}`,
    title: `${me.label}'s cover`,
    subtitle: `${things} things around ${me.label}`,
    center: { id: me.id, label: me.label, caption: me.caption, glyph: me.glyph, state: "neutral" },
    territories,
  };
}

const FACT_GLYPH: Record<string, string> = { Premium: "coin", Balance: "coin", Borrowed: "coin", "Still owed": "coin", Saved: "coin", Target: "flag", Renews: "flag", Ends: "flag", By: "flag", Opened: "flag", Matures: "flag", Covers: "home", Insured: "adult", IBAN: "bank" };

/** One object in the middle: who it is for, what it is tied to, and what it could grow into. */
export function assetScene(ego: EgoModel, assetId: string, personId: string): Scene {
  const a = ego.assets[assetId];
  const people = a.personIds.map((id) => ego.assets[`person:${id}`]).filter(Boolean);
  const linked = a.related.filter((r) => !r.id.startsWith("person:")).map((r) => ({ r, asset: ego.assets[r.id] })).filter((x) => x.asset);
  const next: Asset[] =
    a.kind === "policy" && a.coverId
      ? Object.values(ego.assets).filter((g) => g.kind === "gap" && g.related.some((r) => r.id === a.id))
      : [];
  const territories = ([
    {
      id: "who",
      label: a.kind === "gap" ? "Who it is missing for" : "Who it is for",
      side: "n",
      nodes: people.map((p) => ({ id: p.id, label: p.label, caption: a.roles[p.id.replace("person:", "")] ?? p.caption, glyph: p.glyph, state: "neutral" as const, faded: p.id !== `person:${personId}` })),
    },
    { id: "linked", label: "Tied to", side: "w", nodes: linked.map(({ r, asset }) => node(asset, personId, { caption: r.relation })) },
    {
      id: "facts",
      label: "The details",
      side: "s",
      nodes: a.facts.slice(0, 6).map((f) => ({ id: `fact:${assetId}:${f.k}`, label: f.k, caption: f.v, glyph: FACT_GLYPH[f.k] ?? "mortgage", state: "neutral" as const, info: true })),
    },
    {
      id: "next",
      label: "Could grow into",
      side: "e",
      nodes: next.map((g) => {
        const who = g.personIds[0];
        const name = ego.assets[`person:${who}`]?.label ?? who;
        return node(g, personId, { caption: `${name} · ${g.caption}`, faded: who !== personId });
      }),
    },
  ] as SceneTerritory[]).filter((t) => t.nodes.length > 0);
  return {
    key: `asset:${assetId}`,
    title: a.label,
    subtitle: `${a.caption}`,
    center: { id: a.id, label: a.label, caption: a.caption, glyph: a.glyph, state: a.kind === "policy" ? (a.personState[personId] ?? a.state) : a.state },
    territories,
  };
}
