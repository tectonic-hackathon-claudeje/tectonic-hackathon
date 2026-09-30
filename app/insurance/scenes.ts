import type { Asset, AssetState, EgoModel, Fact, Related } from "@/lib/insurance/ego";
import { KBC, type KbcProduct } from "@/lib/insurance/kbc";

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
  /** A group or category: one picture standing for several things. */
  large?: boolean;
};
export type Side = "n" | "e" | "s" | "w" | "s2" | "ne" | "nw" | "se" | "sw";
/** `bare` territories hold one picture with its label above it, without a frame. */
export type SceneTerritory = { id: string; label: string; side: Side; nodes: SceneNode[]; bare?: boolean };
export type Scene = {
  key: string;
  title: string;
  subtitle: string;
  center: SceneNode;
  territories: SceneTerritory[];
  /** What the info panel shows for nodes that are not assets (groups, categories). */
  details: Record<string, Asset>;
  /** A family tree instead of territories: generations as rows, the centre person in row 0. */
  tree?: { level: number; nodes: SceneNode[] }[];
};

/** Where you are: a group, a category inside it, or one object. */
export type Step = { kind: "group"; id: string } | { kind: "category"; group: string; id: string } | { kind: "asset"; id: string };

const STATUS_ORDER: AssetState[] = ["gap", "upcoming", "covered", "shared", "neutral"];
const worst = (states: AssetState[]): AssetState => STATUS_ORDER.find((s) => states.includes(s)) ?? "neutral";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The smaller things around a person, in the corners. (Insurance itself is the four categories.) */
const GROUPS = [
  { id: "money", label: "Accounts & cards", glyph: "bank", side: "nw" as const },
  { id: "credit", label: "Borrowing & saving", glyph: "key", side: "sw" as const },
  { id: "family", label: "Family", glyph: "family", side: "se" as const },
];
const SIDES: Side[] = ["n", "w", "e", "s"];

const node = (a: Asset, personId: string, overrides: Partial<SceneNode> = {}): SceneNode => ({
  id: a.id,
  label: a.label,
  caption: a.caption,
  glyph: a.glyph,
  // A policy can be yours, or cover you through someone else: show the state for this person.
  state: a.kind === "policy" ? (a.personState[personId] ?? a.state) : a.state,
  ...overrides,
});

function pseudo(id: string, kind: Asset["kind"], label: string, caption: string, glyph: string, detail: string, facts: Fact[], related: Related[], source: string): Asset {
  return { id, kind, label, caption, glyph, state: "neutral", personIds: [], roles: {}, personState: {}, detail, facts, source, related, links: [] };
}

type Category = { id: string; label: string; glyph: string; assetIds: string[]; state: AssetState; caption: string; detail: string };

/** A product as this person sees it: theirs, through family, missing, coming up, or simply on offer. */
function productState(ego: EgoModel, personId: string, p: KbcProduct): AssetState {
  return ego.assets[`kbc:${p.id}`]?.personState[personId] ?? "neutral";
}

function insuranceCategories(ego: EgoModel, personId: string, onlyOpen = false): Category[] {
  return KBC.categories
    .map((c) => {
      const products = KBC.products.filter((p) => p.category === c.id);
      const states = products.map((p) => productState(ego, personId, p));
      const have = states.filter((s) => s === "covered" || s === "shared").length;
      const gaps = states.filter((s) => s === "gap").length;
      const soon = states.filter((s) => s === "upcoming").length;
      const open = products.filter((_, i) => states[i] === "gap" || states[i] === "upcoming");
      return {
        id: c.id,
        label: c.label,
        glyph: c.glyph,
        assetIds: (onlyOpen ? open : products).map((p) => `kbc:${p.id}`),
        state: worst(states.filter((s) => s !== "neutral")),
        // Words, not counts: what should the reader do about this?
        caption: onlyOpen ? `${open.length} to fix` : gaps + soon > 0 ? `${gaps + soon} to fix` : have > 0 ? "Covered" : "Nothing needed",
        detail: `${have} of ${products.length} in place.`,
      };
    })
    .filter((c) => (onlyOpen ? c.assetIds.length > 0 : true));
}

const MONEY_CATEGORY: Record<string, [string, string, string]> = {
  bank: ["current", "Current accounts", "bank"],
  piggy: ["savings", "Savings & deposits", "piggy"],
  safe: ["savings", "Savings & deposits", "piggy"],
  card: ["cards", "Cards", "card"],
  chart: ["investing", "Investing & pension", "chart"],
  coin: ["investing", "Investing & pension", "chart"],
};

function groupCategories(ego: EgoModel, personId: string, group: string): Category[] {
  if (group === "insurance") return insuranceCategories(ego, personId);
  if (group === "needs") return insuranceCategories(ego, personId, true);
  const mine = ego.byPerson[personId];
  if (group === "money") {
    const by = new Map<string, Category>();
    for (const id of mine.money) {
      const a = ego.assets[id];
      const [cid, label, glyph] = MONEY_CATEGORY[a.glyph] ?? ["other", "Other", "bank"];
      const c = by.get(cid) ?? { id: cid, label, glyph, assetIds: [], state: "neutral" as const, caption: "", detail: "" };
      c.assetIds.push(id);
      by.set(cid, c);
    }
    return [...by.values()].map((c) => ({ ...c, caption: plural(c.assetIds.length, "item"), detail: `${c.label}: ${plural(c.assetIds.length, "item")}.` }));
  }
  if (group === "credit") {
    const loans = mine.credit.filter((id) => ego.assets[id].kind === "loan");
    const goals = mine.credit.filter((id) => ego.assets[id].kind === "goal");
    return [
      { id: "loans", label: "Loans", glyph: "key", assetIds: loans },
      { id: "goals", label: "Saving goals", glyph: "flag", assetIds: goals },
    ]
      .filter((c) => c.assetIds.length > 0)
      .map((c) => ({ ...c, state: "neutral" as const, caption: plural(c.assetIds.length, "item"), detail: `${c.label}: ${plural(c.assetIds.length, "item")}.` }));
  }
  return [];
}

function groupSummary(ego: EgoModel, personId: string, g: (typeof GROUPS)[number]) {
  const mine = ego.byPerson[personId];
  switch (g.id) {
    case "insurance": {
      const cats = insuranceCategories(ego, personId);
      const have = cats.reduce((n, c) => n + c.assetIds.filter((id) => ["covered", "shared"].includes(ego.assets[id].personState[personId])).length, 0);
      return { caption: `${have} covered · 4 groups`, state: "neutral" as AssetState, detail: `What ${ego.assets[`person:${personId}`].label} has, grouped the way KBC offers it: home, mobility, person & family, travel.` };
    }
    case "money": {
      const accounts = mine.money.filter((id) => ego.assets[id].kind === "account").length;
      const cards = mine.money.length - accounts;
      return { caption: plural(accounts, "account"), state: "neutral" as AssetState, detail: `Accounts they own or can see, and ${plural(cards, "card")}.` };
    }
    case "needs": {
      const states = mine.needs.map((id) => ego.assets[id].state);
      const soon = states.filter((s) => s === "upcoming").length;
      return { caption: `${mine.needs.length} open${soon ? ` · ${soon} soon` : ""}`, state: worst(states), detail: "Cover that is missing, or will be needed soon, worked out from their policies, loans, goals and spending." };
    }
    case "credit": {
      const loans = mine.credit.filter((id) => ego.assets[id].kind === "loan").length;
      return { caption: plural(loans, "loan"), state: "neutral" as AssetState, detail: `${plural(loans, "loan")} and ${plural(mine.credit.length - loans, "saving goal")}.` };
    }
    default:
      return { caption: plural((ego.family[personId] ?? []).length, "person", "people"), state: "neutral" as AssetState, detail: "Open the family tree." };
  }
}

function groupCount(ego: EgoModel, personId: string, id: string) {
  const mine = ego.byPerson[personId];
  if (id === "insurance") return mine.insurance.length;
  if (id === "money") return mine.money.length;
  if (id === "needs") return mine.needs.length;
  if (id === "credit") return mine.credit.length;
  return (ego.family[personId] ?? []).length;
}

/** One person in the middle: the four KBC categories around them, and smaller satellites in the corners. */
export function personScene(ego: EgoModel, personId: string): Scene {
  const me = ego.assets[`person:${personId}`];
  const details: Record<string, Asset> = {};
  const territories: SceneTerritory[] = [];

  const cats = insuranceCategories(ego, personId);
  cats.forEach((c, i) => {
    const id = `cat:insurance:${c.id}`;
    details[id] = categoryPseudo(ego, personId, "insurance", c);
    territories.push({ id: `cat-${c.id}`, label: c.label, side: SIDES[i % SIDES.length], bare: true, nodes: [{ id, label: c.label, caption: c.caption, glyph: c.glyph, state: c.state, large: true }] });
  });

  for (const g of GROUPS) {
    const n = groupCount(ego, personId, g.id);
    if (n === 0) continue;
    const sum = groupSummary(ego, personId, g);
    const id = `grp:${g.id}`;
    const sub = groupCategories(ego, personId, g.id);
    details[id] = pseudo(
      id,
      "group",
      g.label,
      sum.caption,
      g.glyph,
      sum.detail,
      [{ k: "Around " + me.label, v: g.id === "family" ? plural(n, "person", "people") : plural(n, "thing") }],
      sub.map((c) => ({ id: `cat:${g.id}:${c.id}`, relation: c.caption })),
      "Grouped from the NovaBank data lake",
    );
    for (const c of sub) details[`cat:${g.id}:${c.id}`] = categoryPseudo(ego, personId, g.id, c);
    territories.push({ id: g.id, label: g.label, side: g.side, bare: true, nodes: [{ id, label: g.label, caption: sum.caption, glyph: g.glyph, state: sum.state }] });
  }

  const have = cats.reduce((n, c) => n + c.assetIds.filter((id) => ["covered", "shared"].includes(ego.assets[id].personState[personId])).length, 0);
  const open = ego.byPerson[personId].needs.length;
  return {
    key: `person:${personId}`,
    title: `${me.label}'s cover`,
    subtitle: `${have} covered · ${open} to look at`,
    center: { id: me.id, label: me.label, caption: me.caption, glyph: me.glyph, state: "neutral" },
    territories,
    details,
  };
}

const STATE_WORDS: Record<string, string> = { covered: "in place", shared: "via family", gap: "missing", upcoming: "needed soon" };

function categoryPseudo(ego: EgoModel, personId: string, group: string, c: Category): Asset {
  const related: Related[] =
    group === "insurance" || group === "needs"
      ? c.assetIds.flatMap((id) => {
          const st = ego.assets[id]?.personState[personId];
          return st ? [{ id, relation: STATE_WORDS[st] ?? st }] : [];
        })
      : c.assetIds.map((id) => ({ id, relation: "includes" }));
  return pseudo(`cat:${group}:${c.id}`, "category", c.label, c.caption, c.glyph, c.detail, [], related, "Grouped from the NovaBank data lake and the KBC product grouping");
}

function groupLabel(id: string) {
  return GROUPS.find((g) => g.id === id)?.label ?? id;
}

/** Inside a group: its categories, around the group. */
export function groupScene(ego: EgoModel, personId: string, group: string): Scene {
  const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0];
  const me = ego.assets[`person:${personId}`];
  const details: Record<string, Asset> = {};
  const sum = groupSummary(ego, personId, g);
  const center: SceneNode = { id: `grp:${group}`, label: g.label, caption: sum.caption, glyph: g.glyph, state: sum.state };
  details[center.id] = pseudo(center.id, "group", g.label, sum.caption, g.glyph, sum.detail, [], [], "Grouped from the NovaBank data lake");

  if (group === "family") {
    // Generations as rows: parents above, spouse and siblings beside, children below.
    const LEVEL: Record<string, number> = { grandparent: -2, parent: -1, spouse: 0, sibling: 0, child: 1, grandchild: 2 };
    const ORDER = ["spouse", "sibling"];
    const rows = new Map<number, SceneNode[]>();
    for (const r of [...(ego.family[personId] ?? [])].sort((a, b) => ORDER.indexOf(a.relation) - ORDER.indexOf(b.relation))) {
      const p = ego.assets[`person:${r.id}`];
      const level = LEVEL[r.relation] ?? 0;
      rows.set(level, [...(rows.get(level) ?? []), { id: p.id, label: p.label, caption: r.relation, glyph: p.glyph, state: "neutral" as const, faded: true }]);
    }
    const self: SceneNode = { ...center, id: me.id, label: me.label, caption: me.caption, glyph: me.glyph, state: "neutral" };
    details[self.id] = me;
    return {
      key: `group:${personId}:${group}`,
      title: "Family tree",
      subtitle: `${me.label}'s family, oldest at the top`,
      center: self,
      territories: [],
      details,
      tree: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([level, nodes]) => ({ level, nodes })),
    };
  }

  const cats = groupCategories(ego, personId, group);
  details[center.id].related = cats.map((c) => ({ id: `cat:${group}:${c.id}`, relation: c.caption }));
  const territories: SceneTerritory[] = cats.map((c, i) => {
    details[`cat:${group}:${c.id}`] = categoryPseudo(ego, personId, group, c);
    return {
      id: c.id,
      label: c.label,
      side: SIDES[i % SIDES.length],
      bare: true,
      nodes: [{ id: `cat:${group}:${c.id}`, label: c.label, caption: c.caption, glyph: c.glyph, state: c.state, large: true }],
    };
  });
  return { key: `group:${personId}:${group}`, title: g.label, subtitle: `${plural(cats.length, "category", "categories")} for ${me.label}`, center, territories, details };
}

/** Inside a category: the actual products and items. */
export function categoryScene(ego: EgoModel, personId: string, group: string, category: string, showAll = false): Scene {
  const me = ego.assets[`person:${personId}`];
  const cats = groupCategories(ego, personId, group === "needs" ? "insurance" : group);
  const cat = cats.find((c) => c.id === category) ?? cats[0];
  const details: Record<string, Asset> = {};
  const center: SceneNode = { id: `cat:${group}:${cat.id}`, label: cat.label, caption: cat.caption, glyph: cat.glyph, state: cat.state };
  details[center.id] = categoryPseudo(ego, personId, group, cat);

  const insurance = group === "insurance" || group === "needs";
  if (insurance) {
    const products = KBC.products.filter((p) => p.category === cat.id);
    const asNode = (p: KbcProduct): SceneNode => {
      const a = ego.assets[`kbc:${p.id}`];
      const state = productState(ego, personId, p);
      const via = a.via?.[personId] ? ego.assets[a.via[personId]] : undefined;
      // One word under each: who provides it, or what to do about it.
      const caption = state === "neutral" ? "" : via?.kind === "policy" ? (state === "shared" ? "Via family" : via.caption.split(" · ")[0]) : state === "upcoming" ? "Soon" : "Missing";
      return { id: a.id, label: p.short, caption, glyph: p.glyph, state, faded: state === "neutral" };
    };
    const covered = products.filter((p) => ["covered", "shared"].includes(productState(ego, personId, p)));
    const open = products.filter((p) => ["gap", "upcoming"].includes(productState(ego, personId, p)));
    const rest = products.filter((p) => productState(ego, personId, p) === "neutral");
    const more: SceneTerritory =
      showAll || rest.length === 0
        ? { id: "offer", label: "More from KBC", side: "n", nodes: rest.map(asNode) }
        : { id: "offer", label: "", side: "n", bare: true, nodes: [{ id: `more:${cat.id}`, label: `${rest.length} more`, caption: "KBC products", glyph: cat.glyph, state: "neutral", faded: true }] };
    const territories = ([
      { id: "have", label: "In place", side: "w", nodes: covered.map(asNode) },
      { id: "open", label: "To fix", side: "e", nodes: open.map(asNode) },
      more,
    ] as SceneTerritory[]).filter((t) => t.nodes.length > 0);
    return { key: `category:${personId}:${group}:${cat.id}${showAll ? ":all" : ""}`, title: cat.label, subtitle: `${covered.length} of ${products.length} in place`, center, territories, details };
  }

  const items = cat.assetIds.map((id) => ego.assets[id]).filter(Boolean);
  return {
    key: `category:${personId}:${group}:${cat.id}`,
    title: cat.label,
    subtitle: `${plural(items.length, "item")} for ${me.label}`,
    center,
    territories: [{ id: "items", label: cat.label, side: "n", nodes: items.map((a) => node(a, personId)) }],
    details,
  };
}

/** The label for a step in the breadcrumb. */
export function stepLabel(ego: EgoModel, step: Step, personId: string): string {
  if (step.kind === "group") return groupLabel(step.id);
  if (step.kind === "category") return groupCategories(ego, personId, step.group === "needs" ? "insurance" : step.group).find((c) => c.id === step.id)?.label ?? step.id;
  return ego.assets[step.id]?.label ?? step.id;
}

const FACT_GLYPH: Record<string, string> = { Premium: "coin", Balance: "coin", Borrowed: "coin", "Still owed": "coin", Saved: "coin", Target: "flag", Renews: "flag", Ends: "flag", By: "flag", Opened: "flag", Matures: "flag", Covers: "home", Insured: "adult", IBAN: "bank" };

/** One object in the middle: who it is for, what it is tied to, and what it could grow into. */
export function assetScene(ego: EgoModel, assetId: string, personId: string): Scene {
  const a = ego.assets[assetId];
  const people = a.personIds.map((id) => ego.assets[`person:${id}`]).filter(Boolean);
  const linked = a.related.filter((r) => !r.id.startsWith("person:")).map((r) => ({ r, asset: ego.assets[r.id] })).filter((x) => x.asset);
  const next: Asset[] = a.kind === "policy" ? Object.values(ego.assets).filter((g) => g.kind === "gap" && g.related.some((r) => r.id === a.id)) : [];
  const territories = ([
    {
      id: "who",
      label: a.kind === "gap" ? "Missing for" : a.kind === "policy" ? "Covers" : a.kind === "product" ? "Applies to" : "Belongs to",
      side: "n",
      nodes: people.map((p) => ({ id: p.id, label: p.label, caption: "", glyph: p.glyph, state: "neutral" as const, faded: p.id !== `person:${personId}` })),
    },
    { id: "linked", label: "Goes with", side: "w", nodes: linked.map(({ asset }) => node(asset, personId)) },
    {
      id: "next",
      label: "Could add",
      side: "e",
      nodes: next.map((g) => {
        const who = g.personIds[0];
        const name = ego.assets[`person:${who}`]?.label ?? who;
        return node(g, personId, { caption: who === personId ? "" : name, faded: who !== personId });
      }),
    },
  ] as SceneTerritory[]).filter((t) => t.nodes.length > 0);
  return {
    key: `asset:${assetId}`,
    title: a.label,
    subtitle: `${a.caption}`,
    center: { id: a.id, label: a.label, caption: a.caption, glyph: a.glyph, state: a.kind === "policy" ? (a.personState[personId] ?? a.state) : a.state },
    territories,
    details: {},
  };
}
