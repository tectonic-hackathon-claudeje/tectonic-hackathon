import type { Asset, EgoModel } from "@/lib/insurance/ego";
import { KBC } from "@/lib/insurance/kbc";
import type { InsuranceModel } from "@/lib/insurance/model";
import type { Step } from "./scenes";

/** What the assistant can do for you: take you somewhere, switch person, or add to the proposal. */
export type Action =
  | { kind: "go"; label: string; steps: Step[]; person?: string }
  | { kind: "person"; label: string; person: string }
  | { kind: "add"; label: string; covers: string[] };
export type Answer = { text: string; actions: Action[] };

export type Context = {
  ego: EgoModel;
  model: InsuranceModel;
  personId: string;
  shown: Asset;
  /** Gaps for this person, most pressing first. */
  mine: Asset[];
  proposal: string[];
};

/** Where to look to see a gap: its KBC category, then the gap itself. */
export function stepsForGap(a: Asset): Step[] {
  const category = KBC.products.find((p) => p.id === a.kbcId)?.category;
  return category ? [{ kind: "category", group: "insurance", id: category }, { kind: "asset", id: a.id }] : [{ kind: "asset", id: a.id }];
}

// Plain words people use, pointing at KBC products.
const WORDS: [RegExp, string[]][] = [
  [/scam|fraud|phish|cyber|hack|identity|online|fake/, ["cybersecure"]],
  [/hospital|medical|surgery|doctor|health|ill/, ["hospitalisation"]],
  [/liabil|damage to others|neighbo|kids break/, ["family"]],
  [/legal|lawyer|dispute|court|sue/, ["car-legal", "building-legal", "travel-legal"]],
  [/travel|trip|abroad|holiday|erasmus|flight|luggage|cancel/, ["travel", "travel-assistance", "cancellation", "luggage"]],
  [/mortgage|loan|debt|owe/, ["loan-balance", "work-disability"]],
  [/income|work|disab|job|sick/, ["work-disability"]],
  [/car|drive|vehicle|omnium|motor|breakdown|roadside|tow/, ["car-bi", "car-omnium", "vab-assistance"]],
  [/bike|bicycle|cycl/, ["bicycle", "bicycle-assistance"]],
  [/home|house|flat|apartment|tenant|kot|landlord|fire|storm|contents|theft|burglar/, ["home-owner", "home-tenant", "home-contents", "theft"]],
  [/pet|dog|cat|vet/, ["pet"]],
  [/funeral|death|life insurance|die/, ["funeral", "life"]],
  [/accident|injur/, ["accident", "driver-accident"]],
];
const CATEGORY_WORDS: [RegExp, string][] = [
  [/\bhome\b|house|property/, "home"],
  [/mobility|transport|vehicle|\bcar\b/, "mobility"],
  [/person|family insurance/, "person"],
  [/travel|trip|abroad/, "travel"],
];

const euro = (n: number) => `€${n}`;
const money = (assets: Asset[]) => assets.reduce((s, a) => s + (a.product?.monthly ?? 0), 0);
const uniqueCovers = (assets: Asset[]) => [...new Set(assets.map((a) => a.coverId).filter((c): c is string => Boolean(c)))];

/** What to ask, given what is on screen. Short, and about this person. */
export function suggestions(shown: Asset, name: string): string[] {
  switch (shown.kind) {
    case "gap":
      return ["Why is this needed?", "What does it cost?"];
    case "policy":
      return ["When does it renew?", "What is missing around it?"];
    case "category":
      return ["What should I fix here?", "What does it cost?"];
    case "product":
      return ["Does this apply to " + name + "?", "What else is missing?"];
    default:
      return ["What should I fix first?", "Who in the family needs help?"];
  }
}

export function answer(question: string, ctx: Context): Answer {
  const q = question.toLowerCase().trim();
  const { ego, model, personId, shown, mine } = ctx;
  const me = model.people.find((p) => p.id === personId)?.name ?? "them";
  const addAll = (gaps: Asset[]): Action[] => (gaps.length > 0 ? [{ kind: "add", label: gaps.length === 1 ? `Add · ${euro(money(gaps))}/mo` : `Add all · ${euro(money(gaps))}/mo`, covers: uniqueCovers(gaps) }] : []);
  const show = (a: Asset): Action => ({ kind: "go", label: `Show ${a.label}`, steps: stepsForGap(a), person: a.personIds[0] });

  if (!q) return { text: "Ask about a risk, a cover or someone in the family.", actions: [] };

  // Someone in the family.
  const who = model.people.find((p) => q.includes(p.name.toLowerCase()) && p.id !== personId);
  if (who) {
    const theirs = Object.values(ego.assets).filter((a) => a.kind === "gap" && a.personIds.includes(who.id));
    const top = theirs.sort((a, b) => Number(b.state === "upcoming") - Number(a.state === "upcoming") || (b.priority === "high" ? 1 : 0) - (a.priority === "high" ? 1 : 0))[0];
    return {
      text: top ? `${who.name}: ${top.story?.headline.toLowerCase()}. ${theirs.length > 1 ? `${theirs.length - 1} more to look at.` : ""}` : `${who.name} has nothing to fix right now.`,
      actions: [{ kind: "person", label: `Open ${who.name}`, person: who.id }, ...(top ? [show(top)] : [])],
    };
  }

  // A specific risk or product.
  if (!/first|priorit|urgent|most|everything|all |overview|summary/.test(q)) {
    const hit = WORDS.find(([re]) => re.test(q));
    if (hit) {
      const ids = hit[1];
      const forMe = mine.filter((a) => a.kbcId && ids.includes(a.kbcId));
      if (forMe.length > 0) {
        const a = forMe[0];
        return { text: `${a.story?.headline}. ${a.story?.line} ${a.product ? `${a.product.name} is from ${euro(a.product.monthly)}/month.` : ""}`, actions: [show(a), ...addAll([a])] };
      }
      const held = ids.map((id) => ego.assets[`kbc:${id}`]).find((p) => p && ["covered", "shared"].includes(p.personState[personId]));
      if (held) return { text: `${me} already has this: ${held.label.toLowerCase()}.`, actions: held.via?.[personId] ? [{ kind: "go", label: "Show the policy", steps: [{ kind: "asset", id: held.via[personId] }] }] : [] };
      const elsewhere = Object.values(ego.assets).find((a) => a.kind === "gap" && a.kbcId && ids.includes(a.kbcId) && !a.personIds.includes(personId));
      if (elsewhere) {
        const other = model.people.find((p) => p.id === elsewhere.personIds[0])?.name;
        return { text: `Nothing flagged for ${me}, but ${other} is missing this: ${elsewhere.story?.headline.toLowerCase()}.`, actions: [show(elsewhere)] };
      }
      return { text: `Nothing flagged for ${me} here.`, actions: [] };
    }
  }

  // A whole category.
  const cat = CATEGORY_WORDS.find(([re]) => re.test(q));
  if (cat && !/first|priorit|cost|price|much/.test(q)) {
    const label = KBC.categories.find((c) => c.id === cat[1])?.label;
    return { text: `Here is ${label}.`, actions: [{ kind: "go", label: `Open ${label}`, steps: [{ kind: "category", group: "insurance", id: cat[1] }] }] };
  }

  // Money.
  if (/cost|price|total|afford|much|cheap|pay|proposal/.test(q)) {
    const target = shown.kind === "gap" ? [shown] : mine;
    if (target.length === 0) return { text: `Nothing to add for ${me}.`, actions: [] };
    return { text: `${target.length === 1 ? target[0].product?.name : `Closing all ${target.length}`} is from ${euro(money(target))}/month. Prices are mock.`, actions: addAll(target) };
  }

  // Why.
  if (/why|reason|matter|need/.test(q) && shown.kind === "gap" && shown.story) {
    return { text: `${shown.story.line} ${shown.product ? `${shown.product.pitch}` : ""}`, actions: addAll([shown]) };
  }

  // Renewals and neighbours of a policy.
  if (/renew|expire|when/.test(q) && shown.kind === "policy") {
    const r = shown.facts.find((f) => f.k === "Renews")?.v;
    return { text: r ? `Renews ${r}.` : "No renewal date: it is included with another product.", actions: [] };
  }

  // Money matters: accounts, loans.
  if (/account|card|balance|saving|loan|goal|money/.test(q)) {
    const loans = /loan|debt|owe/.test(q);
    return { text: loans ? "Loans and saving goals are here." : "Accounts and cards are here.", actions: [{ kind: "go", label: loans ? "Open borrowing & saving" : "Open accounts & cards", steps: [{ kind: "group", id: loans ? "credit" : "money" }] }] };
  }
  if (/tree|parents|children|spouse|wife|husband|relative/.test(q)) return { text: "Here is the family tree.", actions: [{ kind: "go", label: "Open the family tree", steps: [{ kind: "group", id: "family" }] }] };

  // Priorities (and the fallback).
  if (mine.length === 0) return { text: `${me} is in good shape: nothing to fix.`, actions: [] };
  const top = mine.slice(0, 3);
  return {
    text: `Start with: ${top.map((a) => a.story?.headline.toLowerCase()).join("; ")}.`,
    actions: [...top.slice(0, 2).map(show), ...addAll(mine)],
  };
}
