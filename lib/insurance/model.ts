import catalogue from "@/data/insurance-catalogue.json";
import { list, readTable, type Row } from "./csv";

/** covered: own policy. shared: covered through someone else's policy. upcoming: a life event will need it. */
export type Status = "covered" | "shared" | "gap" | "upcoming" | "na";
export type Priority = "high" | "medium" | "low";

export type Person = {
  id: string;
  name: string;
  age: number;
  role: string;
  householdId: string;
};

export type PolicyRef = {
  id: string;
  insurer: string;
  product: string;
  premium: string;
  renewal: string | null;
};

export type Cell = {
  personId: string;
  status: Status;
  detail: string;
  priority?: Priority;
  policy?: PolicyRef;
  flags: string[];
};

export type Product = { name: string; monthly: number; pitch: string };

export type TreeNode = {
  id: string;
  label: string;
  tier: 1 | 2 | 3;
  parents: string[];
  icon: string;
  summary: string;
  /** The KBC product (see data/kbc-insurance-catalogue.json) that would close a gap in this cover. */
  kbcProduct: string | null;
  /** One short line per status: what is wrong, in plain words. */
  headline: { gap?: string; upcoming?: string };
  product: Product;
  cells: Cell[];
};

export type Household = { id: string; name: string; address: string; memberIds: string[] };

export type InsuranceModel = {
  snapshot: string;
  households: Household[];
  people: Person[];
  nodes: TreeNode[];
};

const SNAPSHOT = "2026-09-30";
const DAY = 86_400_000;

function daysUntil(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(SNAPSHOT)) / DAY);
}

function money(value: number): string {
  return `€${Math.round(value).toLocaleString("en-BE")}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function policyRef(row: Row): PolicyRef {
  const freq = row.frequency === "included" ? "included with card" : `€${row.premium} ${row.frequency}`;
  return {
    id: row.policy_id,
    insurer: row.insurer,
    product: row.product,
    premium: freq,
    renewal: row.renewal_date || null,
  };
}

export function buildModel(): InsuranceModel {
  const persons = readTable("persons");
  const households = readTable("households");
  const policies = readTable("insurance_policies");
  const loans = readTable("loans");
  const goals = readTable("savings_goals");
  const accounts = readTable("accounts");
  const transactions = readTable("transactions");
  const security = readTable("security_events");

  const people: Person[] = persons.map((p) => ({
    id: p.person_id,
    name: p.first_name,
    age: Number(p.age_at_snapshot),
    role: p.household_role,
    householdId: p.household_id,
  }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const householdOf = new Map(households.map((h) => [h.household_id, h]));

  // Signals the rules read. Everything is derived from the tables, nothing is keyed on person ids.
  const accountHousehold = new Map<string, string>();
  for (const a of accounts) {
    const owner = byId.get(list(a.owners)[0] ?? "");
    if (owner) accountHousehold.set(a.account_id, owner.householdId);
  }
  const txByHousehold = (sub: string[]) => {
    const counts = new Map<string, { n: number; sum: number }>();
    for (const t of transactions) {
      if (!sub.includes(t.subcategory) || t.status !== "booked") continue;
      const hh = accountHousehold.get(t.account_id);
      if (!hh) continue;
      const cur = counts.get(hh) ?? { n: 0, sum: 0 };
      counts.set(hh, { n: cur.n + 1, sum: cur.sum + Math.abs(Number(t.amount)) });
    }
    return counts;
  };
  const careTx = txByHousehold(["home_nursing_copay", "care_allowance", "care_equipment"]);
  const hospitalTx = txByHousehold(["hospital"]);
  const garageTx = txByHousehold(["car_maintenance"]);
  const securityByPerson = new Map<string, number>();
  for (const s of security) securityByPerson.set(s.person_id, (securityByPerson.get(s.person_id) ?? 0) + 1);

  const activeGoal = (pattern: RegExp, personId: string) =>
    goals.find(
      (g) => g.status === "active" && pattern.test(g.name) && list(g.owner_ids).includes(personId),
    );
  const goalPct = (g: Row) => Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);

  const policiesFor = (pattern: RegExp) => policies.filter((p) => pattern.test(p.product));
  const insuredBy = (rows: Row[], personId: string) => rows.find((p) => list(p.insured).includes(personId));

  const cell = (
    personId: string,
    status: Status,
    detail: string,
    extra: Partial<Cell> = {},
  ): Cell => ({ personId, status, detail, flags: [], ...extra });

  const rules: Record<string, (p: Person) => Cell> = {
    hospital(p) {
      const hit = insuredBy(policiesFor(/hospitalisation/i), p.id);
      if (hit) {
        const c = cell(p.id, "covered", `Covered by ${hit.insurer}.`, { policy: policyRef(hit) });
        if (/employer/i.test(hit.note) && /dependant/i.test(hit.note) && /working/i.test(p.role))
          c.flags.push("Employer group cover may overlap: check before paying twice");
        return c;
      }
      const hh = hospitalTx.get(p.householdId);
      const why = hh
        ? `${money(hh.sum)} hospital bill paid out of pocket.`
        : "No hospital cover.";
      return cell(p.id, "gap", why, { priority: p.age >= 65 ? "high" : "medium" });
    },
    liability(p) {
      return cell(p.id, "gap", "No family liability cover.", {
        priority: p.age < 30 ? "medium" : "low",
      });
    },
    home(p) {
      const home = householdOf.get(p.householdId);
      const address = home?.address.split(",")[0] ?? "";
      const hit = policiesFor(/home/i).find((x) => x.object.includes(address));
      if (!hit) return cell(p.id, "gap", "No home policy on file.", { priority: "high" });
      const policy = policyRef(hit);
      const own = list(hit.insured).includes(p.id);
      const goal = activeGoal(/apartment|house|home/i, p.id);
      if (!own && goal)
        return cell(
          p.id,
          "upcoming",
          `Saving for their own place (${goalPct(goal)}% there).`,
          { priority: "high", policy },
        );
      const c = cell(
        p.id,
        own ? "covered" : "shared",
        own ? `Covered by ${hit.insurer}.` : "Covered through the household policy.",
        { policy },
      );
      if (hit.renewal_date && own && daysUntil(hit.renewal_date) <= 60)
        c.flags.push(`Renews ${formatDate(hit.renewal_date)} (${daysUntil(hit.renewal_date)} days): a moment to review`);
      return c;
    },
    car(p) {
      const hit = insuredBy(policiesFor(/car insurance/i), p.id);
      if (!hit) return cell(p.id, "na", "No car on file.");
      const c = cell(p.id, "covered", `Covered by ${hit.insurer}.`, { policy: policyRef(hit) });
      if (hit.note) c.flags.push(hit.note);
      const loan = loans.find((l) => l.loan_type === "car_loan" && list(l.borrowers).includes(p.id));
      if (loan) c.flags.push(`Car loan ends ${formatDate(loan.end_date)}, freeing ${money(Number(loan.monthly_installment))} a month`);
      return c;
    },
    fraud(p) {
      const events = securityByPerson.get(p.id) ?? 0;
      const householdEvents = people
        .filter((q) => q.householdId === p.householdId)
        .reduce((n, q) => n + (securityByPerson.get(q.id) ?? 0), 0);
      if (householdEvents === 0 || p.age < 65) return cell(p.id, "na", "No fraud signals on file.");
      const why =
        events > 0
          ? "Phishing call in June, transfer blocked."
          : "Shares accounts with a scam target.";
      return cell(p.id, "gap", why, { priority: "high" });
    },
    travel(p) {
      const hit = insuredBy(policiesFor(/travel/i), p.id);
      if (hit) return cell(p.id, "covered", `Covered through the ${hit.insurer} card.`, { policy: policyRef(hit) });
      const goal = activeGoal(/erasmus|abroad|exchange/i, p.id);
      if (goal)
        return cell(p.id, "upcoming", `${goal.name} in ${new Date(goal.target_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}. Not covered abroad.`, {
          priority: "high",
        });
      if (p.age < 65 && p.age >= 18)
        return cell(p.id, "gap", "Not named on the card's travel cover.", { priority: "low" });
      return cell(p.id, "na", "No travel signals on file.");
    },
    legal(p) {
      const adultOwner = p.age >= 30 && p.age < 65;
      if (!adultOwner) return cell(p.id, "na", "Not indicated for this person.");
      return cell(p.id, "gap", "Owns a home and a car, with no legal help.", { priority: "low" });
    },
    contents(p) {
      if (!/student/i.test(p.role)) return cell(p.id, "na", "Not indicated for this person.");
      return cell(p.id, "gap", "Student room not covered by the family policy.", {
        priority: "medium",
      });
    },
    mortgage(p) {
      const loan = loans.find((l) => l.loan_type === "mortgage" && list(l.borrowers).includes(p.id));
      if (loan) {
        const hit = policiesFor(/mortgage protection|schuldsaldo/i).find((x) => x.object.includes(loan.loan_id));
        if (hit)
          return cell(p.id, "covered", `Covers the ${money(Number(loan.outstanding_at_snapshot))} still owed.`, {
            policy: policyRef(hit),
          });
        return cell(p.id, "gap", "The mortgage has no protection.", { priority: "high" });
      }
      const goal = activeGoal(/apartment|house|home/i, p.id);
      if (goal) return cell(p.id, "upcoming", "A first mortgage is likely soon.", { priority: "medium" });
      return cell(p.id, "na", "No mortgage.");
    },
    roadside(p) {
      const car = insuredBy(policiesFor(/car insurance/i), p.id);
      const spend = garageTx.get(p.householdId);
      if (!car || !spend) return cell(p.id, "na", "No car on file.");
      return cell(p.id, "gap", `${spend.n} garage bills (${money(spend.sum)}) on an ageing car.`, {
        priority: "low",
      });
    },
    care(p) {
      if (p.age < 75) return cell(p.id, "na", "Not yet indicated.");
      const care = careTx.get(p.householdId);
      const why = care
        ? "Home nursing and care costs are rising."
        : "Care needs likely with age.";
      return cell(p.id, "gap", why, { priority: care ? "high" : "medium" });
    },
    income(p) {
      const loan = loans.find((l) => l.loan_type === "mortgage" && list(l.borrowers).includes(p.id));
      if (loan && p.age < 60)
        return cell(p.id, "gap", `${loan.remaining_installments} mortgage instalments left, and no income cover on file. Check cover through work first.`, {
          priority: "medium",
        });
      return cell(p.id, "na", "Not indicated for this person.");
    },
  };

  const nodes: TreeNode[] = catalogue.map((n) => ({
    id: n.id,
    label: n.label,
    tier: n.tier as 1 | 2 | 3,
    parents: n.parents,
    icon: n.icon,
    summary: n.summary,
    kbcProduct: n.kbcProduct,
    headline: n.headline as { gap?: string; upcoming?: string },
    product: n.product,
    cells: people.map((p) => rules[n.id](p)),
  }));

  return {
    snapshot: SNAPSHOT,
    households: households.map((h) => ({
      id: h.household_id,
      name: h.name,
      address: h.address,
      memberIds: list(h.members),
    })),
    people,
    nodes,
  };
}
