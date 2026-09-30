import { KBC as kbc } from "./kbc";
import { list, readTable } from "./csv";
import type { InsuranceModel, Priority, Product, Status } from "./model";

export type AssetKind = "person" | "policy" | "account" | "card" | "loan" | "goal" | "gap" | "product" | "group" | "category" | "property" | "employer";
export type AssetState = Status | "neutral";
/** How much of someone's world a viewer may see: their own, a joint account holder, a proxy, view-only, or nothing shared. */
export type AccessLevel = "self" | "joint" | "proxy" | "view" | "none";
export type Reply = "not-needed" | "covered-elsewhere";

export type Link = { label: string; href: string; external?: boolean; pdf?: boolean };
export type Fact = { k: string; v: string };
export type Related = { id: string; relation: string };

export type Asset = {
  id: string;
  kind: AssetKind;
  label: string;
  /** One quiet line under the name. */
  caption: string;
  /** Pixel-art glyph id (see pixel.tsx). */
  glyph: string;
  state: AssetState;
  /** People this belongs to, and how each of them relates to it. */
  personIds: string[];
  roles: Record<string, string>;
  /** Per-person status where it differs from `state` (covered on your own policy vs via family). */
  personState: Record<string, Status>;
  detail: string;
  facts: Fact[];
  source: string;
  related: Related[];
  links: Link[];
  coverId?: string;
  product?: Product;
  priority?: Priority;
  /** KBC catalogue products this policy stands for. */
  products?: string[];
  /** The KBC catalogue product a gap would be closed by. */
  kbcId?: string;
  /** For a catalogue product: what to open for each person (their policy, or their gap). */
  via?: Record<string, string>;
  /** A missing cover told as a short story: what is wrong, and why it matters to this person. */
  story?: { headline: string; line: string };
  /** Plain facts about a person, used to decide what is relevant to them. */
  meta?: { age?: number; monthly?: number; renews?: string };
};



export type Territories = { insurance: string[]; money: string[]; credit: string[]; needs: string[] };

export type EgoModel = {
  assets: Record<string, Asset>;
  byPerson: Record<string, Territories>;
  /** Other people, nearest first, with how they relate to this person. */
  family: Record<string, { id: string; relation: string }[]>;
  /** access[viewer][person]: what the viewer may see of that person, from account ownership and mandates. */
  access: Record<string, Record<string, AccessLevel>>;
};

const euro = (n: number) => `€${Math.round(n).toLocaleString("en-BE")}`;
const when = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

const COVER_OF_POLICY: [RegExp, string][] = [
  [/mortgage protection|schuldsaldo/i, "mortgage"],
  [/travel/i, "travel"],
  [/home/i, "home"],
  [/car insurance|omnium/i, "car"],
  [/hospital/i, "hospital"],
];
const POLICY_LABEL: Record<string, string> = {
  mortgage: "Mortgage protection",
  home: "Home & fire",
  car: "Car insurance",
  hospital: "Hospitalisation",
  travel: "Travel & purchase",
};
const INSURER_SITE: Record<string, string> = {
  "AG Insurance": "https://www.aginsurance.be",
  Ethias: "https://www.ethias.be",
  "DKV Belgium": "https://www.dkv.be",
};
const PRODUCT_PAGE: Record<string, string> = {
  home: "home-insurance",
  car: "car-insurance",
  hospital: "hospital-insurance",
  mortgage: "home-loan",
};
const ACCOUNT_GLYPH: Record<string, string> = {
  current: "bank",
  savings: "piggy",
  pension_savings: "coin",
  credit_card: "card",
  investment: "chart",
  term_deposit: "safe",
};
const ACCOUNT_TYPE: Record<string, string> = {
  current: "Current account",
  savings: "Savings",
  pension_savings: "Pension saving",
  credit_card: "Credit card",
  investment: "Investments",
  term_deposit: "Term deposit",
};
// "A is child_of B": for A, B is a parent; for B, A is a child. Each list says what the OTHER person is.
const OTHER_IS: Record<string, string> = { spouse: "spouse", sibling: "sibling", child_of: "parent", grandchild_of: "grandparent" };
const OTHER_IS_BACK: Record<string, string> = { spouse: "spouse", sibling: "sibling", child_of: "child", grandchild_of: "grandchild" };

export function buildEgo(model: InsuranceModel): EgoModel {
  const persons = readTable("persons");
  const households = readTable("households");
  const accounts = readTable("accounts");
  const access = readTable("account_access");
  const cards = readTable("cards");
  const loans = readTable("loans");
  const goals = readTable("savings_goals");
  const policies = readTable("insurance_policies");
  const relationships = readTable("relationships");

  const name = new Map(model.people.map((p) => [p.id, p.name]));
  const namesOf = (ids: string[]) => ids.map((i) => name.get(i) ?? i).join(", ");
  const assets: Record<string, Asset> = {};
  const put = (a: Omit<Asset, "roles" | "personState" | "related" | "links" | "facts"> & Partial<Pick<Asset, "roles" | "personState" | "related" | "links" | "facts">>) => {
    assets[a.id] = { roles: {}, personState: {}, related: [], links: [], facts: [], ...a };
    return assets[a.id];
  };
  const relate = (from: string, to: string, relation: string, back?: string) => {
    if (!assets[from] || !assets[to]) return;
    assets[from].related.push({ id: to, relation });
    if (back) assets[to].related.push({ id: from, relation: back });
  };

  // --- accounts, with who can see them and how
  for (const a of accounts) {
    const owners = list(a.owners);
    const grants = access.filter((x) => x.account_id === a.account_id);
    const roles: Record<string, string> = {};
    for (const g of grants) roles[g.person_id] = g.access_role.replace(/_/g, " ");
    const balance = Number(a.balance_at_snapshot);
    put({
      id: `acc:${a.account_id}`,
      kind: "account",
      label: a.nickname || a.product_name,
      caption: `${ACCOUNT_TYPE[a.account_type] ?? a.account_type} · ${euro(balance)}`,
      glyph: ACCOUNT_GLYPH[a.account_type] ?? "bank",
      state: "neutral",
      personIds: [...new Set([...owners, ...grants.map((g) => g.person_id)])],
      roles,
      detail: `${a.product_name}${owners.length > 1 ? `, held by ${namesOf(owners)}` : ""}.`,
      facts: [
        { k: "Type", v: ACCOUNT_TYPE[a.account_type] ?? a.account_type },
        { k: "Balance", v: euro(balance) },
        { k: "IBAN", v: a.iban_formatted },
        { k: "Opened", v: when(a.opened_date) },
        ...(a.maturity_date ? [{ k: "Matures", v: when(a.maturity_date) }] : []),
        ...(Number(a.interest_rate) ? [{ k: "Interest", v: `${(Number(a.interest_rate) * 100).toFixed(2)}%` }] : []),
      ],
      source: `NovaBank data lake · accounts ${a.account_id}`,
    });
  }

  // --- cards
  for (const c of cards) {
    const acc = assets[`acc:${c.account_id}`];
    put({
      id: `card:${c.card_id}`,
      kind: "card",
      label: `${c.card_kind === "credit" ? "Credit" : "Debit"} card`,
      caption: `${name.get(c.holder_id)} · ${c.brand.split("/").pop()}`,
      glyph: "card",
      state: "neutral",
      personIds: [c.holder_id],
      roles: { [c.holder_id]: "holder" },
      detail: `${c.brand}, ${c.status}. Weekly limit ${euro(Number(c.weekly_limit))}.`,
      facts: [
        { k: "Holder", v: name.get(c.holder_id) ?? c.holder_id },
        { k: "Card", v: c.pan_masked },
        { k: "Expires", v: c.expiry },
        { k: "Status", v: c.status },
        { k: "Abroad", v: c.abroad_enabled_regions.replace(/[\[\]"]/g, "") || "not enabled" },
      ],
      source: `NovaBank data lake · cards ${c.card_id}`,
    });
    if (acc) relate(`card:${c.card_id}`, `acc:${c.account_id}`, "draws on", "card");
  }

  // --- loans
  for (const l of loans) {
    const borrowers = list(l.borrowers);
    const mortgage = l.loan_type === "mortgage";
    put({
      id: `loan:${l.loan_id}`,
      kind: "loan",
      label: mortgage ? "Mortgage" : "Car loan",
      caption: `${euro(Number(l.monthly_installment))} / month · ${l.remaining_installments} left`,
      glyph: mortgage ? "key" : "car",
      state: "neutral",
      personIds: borrowers,
      roles: Object.fromEntries(borrowers.map((b) => [b, "borrower"])),
      detail: l.purpose,
      facts: [
        { k: "Borrowed", v: euro(Number(l.principal)) },
        { k: "Still owed", v: euro(Number(l.outstanding_at_snapshot)) },
        { k: "Rate", v: `${(Number(l.annual_rate) * 100).toFixed(2)}% ${l.rate_type}` },
        { k: "Ends", v: when(l.end_date) },
      ],
      source: `NovaBank data lake · loans ${l.loan_id}`,
    });
    relate(`loan:${l.loan_id}`, `acc:${l.debit_account_id}`, "paid from", "pays");
  }

  // --- goals
  for (const g of goals.filter((x) => x.status === "active")) {
    const owners = list(g.owner_ids);
    const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
    put({
      id: `goal:${g.goal_id}`,
      kind: "goal",
      label: g.name,
      caption: `${euro(Number(g.current_amount))} of ${euro(Number(g.target_amount))}`,
      glyph: "flag",
      state: "neutral",
      personIds: owners,
      roles: Object.fromEntries(owners.map((o) => [o, "saving"])),
      detail: `${pct}% of the way${g.target_date ? `, aiming for ${when(g.target_date)}` : ""}.`,
      facts: [
        { k: "Saved", v: euro(Number(g.current_amount)) },
        { k: "Target", v: euro(Number(g.target_amount)) },
        ...(g.target_date ? [{ k: "By", v: when(g.target_date) }] : []),
      ],
      source: `NovaBank data lake · savings_goals ${g.goal_id}`,
    });
    relate(`goal:${g.goal_id}`, `acc:${g.account_id}`, "kept in", "saving for");
  }

  // --- policies
  for (const p of policies) {
    const cover = COVER_OF_POLICY.find(([re]) => re.test(p.product))?.[1] ?? "home";
    const insured = list(p.insured);
    const node = model.nodes.find((n) => n.id === cover);
    const personState: Record<string, Status> = {};
    for (const c of node?.cells ?? []) if (c.policy?.id === p.policy_id) personState[c.personId] = c.status;
    for (const i of insured) personState[i] ??= "covered";
    const premium = p.frequency === "included" ? "included with the card" : `${euro(Number(p.premium))} ${p.frequency}`;
    const links: Link[] = [];
    if (INSURER_SITE[p.insurer]) links.push({ label: `${p.insurer} website`, href: INSURER_SITE[p.insurer], external: true });
    links.push({ label: "Policy conditions", href: `/documents/policy-${p.policy_id}-conditions.pdf`, external: true, pdf: true });
    links.push({ label: "Key information", href: `/documents/policy-${p.policy_id}-key-information.pdf`, external: true, pdf: true });
    put({
      id: `pol:${p.policy_id}`,
      kind: "policy",
      label: POLICY_LABEL[cover],
      caption: `${p.insurer} · ${premium}`,
      glyph: cover,
      state: "covered",
      personIds: [...new Set([...insured, ...Object.keys(personState)])],
      roles: Object.fromEntries(Object.entries(personState).map(([k, v]) => [k, v === "shared" ? "covered via family" : "insured"])),
      personState,
      detail: p.product,
      facts: [
        { k: "Insurer", v: p.insurer },
        { k: "Premium", v: premium },
        ...(p.renewal_date ? [{ k: "Renews", v: when(p.renewal_date) }] : []),
        ...(p.object ? [{ k: "Covers", v: p.object }] : []),
        { k: "Insured", v: namesOf(insured) },
        ...(p.note ? [{ k: "Note", v: p.note }] : []),
      ],
      source: `NovaBank data lake · insurance_policies ${p.policy_id}`,
      links,
      coverId: cover,
      products: kbc.policyCovers[cover] ?? [],
      meta: { monthly: p.frequency === "yearly" ? Number(p.premium) / 12 : p.frequency === "monthly" ? Number(p.premium) : 0, renews: p.renewal_date || undefined },
    });
    if (p.paid_from) relate(`pol:${p.policy_id}`, `acc:${p.paid_from}`, "paid from", "pays premium");
    const loan = loans.find((l) => p.object.includes(l.loan_id));
    if (loan) relate(`pol:${p.policy_id}`, `loan:${loan.loan_id}`, "protects", "protected by");
    // The house policy and the mortgage on that house belong together.
    const house = cover === "home" ? loans.find((l) => l.loan_type === "mortgage" && p.object && l.purpose.includes(p.object.split(",")[0])) : undefined;
    if (house) relate(`pol:${p.policy_id}`, `loan:${house.loan_id}`, "home loan", "insures the house");
  }

  // --- the homes, by address: which are covered, and which are not
  for (const pr of readTable("properties", true)) {
    const owners = list(pr.owners);
    const residents = list(pr.residents);
    const policy = pr.policy_id ? assets[`pol:${pr.policy_id}`] : undefined;
    const city = pr.city.replace(/^\d+\s/, "");
    const everyone = [...new Set([...owners, ...residents])];
    const personState: Record<string, Status> = {};
    for (const p of everyone) personState[p] = policy ? (owners.includes(p) ? "covered" : "shared") : "gap";
    const id = `prop:${pr.property_id}`;
    put({
      id,
      kind: "property",
      label: pr.address,
      caption: city,
      glyph: pr.kind === "apartment" ? "building" : "home",
      state: policy ? "covered" : "gap",
      personIds: everyone,
      roles: { ...Object.fromEntries(owners.map((o) => [o, "owner"])), ...Object.fromEntries(residents.filter((r) => !owners.includes(r)).map((r) => [r, "lives here"])) },
      personState,
      detail: `${pr.kind === "apartment" ? "Apartment" : "House"} in ${city}. ${pr.note}`,
      facts: [
        { k: "Address", v: `${pr.address}, ${pr.city}` },
        { k: "Owned by", v: namesOf(owners) },
        { k: "Cover", v: policy ? `${policy.caption}` : "No home policy on file" },
      ],
      source: "Properties list",
    });
    if (policy) relate(id, policy.id, "insured by", "insures");
    const mortgage = loans.find((l) => l.loan_type === "mortgage" && l.purpose.includes(pr.address));
    if (mortgage) relate(id, `loan:${mortgage.loan_id}`, "mortgage", "on the house");

    // A home with no policy is a missing cover for whoever owns it.
    const kp = kbc.products.find((x) => x.id === "home-second");
    const homeNode = model.nodes.find((n) => n.id === "home");
    if (!policy && kp && homeNode) {
      for (const owner of owners) {
        const gapId = `gap:home-second:${owner}`;
        put({
          id: gapId,
          kind: "gap",
          label: pr.address,
          caption: "Missing",
          glyph: "building",
          state: "gap",
          personIds: [owner],
          roles: { [owner]: "missing" },
          detail: `${pr.address} in ${city} has no home policy on file.`,
          facts: [{ k: "Would close it", v: kp.name }, { k: "Indicative price", v: `from €${homeNode.product.monthly} / month (estimate)` }],
          source: "Rules over policies and properties",
          links: [{ label: "Key information", href: `/documents/product-${kp.id}.pdf`, external: true, pdf: true }],
          coverId: "home",
          product: { ...homeNode.product, name: kp.name },
          priority: "medium",
          kbcId: kp.id,
          story: { headline: `Apartment in ${city} not covered`, line: `Owned by ${namesOf(owners)}, with no home policy on file.` },
        });
        relate(id, gapId, "missing cover");
      }
    }
  }

  // --- gaps and upcoming needs, one per person per cover
  for (const n of model.nodes)
    for (const c of n.cells) {
      if (c.status !== "gap" && c.status !== "upcoming") continue;
      const id = `gap:${n.id}:${c.personId}`;
      const kp = kbc.products.find((x) => x.id === n.kbcProduct);
      const links: Link[] = kp ? [{ label: "Key information", href: `/documents/product-${kp.id}.pdf`, external: true, pdf: true }] : [];
      put({
        id,
        kind: "gap",
        label: kp?.short ?? n.label,
        caption: c.status === "upcoming" ? "Needed soon" : `Gap${c.priority ? ` · ${c.priority}` : ""}`,
        glyph: kp?.glyph ?? n.id,
        state: c.status,
        personIds: [c.personId],
        roles: { [c.personId]: c.status === "upcoming" ? "needed soon" : "missing" },
        detail: c.detail,
        facts: [
          ...(c.priority ? [{ k: "Priority", v: c.priority }] : []),
          { k: "Would close it", v: n.product.name },
          { k: "Indicative price", v: `from €${n.product.monthly} / month (mock)` },
          ...c.flags.map((f) => ({ k: "Worth a look", v: f })),
        ],
        source: "Rules over policies, loans, goals and transactions",
        links,
        coverId: n.id,
        product: n.product,
        priority: c.priority,
        kbcId: kp?.id,
        story: { headline: n.headline[c.status === "upcoming" ? "upcoming" : "gap"] ?? n.headline.gap ?? n.label, line: c.detail },
      });
      for (const parent of n.parents) {
        const held = model.nodes.find((x) => x.id === parent)?.cells.find((x) => x.personId === c.personId)?.policy;
        if (held) relate(id, `pol:${held.id}`, "builds on");
      }
    }

  // --- the bank's own documents, on what they are about
  for (const d of readTable("documents")) {
    const about = (d.related || "").split(/[\s,;|]+/).filter(Boolean);
    const link: Link = { label: d.title, href: `/documents/doc-${d.doc_id}.pdf`, external: true, pdf: true };
    for (const id of about) for (const key of [`acc:${id}`, `loan:${id}`, `pol:${id}`, `goal:${id}`]) if (assets[key]) assets[key].links.push(link);
  }

  // --- people, and how they relate
  const family: EgoModel["family"] = {};
  for (const p of persons) {
    const household = households.find((h) => h.household_id === p.household_id);
    put({
      id: `person:${p.person_id}`,
      kind: "person",
      label: p.first_name,
      caption: p.household_role.split(" - ")[0].split(" / ")[0],
      glyph: Number(p.age_at_snapshot) >= 70 ? "elder" : Number(p.age_at_snapshot) < 26 ? "young" : "adult",
      state: "neutral",
      personIds: [p.person_id],
      roles: {},
      detail: `${p.first_name} ${p.last_name}, ${p.age_at_snapshot}. ${p.occupation}.`,
      facts: [
        { k: "Lives in", v: `${p.city}${household ? `, ${household.dwelling}` : ""}` },
        { k: "Segment", v: p.segment.replace(/_/g, " ") },
        { k: "Digital comfort", v: p.digital_literacy.replace(/_/g, " ") },
        { k: "Prefers", v: p.preferred_channel.replace(/_/g, " ") },
        { k: "Customer since", v: when(p.customer_since) },
      ],
      source: `NovaBank data lake · persons ${p.person_id}`,
      meta: { age: Number(p.age_at_snapshot) },
    });
  }
  for (const r of relationships) {
    (family[r.person_id] ??= []).push({ id: r.related_person_id, relation: OTHER_IS[r.relation] ?? r.relation.replace(/_/g, " ") });
    (family[r.related_person_id] ??= []).push({ id: r.person_id, relation: OTHER_IS_BACK[r.relation] ?? r.relation.replace(/_/g, " ") });
  }
  for (const a of Object.values(assets)) {
    if (a.kind === "person") continue;
    for (const pid of a.personIds) {
      const role = a.roles[pid];
      if (role) relate(`person:${pid}`, a.id, role.replace(/^covered via family$/, "covered via family"));
    }
  }
  for (const [pid, rels] of Object.entries(family)) {
    const seen = new Set<string>();
    family[pid] = rels.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    for (const r of family[pid]) assets[`person:${pid}`]?.related.push({ id: `person:${r.id}`, relation: r.relation });
  }

  // --- cover through work: what we know is that an employer exists, not what it gives
  for (const p of persons.filter((x) => x.employer)) {
    const employer = p.employer.replace(/\s*\(.*\)\s*$/, "").replace(/\s+(NV|BV|BVBA|VZW)$/i, "");
    const note = policies.find((x) => list(x.insured).includes(p.person_id) && /employer/i.test(x.note))?.note;
    put({
      id: `work:${p.person_id}`,
      kind: "employer",
      label: employer,
      caption: "Through work",
      glyph: "building",
      state: "neutral",
      personIds: [p.person_id],
      roles: { [p.person_id]: "employee" },
      detail: `${employer} may offer group insurance. I don\u2019t have the details.`,
      facts: [{ k: "Employer", v: employer }, ...(note ? [{ k: "Worth a look", v: note }] : [])],
      source: "Employer on file",
      priority: "medium",
      story: { headline: "Check insurance through work", line: `${employer} may give you hospital, pension or income cover. Worth knowing before you buy anything.` },
    });
  }

  // --- the KBC catalogue: each product, and what it means for each person
  const categoryLabel = new Map(kbc.categories.map((c) => [c.id, c.label]));
  for (const kp of kbc.products) {
    const personState: Record<string, Status> = {};
    const via: Record<string, string> = {};
    for (const p of model.people) {
      const pol = Object.values(assets).find((a) => a.kind === "policy" && a.products?.includes(kp.id) && a.personState[p.id]);
      if (pol) {
        personState[p.id] = pol.personState[p.id];
        via[p.id] = pol.id;
        continue;
      }
      const gap = Object.values(assets).find((a) => a.kind === "gap" && a.kbcId === kp.id && a.personIds.includes(p.id));
      if (gap && (gap.state === "gap" || gap.state === "upcoming")) {
        personState[p.id] = gap.state;
        via[p.id] = gap.id;
      }
    }
    put({
      id: `kbc:${kp.id}`,
      kind: "product",
      label: kp.short,
      caption: categoryLabel.get(kp.category) ?? kp.category,
      glyph: kp.glyph,
      state: "neutral",
      personIds: [],
      personState,
      via,
      detail: `${kp.name}. ${kp.covers}.`,
      facts: [
        { k: "Offered by", v: "KBC (mock catalogue)" },
        { k: "Covers", v: kp.covers },
        { k: "Group", v: categoryLabel.get(kp.category) ?? kp.category },
      ],
      source: "KBC insurance grouping agreed by the team · kbc-insurance-catalogue.json",
      links: [{ label: "Key information", href: `/documents/product-${kp.id}.pdf`, external: true, pdf: true }],
    });
  }

  // --- what sits around each person
  const byPerson: Record<string, Territories> = {};
  for (const p of model.people) {
    const mine = (kinds: AssetKind[]) => Object.values(assets).filter((a) => kinds.includes(a.kind) && a.personIds.includes(p.id)).map((a) => a.id);
    byPerson[p.id] = {
      insurance: mine(["policy"]),
      money: mine(["account", "card"]),
      credit: mine(["loan", "goal"]),
      needs: mine(["gap"]).sort((a, b) => Number(assets[b].state === "upcoming") - Number(assets[a].state === "upcoming")),
    };
  }
  // --- who may see whose world: from who owns or has been given access to each account
  const matrix: EgoModel["access"] = {};
  for (const v of model.people) {
    matrix[v.id] = {};
    for (const t of model.people) {
      if (v.id === t.id) {
        matrix[v.id][t.id] = "self";
        continue;
      }
      const theirs = Object.values(assets).filter((a) => a.kind === "account" && a.personIds.includes(t.id));
      const roles = theirs.map((a) => a.roles[v.id] ?? "");
      matrix[v.id][t.id] = theirs.some((a) => a.roles[v.id] === "owner") ? "joint" : roles.some((r) => /proxy mandate/.test(r)) ? "proxy" : roles.some((r) => /proxy view|shared view/.test(r)) ? "view" : "none";
    }
  }
  return { assets, byPerson, family, access: matrix };
}
