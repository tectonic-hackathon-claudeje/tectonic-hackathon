import type { Asset, EgoModel, Reply } from "@/lib/insurance/ego";
import { KBC } from "@/lib/insurance/kbc";
import type { InsuranceModel } from "@/lib/insurance/model";
import type { Step } from "./scenes";

/** Where the map should show. */
export type Nav = { steps: Step[]; person?: string };
export type { Reply };

/** Chips under an answer: go somewhere, open a document, ask for a person, add to the proposal, or say it is not needed. */
export type Action =
  | { kind: "go"; label: string; nav: Nav }
  | { kind: "link"; label: string; href: string }
  | { kind: "call"; label: string }
  | { kind: "add"; label: string; covers: string[] }
  | { kind: "respond"; label: string; gapId: string; reply: Reply };

/**
 * What an answer can do. `navigate` moves the map on its own when one place clearly matches (the
 * person's own typing is the consent); the shell tells them where it went and offers to go back.
 */
export type Answer = { text: string; actions: Action[]; navigate?: Nav; offerGapId?: string; respond?: { gapId: string; reply: Reply } };

/** Who is talking: the insurance itself when one is selected, otherwise the insurances together. */
export type Speaker = { kind: "policy" | "cover" | "group"; label: string; sub?: string; glyph: string; assetId?: string };

export function speakerFor(shown: Asset, gap: Asset | undefined, viaPolicy: Asset | undefined, ego: EgoModel): Speaker {
  const policy = shown.kind === "policy" ? shown : viaPolicy?.kind === "policy" ? viaPolicy : undefined;
  if (policy) return { kind: "policy", label: policy.label, sub: policy.caption.split(" \u00b7 ")[0], glyph: policy.glyph, assetId: policy.id };
  if (gap) return { kind: "cover", label: gap.label, sub: "not in place yet", glyph: gap.glyph, assetId: gap.id };
  if (shown.kind === "category") return { kind: "group", label: `Your ${shown.label.toLowerCase()} insurances`, glyph: shown.glyph };
  void ego;
  return { kind: "group", label: "Your insurances", glyph: "fraud" };
}

export type Context = {
  speaker: Speaker;
  ego: EgoModel;
  model: InsuranceModel;
  viewer: string;
  personId: string;
  shown: Asset;
  /** Open gaps for this person, most pressing first (ones they said are not needed are already removed). */
  mine: Asset[];
  /** Pressing gaps for the rest of the family. */
  others: Asset[];
};

/** Where to look to see a gap: its KBC category, then the gap itself. */
export function stepsForGap(a: Asset): Step[] {
  const category = KBC.products.find((p) => p.id === a.kbcId)?.category;
  return category ? [{ kind: "category", group: "insurance", id: category }, { kind: "asset", id: a.id }] : [{ kind: "asset", id: a.id }];
}
const navToGap = (a: Asset): Nav => ({ steps: stepsForGap(a), person: a.personIds[0] });

// Plain words people use, pointing at KBC products. Order matters: the most specific first.
const WORDS: [RegExp, string[]][] = [
  [/scam|fraud|phish|cyber|hack|identity|online|fake/, ["cybersecure"]],
  [/accident|crash|collision|hit (a|the) car|rear.?end/, ["car-omnium", "car-bi", "car-legal", "driver-accident"]],
  [/\bbike\b|bicycle|cycl|e-?bike/, ["bicycle", "bicycle-assistance"]],
  [/stolen|steal|theft|thief|burglar|break.?in|broke in|laptop|phone|camera|jewel/, ["theft", "home-contents"]],
  [/hospital|medical|surgery|doctor|health|\bill\b|sick bill/, ["hospitalisation"]],
  [/damag\w* (to )?(his|her|their|a|the|my) (house|flat|car|vase|property)|broke|liabil|neighbo|landlord|kids? break/, ["family", "building-liability"]],
  [/legal|lawyer|dispute|court|sue/, ["car-legal", "building-legal", "travel-legal"]],
  [/travel|trip|abroad|holiday|erasmus|lisbon|japan|spain|flight|luggage|cancel|conference/, ["travel", "travel-assistance", "cancellation", "luggage"]],
  [/mortgage|loan|debt|owe/, ["loan-balance", "work-disability"]],
  [/income|cannot work|can't work|can not work|disab|job|\bsick\b|unable to work/, ["work-disability"]],
  [/car|drive|vehicle|omnium|motor|breakdown|roadside|tow/, ["car-bi", "car-omnium", "vab-assistance"]],
  [/second home|holiday home|seaside|coast|blankenberge|apartment at/, ["home-second"]],
  [/home|house|flat|apartment|tenant|kot|landlord|fire|burn|storm|contents/, ["home-owner", "home-tenant", "home-contents", "fire"]],
  [/pet|dog|cat|vet/, ["pet"]],
  [/funeral|death|life insurance|\bdie\b/, ["funeral", "life"]],
];
const CATEGORY_WORDS: [RegExp, string][] = [
  [/\bhome\b|house|property/, "home"],
  [/mobility|transport|vehicle|\bcar\b/, "mobility"],
  [/person|family insurance/, "person"],
  [/travel|trip|abroad/, "travel"],
];

const euro = (n: number) => `\u20ac${Math.round(n).toLocaleString("en-GB")}`;

/** An honest price: an estimate, or nothing where it cannot honestly be known. */
export function priceLine(a: Asset, age: number): string {
  if (!a.product) return "";
  if (a.kbcId === "hospitalisation" && age >= 75) return "I can\u2019t give an honest price for hospital cover at this age: acceptance and waiting periods decide it. An advisor can check.";
  return `${a.product.name}: about ${euro(a.product.monthly)} a month, as an estimate. The final price comes after acceptance.`;
}

/** What to say to whoever is talking: the kind of thing you would ask them, not a menu. */
export function suggestions(speaker: Speaker, shown: Asset, isMe: boolean, name: string, worried?: string): string[] {
  if (speaker.kind === "policy") return ["What do you pay for?", "When don\u2019t you pay?", "When do you renew?"];
  if (speaker.kind === "cover") return ["What would you cover?", "What would you cost?", "I don\u2019t need you"];
  if (shown.kind === "category") return ["What\u2019s missing here?", "What do I already have?"];
  if (shown.kind === "group") return shown.id === "grp:family" ? ["Who needs something soon?"] : [];
  return isMe ? ["What should I sort out first?", worried ? `What\u2019s going on with ${worried}?` : "What do I pay in total?"] : [`What\u2019s the most urgent for ${name}?`];
}

/** The first line of the conversation, in the voice of whoever you are talking to. Only shown until you say something. */
export function opener(speaker: Speaker, isMe: boolean, name: string, viewerName: string): string {
  if (speaker.kind === "policy") return `Hi${isMe ? ` ${viewerName}` : ""}, I\u2019m your ${speaker.label.toLowerCase()}${speaker.sub ? ` with ${speaker.sub}` : ""}. Ask me what I pay for, and when I don\u2019t.`;
  if (speaker.kind === "cover") return `I\u2019m ${speaker.label}. I\u2019m not in place for you, so nothing is decided. Ask me anything, or just ignore me.`;
  if (speaker.label.startsWith("Your ") && speaker.label !== "Your insurances") return `We\u2019re your ${speaker.label.replace("Your ", "")}. Ask us what\u2019s covered, or tell us what worries you.`;
  return isMe ? `Hi ${viewerName}, we\u2019re your insurances. Ask us anything, or just tell us what\u2019s on your mind.` : `You\u2019re looking at ${name}. Ask us anything, or tell us what worries you.`;
}

const ADVISOR: Action = { kind: "call", label: "Talk to a person" };

export function answer(question: string, ctx: Context): Answer {
  const q = question.toLowerCase().trim();
  const { ego, model, viewer, personId, shown, mine, others, speaker } = ctx;
  const isMe = personId === viewer;
  const nameOf = (id: string) => (id === viewer ? "you" : (model.people.find((p) => p.id === id)?.name ?? id));
  const me = nameOf(personId);
  const ageOf = (id: string) => model.people.find((p) => p.id === id)?.age ?? 40;
  const addAll = (gaps: Asset[]): Action[] => {
    const covers = [...new Set(gaps.map((a) => a.coverId).filter((c): c is string => Boolean(c)))];
    return covers.length > 0 ? [{ kind: "add", label: covers.length === 1 ? "Add to my shortlist" : "Add them all", covers }] : [];
  };
  const show = (a: Asset): Action => ({ kind: "go", label: `${a.personIds[0] !== personId ? `${nameOf(a.personIds[0])}: ` : ""}${a.label}`, nav: navToGap(a) });
  const everyGap = [...mine, ...others];
  const ownPolicies = Object.values(ego.assets).filter((a) => a.kind === "policy" && a.personState[personId] === "covered");
  const topic0 = WORDS.find(([re]) => re.test(q));

  if (!q) return { text: "I\u2019m listening. Ask about a risk, a cover, or someone in the family.", actions: [] };

  // A person, please.
  if (/person|human|advisor|adviser|someone|somebody|call me|phone|branch|speak|real/.test(q) && /talk|speak|call|meet|see|appointment|help|human|person|advisor|adviser/.test(q)) {
    return { text: "Of course. I can point things out, but an advisor can look at your whole situation and decide with you. Want me to ask for a call?", actions: [ADVISOR] };
  }

  // On a missing-cover page, "not needed" and "covered elsewhere" are answers of their own.
  if (shown.kind === "gap") {
    if (/skip|not needed|no thanks|i'?m fine|don'?t need|not now/.test(q)) return { text: "No problem, I\u2019ll leave it. Just ask if you change your mind.", actions: [], respond: { gapId: shown.id, reply: "not-needed" } };
    if (/elsewhere|employer|already (have|covered)|mutuality|partner/.test(q)) return { text: "Good to know, I\u2019ll stop suggesting it.", actions: [], respond: { gapId: shown.id, reply: "covered-elsewhere" } };
  }

  // The insurance speaks for itself. It says what it pays for and what it does not, and hands you over when
  // you ask about something that is not its job.
  if (speaker.kind === "policy" && speaker.assetId) {
    const pol = ego.assets[speaker.assetId];
    const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
    const list = (xs: { scenario: string }[]) => xs.slice(0, 3).map((c) => c.scenario.charAt(0).toLowerCase() + c.scenario.slice(1)).join("; ");
    const doc = pol?.links.find((l) => l.pdf);
    const about = WORDS.find(([re]) => re.test(q));
    const mine_ = pol?.products ?? [];
    const isMyJob = !about || about[1].some((id) => mine_.includes(id));
    if (pol && isMyJob) {
      if (/renew|expire|when do you|due/.test(q) && !/pay|cover/.test(q)) return { text: pol.meta?.renews ? `I renew on ${fmt(pol.meta.renews)}.` : "I come with another product, so I don\u2019t have a renewal date of my own.", actions: [] };
      if (/cost|price|premium|how much|pay you|per month/.test(q) && !/not pay|don'?t pay/.test(q)) return { text: `I cost ${pol.caption.split(" \u00b7 ")[1] ?? "what\u2019s on file"}.`, actions: [] };
      if (/document|pdf|papers|conditions|contract/.test(q)) return doc ? { text: "Here are my papers. They open in a new tab.", actions: [{ kind: "link", label: "Open my conditions (PDF)", href: doc.href }] } : { text: "I don\u2019t have papers on file.", actions: [] };
      if (pol.scenarios && (pol.scenarios.pays.length > 0 || pol.scenarios.not.length > 0)) {
        const only = /not pay|don'?t pay|not cover|doesn'?t|exclu|never/.test(q) ? "not" : /pay|cover|include|get|what do you|accident|damage|fire|theft/.test(q) ? "both" : "both";
        const parts = [only !== "not" ? `I pay when: ${list(pol.scenarios.pays)}.` : "", `I don\u2019t when: ${list(pol.scenarios.not)}.`].filter(Boolean);
        return { text: `${parts.join(" ")} That\u2019s typical for me, so my real conditions decide.`, actions: doc ? [{ kind: "link", label: "Open my conditions (PDF)", href: doc.href }] : [] };
      }
    }
    if (pol && about && !isMyJob) {
      // Not my job: hand over to whoever's it is.
      const heldOther = about[1].map((id) => ego.assets[`kbc:${id}`]).find((p) => p && ["covered", "shared"].includes(p.personState[personId]) && p.via?.[personId] && p.via[personId] !== pol.id);
      const gapOther = mine.find((a) => a.kbcId && about[1].includes(a.kbcId));
      if (heldOther?.via?.[personId]) return { text: `That\u2019s not me. ${ego.assets[heldOther.via[personId]].label} looks after that. Let me hand you over.`, navigate: { steps: [{ kind: "asset", id: heldOther.via[personId] }] }, actions: [] };
      if (gapOther) return { text: `That\u2019s not something I do, and I don\u2019t see anything for it on file. There\u2019s ${gapOther.label} if you want to look. Handing you over.`, navigate: navToGap(gapOther), actions: [] };
      // Nobody of mine to hand over to: answer as the insurances together, but say it is not me.
      const rest = answer(question, { ...ctx, speaker: { kind: "group", label: "Your insurances", glyph: "fraud" } });
      return { ...rest, text: `That\u2019s not something I do. ${rest.text}` };
    }
  }
  if (speaker.kind === "cover" && speaker.assetId) {
    const g = ego.assets[speaker.assetId];
    const kp = KBC.products.find((p) => p.id === g?.kbcId);
    if (g && kp) {
      if (/cover|include|pay for|what would you|what do you|do for me/.test(q) && !/not/.test(q)) return { text: `I would cover ${kp.covers.charAt(0).toLowerCase()}${kp.covers.slice(1)}. I\u2019m not in place for you, so right now I cover nothing.`, actions: [] };
      if (/cost|price|much|cheap/.test(q)) return { text: priceLine(g, ageOf(g.personIds[0])), actions: [] };
      if (/why|reason|on my list|seeing you|here/.test(q) && g.story) return { text: `You\u2019re seeing me because of this: ${g.story.line.charAt(0).toLowerCase()}${g.story.line.slice(1)} It\u2019s your call. I\u2019m easy to ignore.`, actions: [] };
    }
  }

  // Cover through work: we know the employer, not what it gives.
  const job = ego.assets[`work:${personId}`];
  if (/(through|via|from|at) (my |the )?(work|job|employer|company)|employer|group insurance|workplace|\bhr\b/.test(q) && /insur|cover|group|benefit|get|have/.test(q)) {
    return job
      ? { text: `${job.label} may offer group insurance: often hospital cover, income if you cannot work, and a pension plan. I can\u2019t see what yours includes. Your employer\u2019s benefits overview will say.`, navigate: { steps: [{ kind: "asset", id: job.id }] }, actions: [ADVISOR] }
      : { text: "I don\u2019t have an employer on file, so I can\u2019t say what you get through work.", actions: [ADVISOR] };
  }

  // Things this page cannot honestly answer: say so, and offer a person.
  if (/inherit|estate|\bwill\b|notary|care home|nursing home|rest home|tax|when i die|if i die|after i die|passed away|pass away/.test(q)) return { text: "That\u2019s beyond what I can see here: it\u2019s about your estate and finances, not your insurance. An advisor or a notary is the right person.", actions: [ADVISOR] };
  if (/send money|transfer (money )?abroad|remit|western union|wire/.test(q)) return { text: "Sending money is about payments, not insurance, so I can\u2019t help with that here. The payments part of the app can.", actions: [ADVISOR] };
  if (/customer|client|my work|my job|business|self.?employed|professional|\bvan\b|workshop|stock|tools/.test(q) && /liab|damag|insur|cover|stolen|steal|accident|claim/.test(q)) {
    return { text: "That sounds like cover for your work, such as professional liability or a work vehicle. I can\u2019t see that in the list of covers here, so I can\u2019t tell you whether you have it. An advisor can look at it properly.", actions: [ADVISOR] };
  }

  // What a policy covers, and what it does not.
  if (/not covered|isn'?t covered|exclu|doesn'?t cover|does not cover|what('?s| is| does) (it )?cover|what is included|material damage|what do i get/.test(q)) {
    const topicPol = topic0 ? ownPolicies.find((a) => a.products?.some((id) => topic0[1].includes(id))) : undefined;
    const pol = shown.kind === "policy" ? shown : topicPol;
    if (pol?.scenarios && (pol.scenarios.pays.length > 0 || pol.scenarios.not.length > 0)) {
      const doc = pol.links.find((l) => l.pdf);
      const list = (xs: { scenario: string }[]) => xs.slice(0, 3).map((c) => c.scenario.charAt(0).toLowerCase() + c.scenario.slice(1)).join("; ");
      return {
        text: `${pol.label}. It pays when: ${list(pol.scenarios.pays)}. It doesn\u2019t when: ${list(pol.scenarios.not)}. These are typical situations, so your own conditions decide.`,
        navigate: shown.id === pol.id ? undefined : { steps: [{ kind: "asset", id: pol.id }] },
        actions: doc ? [{ kind: "link", label: "Open the conditions (PDF)", href: doc.href }] : [],
      };
    }
  }

  // Numbers: what you pay, and when it renews.
  if (/total|how much.*(pay|cost|month|year)|premium|per month|each month|yearly|annual|what do i pay/.test(q) && !/cover|product/.test(q)) {
    const rows = ownPolicies.filter((a) => (a.meta?.monthly ?? 0) > 0);
    const monthly = rows.reduce((s, a) => s + (a.meta?.monthly ?? 0), 0);
    if (rows.length === 0) return { text: "I can\u2019t see any premiums on file.", actions: [] };
    return { text: `About ${euro(monthly)} a month (${euro(monthly * 12)} a year): ${rows.map((a) => `${a.label.toLowerCase()} ${euro(a.meta?.monthly ?? 0)}`).join(", ")}.`, actions: [] };
  }
  if (/renew|expire|due|deadline/.test(q) && shown.kind !== "policy") {
    const dated = ownPolicies.filter((a) => a.meta?.renews).sort((a, b) => (a.meta?.renews ?? "").localeCompare(b.meta?.renews ?? ""));
    if (dated.length === 0) return { text: "I can\u2019t see any renewal dates.", actions: [] };
    const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
    return { text: `Next up: ${dated.slice(0, 3).map((a) => `${a.label.toLowerCase()}, ${fmt(a.meta?.renews)}`).join("; ")}.`, actions: dated.slice(0, 2).map((a) => ({ kind: "go" as const, label: a.label, nav: { steps: [{ kind: "asset" as const, id: a.id }] } })) };
  }
  if (/document|pdf|papers|conditions|certificate|contract/.test(q)) {
    const docs = (shown.kind === "policy" ? [shown] : ownPolicies).flatMap((a) => a.links.filter((l) => l.pdf).slice(0, 1).map((l) => ({ label: `${a.label}: ${l.label}`, href: l.href })));
    return docs.length > 0 ? { text: "Here are the papers. They open in a new tab.", actions: docs.slice(0, 4).map((d) => ({ kind: "link" as const, ...d })) } : { text: "I don\u2019t have documents on file for this.", actions: [ADVISOR] };
  }

  // Paying twice.
  if (/twice|overlap|double|duplicate/.test(q)) {
    const flagged = model.nodes.flatMap((n) => n.cells.filter((c) => c.flags.some((f) => /overlap/i.test(f))).map((c) => ({ n, c })))[0];
    const pol = flagged?.c.policy ? ego.assets[`pol:${flagged.c.policy.id}`] : undefined;
    return flagged && pol
      ? { text: `Possibly. ${nameOf(flagged.c.personId) === "you" ? "You" : nameOf(flagged.c.personId)} ${nameOf(flagged.c.personId) === "you" ? "are" : "is"} on the family hospital policy, and an employer may offer cover too. Worth checking before you pay for both.`, navigate: { steps: [{ kind: "asset", id: pol.id }] }, actions: [] }
      : { text: "I don\u2019t see an overlap in what I have. I only know what\u2019s on file, though.", actions: [] };
  }

  // Someone in the family. With a topic ("Is Lotte sorted for Lisbon?") go straight to it; otherwise to them.
  const who = model.people.find((p) => q.includes(p.name.toLowerCase()) && p.id !== personId);
  const topic = WORDS.find(([re]) => re.test(q));
  if (who) {
    const theirs = everyGap.filter((a) => a.personIds.includes(who.id));
    const onTopic = topic ? theirs.find((a) => a.kbcId && topic[1].includes(a.kbcId)) : undefined;
    if (onTopic) return { text: `${who.name}: ${onTopic.story?.headline.toLowerCase()}. ${onTopic.story?.line}`, navigate: navToGap(onTopic), offerGapId: onTopic.id, actions: [] };
    const top = theirs[0];
    return {
      text: top ? `Here\u2019s ${who.name}. The main thing: ${top.story?.headline.toLowerCase()}.${theirs.length > 1 ? ` ${theirs.length - 1} more after that.` : ""}` : `Nothing flagged for ${who.name} right now. That only covers what I can see.`,
      navigate: { steps: [], person: who.id },
      actions: [],
    };
  }

  // The whole family, or "what first?": a short list, and you choose.
  if (/family|everyone|everybody|all ok|okay|\bok\b|first|priorit|urgent|attention|sort out|what should/.test(q) && !topic) {
    const pool = [...mine.slice(0, 1), ...others.slice(0, 2)];
    if (pool.length === 0) return { text: "Nothing is flagged right now. That only covers what I can see.", actions: [ADVISOR] };
    return { text: pool.length === 1 ? "One thing stands out." : `${pool.length} things stand out. Where would you like to start?`, actions: pool.map(show) };
  }

  // A specific risk or product.
  if (topic) {
    const ids = topic[1];
    const cost = /cost|price|much|cheap|pay/.test(q);
    const forMe = mine.filter((a) => a.kbcId && ids.includes(a.kbcId));
    // Only say "you have this" when a policy on file really stands for it, and say what I can and cannot see.
    const held = ids.map((id) => ego.assets[`kbc:${id}`]).find((p) => p && ["covered", "shared"].includes(p.personState[personId]));
    const pol = held?.via?.[personId] ? ego.assets[held.via[personId]] : undefined;
    const onFile = pol
      ? speaker.kind === "group"
        ? `That\u2019s ${isMe ? "your" : `${me}\u2019s`} ${pol.label.toLowerCase()} with ${pol.caption.split(" \u00b7 ")[0]}. I\u2019ll hand you over: ask it what it pays for.`
        : `${isMe ? "You have" : `${me} has`} ${pol.label.toLowerCase()} on file (${pol.caption.split(" \u00b7 ")[0]}).`
      : "";
    const doc = pol?.links.find((l) => l.pdf);
    if (forMe.length > 0) {
      const a = forMe[0];
      if (pol) {
        // Something is in place and something next to it is not: say both.
        return { text: `${onFile} Next to it: ${a.story?.headline.toLowerCase()}.`, navigate: { steps: [{ kind: "asset", id: pol.id }] }, actions: [show(a), ...(doc ? [{ kind: "link" as const, label: "Open the conditions (PDF)", href: doc.href }] : [])] };
      }
      return cost
        ? { text: priceLine(a, ageOf(personId)), actions: [], navigate: navToGap(a), offerGapId: a.id }
        : { text: `${a.story?.headline}. ${a.story?.line}`, actions: [], navigate: navToGap(a), offerGapId: a.id };
    }
    if (pol) return { text: onFile, navigate: { steps: [{ kind: "asset", id: pol.id }] }, actions: doc ? [{ kind: "link", label: "Open the conditions (PDF)", href: doc.href }] : [] };
    const elsewhere = others.find((a) => a.kbcId && ids.includes(a.kbcId));
    if (elsewhere) return { text: `Nothing flagged for ${me} there, but ${nameOf(elsewhere.personIds[0])}: ${elsewhere.story?.headline.toLowerCase()}.`, actions: [show(elsewhere)] };
    // Understood the topic, but nothing flagged: that is not the same as "covered".
    return { text: `I don\u2019t have anything flagged for that. That doesn\u2019t mean you\u2019re covered: I only know what\u2019s on file. Want me to show the options, or ask an advisor?`, actions: [{ kind: "go", label: "Show the options", nav: { steps: [{ kind: "category", group: "insurance", id: KBC.products.find((p) => p.id === ids[0])?.category ?? "home" }] } }, ADVISOR] };
  }

  // A whole category.
  const cat = CATEGORY_WORDS.find(([re]) => re.test(q));
  if (cat) return { text: `Sure, here\u2019s ${KBC.categories.find((c) => c.id === cat[1])?.label}.`, navigate: { steps: [{ kind: "category", group: "insurance", id: cat[1] }] }, actions: [] };

  // Questions about what is on screen.
  if (/cost|price|how much|afford|cheap/.test(q)) {
    const target = shown.kind === "gap" ? shown : mine[0];
    return target ? { text: priceLine(target, ageOf(target.personIds[0])), actions: addAll([target]) } : { text: "There\u2019s nothing to price right now.", actions: [] };
  }
  if (/why|reason|matter|on my list/.test(q) && shown.kind === "gap" && shown.story) return { text: `${shown.story.line} That\u2019s why it\u2019s on the list. It\u2019s your call whether it matters to you.`, actions: [] };
  if (/renew|expire|when/.test(q) && shown.kind === "policy") {
    const r = shown.facts.find((f) => f.k === "Renews")?.v;
    return { text: r ? `It renews ${r}.` : "It doesn\u2019t have a renewal date, it comes with another product.", actions: [] };
  }
  if (shown.kind === "policy" && /missing|around|gap/.test(q)) {
    const next = Object.values(ego.assets).filter((g) => g.kind === "gap" && g.related.some((r) => r.id === shown.id) && g.personIds.includes(personId));
    return next.length > 0 ? { text: `Maybe one thing: ${next[0].story?.headline.toLowerCase()}.`, actions: next.map(show) } : { text: "Nothing obvious around this one, going by what\u2019s on file.", actions: [] };
  }
  if (shown.kind === "category" && shown.id.startsWith("cat:insurance:") && /missing|gap|fix|in place|already|have|covered/.test(q)) {
    const cid = shown.id.split(":")[2];
    const inCat = (a: Asset) => KBC.products.find((p) => p.id === a.kbcId)?.category === cid;
    if (/already|have|in place|covered/.test(q)) {
      const have = KBC.products.filter((p) => p.category === cid && ["covered", "shared"].includes(ego.assets[`kbc:${p.id}`]?.personState[personId] ?? "")).map((p) => p.short);
      return { text: have.length > 0 ? `${isMe ? "You\u2019ve got" : `${me} has`} ${have.join(", ")}.` : "Nothing on file in this one yet.", actions: [] };
    }
    const here = mine.filter(inCat);
    return here.length > 0 ? { text: here.length === 1 ? "Just one thing here." : `${here.length} things here.`, actions: here.map(show) } : { text: "Nothing is flagged here.", actions: [] };
  }
  if (/account|card|balance|saving|goal|money/.test(q)) return { text: "Here are the accounts.", navigate: { steps: [{ kind: "group", id: "money" }] }, actions: [] };
  if (/loan|debt|owe/.test(q)) return { text: "Here are the loans.", navigate: { steps: [{ kind: "group", id: "credit" }] }, actions: [] };
  if (/tree|parents|children|spouse|wife|husband|relative/.test(q)) return { text: "Here\u2019s the family.", navigate: { steps: [{ kind: "group", id: "family" }] }, actions: [] };

  // What to buy: the honest answer.
  if (/buy|should i get|recommend/.test(q)) return { text: "I can\u2019t tell you what to buy. I can show you what looks uncovered and what you already have, and doing nothing is always an option. Shall we start with what worries you most?", actions: [...mine.slice(0, 2).map(show), ADVISOR] };

  // Did not understand: say so, never reassure.
  return { text: "Sorry, I didn\u2019t get that. Try asking about a risk in your own words, like \u201cmy laptop got stolen\u201d or \u201cam I covered abroad?\u201d, or I can get a person for you.", actions: [ADVISOR, ...mine.slice(0, 1).map(show)] };
}
