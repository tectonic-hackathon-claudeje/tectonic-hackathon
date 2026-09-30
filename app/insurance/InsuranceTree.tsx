"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset, EgoModel } from "@/lib/insurance/ego";
import { KBC } from "@/lib/insurance/kbc";
import type { InsuranceModel, Status } from "@/lib/insurance/model";
import { EgoMap } from "./EgoMap";
import { PixelIcon } from "./pixel";
import { PosterMap } from "./PosterMap";
import { answer, suggestions, type Action, type Answer } from "./assistant";
import { assetScene, categoryScene, groupScene, personScene, stepLabel, type Step } from "./scenes";
import { UnusualActivityReview } from "./UnusualActivityReview";
import { UnusualActivityToast } from "./UnusualActivityToast";
import { formatEuro, isReviewHandled, UNUSUAL_TRANSFER, type ReviewOutcome } from "./unusualTransfer";

type Theme = "kbc" | "dark" | "plain";
type View = "person" | "family";

const THEME_LABEL: Record<Theme, string> = { kbc: "KBC", dark: "Dark", plain: "Plain" };
const STATE_WORD: Record<Status, string> = { covered: "Covered", shared: "Covered via family", gap: "Not covered", upcoming: "Needed soon", na: "" };

export function InsuranceTree({ model, ego, initialTheme, initialPerson }: { model: InsuranceModel; ego: EgoModel; initialTheme: Theme; initialPerson: string }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>("person");
  const [personId, setPersonId] = useState(initialPerson);
  const [trail, setTrail] = useState<Step[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [alertOutcome, setAlertOutcome] = useState<ReviewOutcome>("pending");
  const [reviewOpen, setReviewOpen] = useState(false);

  // The theme belongs to the whole page, so it lives on <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);
  useEffect(() => setShowAll(false), [trail, personId]);

  const nodesById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const person = model.people.find((p) => p.id === personId) ?? model.people[0];
  const here = trail[trail.length - 1];
  const scene = useMemo(() => {
    if (!here) return personScene(ego, personId);
    if (here.kind === "group") return groupScene(ego, personId, here.id);
    if (here.kind === "category") return categoryScene(ego, personId, here.group, here.id, showAll);
    return assetScene(ego, here.id, personId);
  }, [ego, here, personId, showAll]);
  // Groups and categories are not assets: the scene describes them.
  const lookup = useCallback((id: string): Asset | undefined => scene.details[id] ?? ego.assets[id], [scene, ego]);
  const shown = ((selectedId && lookup(selectedId)) || lookup(scene.center.id)) as Asset;

  const switchPerson = useCallback((id: string) => {
    setPersonId(id);
    setTrail([]);
    setSelectedId(null);
  }, []);
  const open = useCallback(
    (id: string) => {
      if (id.startsWith("person:")) return switchPerson(id.slice(7));
      if (id.startsWith("more:")) {
        setShowAll(true);
        setSelectedId(null);
        return;
      }
      let step: Step;
      if (id.startsWith("grp:")) step = { kind: "group", id: id.slice(4) };
      else if (id.startsWith("cat:")) {
        const [, group, cid] = id.split(":");
        step = { kind: "category", group, id: cid };
      } else if (id.startsWith("kbc:")) {
        // A catalogue product opens as whatever this person has of it: their policy, or their gap.
        step = { kind: "asset", id: ego.assets[id]?.via?.[personId] ?? id };
      } else step = { kind: "asset", id };
      setTrail((t) => (JSON.stringify(t[t.length - 1]) === JSON.stringify(step) ? t : [...t, step]));
      setSelectedId(null);
    },
    [switchPerson, ego, personId],
  );
  const openForPerson = useCallback((id: string, assetId: string) => {
    setView("person");
    setPersonId(id);
    setTrail([{ kind: "asset", id: assetId }]);
    setSelectedId(null);
  }, []);
  const back = useCallback(() => {
    setTrail((t) => t.slice(0, -1));
    setSelectedId(null);
  }, []);
  const overview = useCallback(() => {
    setTrail([]);
    setSelectedId(null);
  }, []);
  const goTo = useCallback((depth: number) => {
    setTrail((t) => t.slice(0, depth));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (view !== "person" || reviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (e.key === "Escape" || (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey) && !e.shiftKey)) {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        overview();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && shown && shown.id !== scene.center.id) {
        e.preventDefault();
        open(shown.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, reviewOpen, back, overview, open, shown, scene.center.id]);

  const toggleProposal = useCallback((id: string) => setProposal((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), []);
  const proposalNodes = proposal.map((id) => nodesById.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const monthly = proposalNodes.reduce((s, n) => s + n.product.monthly, 0);

  // The assistant can take you somewhere (a subtree), switch person, or add to the proposal.
  const navigate = useCallback((steps: Step[], person?: string) => {
    setView("person");
    if (person) setPersonId(person);
    setTrail(steps);
    setSelectedId(null);
  }, []);
  const addCovers = useCallback((covers: string[]) => setProposal((cur) => [...new Set([...cur, ...covers])]), []);
  const runAction = useCallback(
    (a: Action) => {
      if (a.kind === "go") navigate(a.steps, a.person);
      else if (a.kind === "person") switchPerson(a.person);
      else addCovers(a.covers);
    },
    [navigate, switchPerson, addCovers],
  );

  const state = shown.kind === "policy" || shown.kind === "product" ? (shown.personState[personId] ?? (shown.kind === "product" ? "neutral" : shown.state)) : shown.state;
  const connections = shown.related.filter((r) => lookup(r.id) && (shown.kind !== "person" || r.id.startsWith("person:") || /proxy|shared view/.test(r.relation)));
  const relatedIds = connections.map((r) => r.id);
  // What would close a gap: the gap itself, or a catalogue product this person is missing.
  const viaAsset = shown.kind === "product" ? ego.assets[shown.via?.[personId] ?? ""] : undefined;
  const gap = shown.kind === "gap" ? shown : viaAsset?.kind === "gap" ? viaAsset : undefined;
  const canOpen = shown.id !== scene.center.id && shown.kind !== "person";
  const canSwitch = shown.kind === "person" && shown.id !== `person:${personId}`;
  const alertInitiator = model.people.find((p) => p.id === UNUSUAL_TRANSFER.initiatorId);
  const alertReviewer = model.people.find((p) => p.id === UNUSUAL_TRANSFER.reviewerId);
  const alertAccount = ego.assets[UNUSUAL_TRANSFER.accountId];
  const nameOf = (id: string) => model.people.find((p) => p.id === id)?.name ?? id;
  const transferTaskOpen = Boolean(alertInitiator && alertReviewer && alertAccount) && !isReviewHandled(alertOutcome);

  // The switcher is about the person being looked at: their spouse, children, parents, and so on.
  const menuGroups = useMemo(() => {
    const LABEL: [string, string][] = [["spouse", "Spouse"], ["child", "Children"], ["parent", "Parents"], ["sibling", "Siblings"], ["grandparent", "Grandparents"], ["grandchild", "Grandchildren"]];
    const rel = ego.family[personId] ?? [];
    const groups = LABEL.map(([key, label]) => ({ label, ids: rel.filter((r) => r.relation === key).map((r) => r.id) })).filter((g) => g.ids.length > 0);
    const listed = new Set([personId, ...groups.flatMap((g) => g.ids)]);
    const others = model.people.filter((p) => !listed.has(p.id)).map((p) => p.id);
    return others.length > 0 ? [...groups, { label: "Others in the family", ids: others }] : groups;
  }, [ego, model.people, personId]);

  // Alerts are messages, not a place on the map: a bell in the bar, and stories in the panel.
  const alerts = useMemo(() => {
    const rank = (a: Asset) => (a.state === "upcoming" ? 0 : a.priority === "high" ? 1 : a.priority === "medium" ? 2 : 3);
    const all = Object.values(ego.assets).filter((a) => a.kind === "gap").sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
    const mine = all.filter((a) => a.personIds.includes(personId));
    // The rest of the family, but only what is pressing: Koen looks after his parents as well.
    const others = all.filter((a) => !a.personIds.includes(personId) && rank(a) <= 1).slice(0, 6);
    return { mine, others };
  }, [ego, personId]);
  const alertCount = alerts.mine.length + alerts.others.length + (transferTaskOpen ? 1 : 0);

  const openAlert = useCallback((a: Asset, e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.currentTarget.closest("details")?.removeAttribute("open");
    const category = KBC.products.find((p) => p.id === a.kbcId)?.category;
    setView("person");
    setPersonId(a.personIds[0]);
    setTrail(category ? [{ kind: "category", group: "insurance", id: category }, { kind: "asset", id: a.id }] : [{ kind: "asset", id: a.id }]);
    setSelectedId(null);
  }, []);

  // The story for what is selected: a category's own alerts, or everything for the person.
  const stories = useMemo(() => {
    if (shown.kind === "category" && shown.id.startsWith("cat:insurance:")) {
      const cid = shown.id.split(":")[2];
      return alerts.mine.filter((a) => KBC.products.find((p) => p.id === a.kbcId)?.category === cid);
    }
    return shown.id === `person:${personId}` ? alerts.mine : [];
  }, [shown, alerts.mine, personId]);
  const inPlace = useMemo(() => {
    if (shown.kind !== "category" || !shown.id.startsWith("cat:insurance:")) return [];
    const cid = shown.id.split(":")[2];
    return KBC.products.filter((p) => p.category === cid && ["covered", "shared"].includes(ego.assets[`kbc:${p.id}`]?.personState[personId] ?? "")).map((p) => p.short);
  }, [shown, ego, personId]);

  return (
    <div className="cw">
      <header className="cw-bar">
        <Link href="/" className="cw-mark" aria-label="Product explorer home">
          KBC<span> · Family cover</span>
        </Link>
        <span className="cw-tag">mock data</span>
        <span className="cw-sep" aria-hidden="true" />
        <details className="cw-menu">
          <summary>
            <PixelIcon id={ego.assets[`person:${person.id}`]?.glyph ?? "adult"} size={16} /> {person.name}
            <span aria-hidden="true"> ▾</span>
          </summary>
          <ul>
            <li className="cw-menu-group">
              <span>Looking at</span>
              <button type="button" aria-current="true" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
                <PixelIcon id={ego.assets[`person:${person.id}`]?.glyph ?? "adult"} size={16} /> {person.name}
              </button>
            </li>
            {menuGroups.map((g) => (
              <li key={g.label} className="cw-menu-group">
                <span>{g.label}</span>
                {g.ids.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={(e) => {
                      switchPerson(id);
                      e.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <PixelIcon id={ego.assets[`person:${id}`]?.glyph ?? "adult"} size={16} /> {model.people.find((p) => p.id === id)?.name}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </details>
        <div className="cw-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "person"} onClick={() => setView("person")}>Person</button>
          <button type="button" aria-pressed={view === "family"} onClick={() => setView("family")}>Family map</button>
        </div>
        <div className="cw-right">
          <details className="cw-menu cw-alerts">
            <summary aria-label={`${alertCount} alerts`}>
              <PixelIcon id="alert" size={16} />
              {alertCount > 0 ? <span className="cw-badge">{alertCount}</span> : null}
            </summary>
            <div>
              {alertCount === 0 ? <p>Nothing needs attention.</p> : null}
              {transferTaskOpen && alertInitiator && alertReviewer && alertAccount ? (
                <section>
                  <h3>{personId === alertReviewer.id ? `To do for ${alertReviewer.name}` : `Waiting on ${alertReviewer.name}`}</h3>
                  <ul>
                    <li>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.closest("details")?.removeAttribute("open");
                          setReviewOpen(true);
                        }}
                      >
                        <span className="cw-toast-icon" aria-hidden="true">!</span>
                        <span>
                          <strong>
                            <i className="cw-dot cw-dot-gap" aria-hidden="true" />
                            Check {alertInitiator.name}&apos;s {formatEuro(UNUSUAL_TRANSFER.amountEur)} transfer
                          </strong>
                          <small>
                            On hold from {alertAccount.label} · {UNUSUAL_TRANSFER.when}. {alertReviewer.name} confirms or blocks it with {alertInitiator.name}.
                          </small>
                        </span>
                      </button>
                    </li>
                  </ul>
                </section>
              ) : null}
              {[{ title: `For ${person.name}`, items: alerts.mine }, { title: "Elsewhere in the family", items: alerts.others }]
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <section key={g.title}>
                    <h3>{g.title}</h3>
                    <ul>
                      {g.items.map((a) => (
                        <li key={a.id}>
                          <button type="button" onClick={(e) => openAlert(a, e)}>
                            <PixelIcon id={a.glyph} size={24} />
                            <span>
                              <strong>
                                <i className={`cw-dot cw-dot-${a.state}`} aria-hidden="true" />
                                {a.personIds[0] !== personId ? `${model.people.find((p) => p.id === a.personIds[0])?.name} · ` : ""}
                                {a.story?.headline}
                              </strong>
                              <small>{a.story?.line}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          </details>
          <div className="cw-seg" role="group" aria-label="Theme">
            {(["kbc", "dark", "plain"] as Theme[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{THEME_LABEL[t]}</button>
            ))}
          </div>
          <details className="cw-menu cw-proposal">
            <summary className="cw-cta">{proposalNodes.length > 0 ? `€${monthly}/mo · ${proposalNodes.length}` : "Proposal"}</summary>
            <div>
              {proposalNodes.length === 0 ? (
                <p>Add a product from a story to start an offer.</p>
              ) : (
                <>
                  <ul>
                    {proposalNodes.map((n) => (
                      <li key={n.id}>
                        <span>{n.product.name}</span>
                        <button type="button" onClick={() => toggleProposal(n.id)} aria-label={`Remove ${n.product.name}`}>×</button>
                        <span>€{n.product.monthly}</span>
                      </li>
                    ))}
                  </ul>
                  <p><strong>From €{monthly} / month</strong></p>
                </>
              )}
            </div>
          </details>
        </div>
      </header>

      {view === "person" ? (
        <>
          <div className="cw-crumbs">
            <button type="button" className="cw-back" onClick={back} disabled={trail.length === 0} aria-label="Back">←</button>
            <nav aria-label="Where you are">
              <button type="button" onClick={overview} aria-current={trail.length === 0 ? "page" : undefined} disabled={trail.length === 0}>{person.name}</button>
              {trail.map((s, i) => (
                <span key={`${JSON.stringify(s)}-${i}`}>
                  <span aria-hidden="true"> / </span>
                  <button type="button" onClick={() => goTo(i + 1)} aria-current={i === trail.length - 1 ? "page" : undefined} disabled={i === trail.length - 1}>{stepLabel(ego, s, personId)}</button>
                </span>
              ))}
            </nav>
          </div>
          <div className="cw-body">
            <section className="cw-canvas" aria-label={scene.title}>
              <EgoMap scene={scene} selectedId={selectedId} relatedIds={relatedIds} onSelect={setSelectedId} onOpen={open} />
            </section>
            <Panel
              asset={shown}
              state={state}
              personName={person.name}
              stories={stories}
              inPlace={inPlace}
              gap={gap}
              viaPolicy={shown.kind === "product" ? ego.assets[shown.via?.[personId] ?? ""] : undefined}
              people={model.people}
              personId={personId}
              lookup={lookup}
              onJump={setSelectedId}
              canOpen={canOpen}
              canSwitch={canSwitch}
              onOpen={() => open(shown.id)}
              onOpenStory={(a) => openAlert(a)}
              proposal={proposal}
              onToggleProposal={toggleProposal}
              footer={<Assistant shown={shown} name={person.name} ask={(q) => answer(q, { ego, model, personId, shown, mine: alerts.mine, proposal })} onAction={runAction} />}
            />
          </div>
        </>
      ) : (
        <div className="cw-body cw-body-wide">
          <section className="cw-canvas" aria-label="Family cover map">
            <PosterMap model={model} scope="all" proposal={proposal} onToggleProposal={toggleProposal} focusRequest={null} />
          </section>
        </div>
      )}
      {alertInitiator && alertReviewer && alertAccount ? (
        <UnusualActivityToast
          visible={alertOutcome === "pending" && !reviewOpen && personId === alertReviewer.id}
          initiatorName={alertInitiator.name}
          reviewerName={alertReviewer.name}
          accountLabel={alertAccount.label}
          onReview={() => setReviewOpen(true)}
          onDismiss={() => setAlertOutcome("dismissed")}
        />
      ) : null}
      {reviewOpen ? (
        <UnusualActivityReview
          ego={ego}
          nameOf={nameOf}
          outcome={alertOutcome}
          proposal={proposal}
          onClose={() => setReviewOpen(false)}
          onDecide={setAlertOutcome}
          onShowAccount={() => {
            setReviewOpen(false);
            openForPerson(UNUSUAL_TRANSFER.reviewerId, UNUSUAL_TRANSFER.accountId);
          }}
          onOpenForPerson={(id, assetId) => {
            setReviewOpen(false);
            openForPerson(id, assetId);
          }}
          onToggleProposal={toggleProposal}
        />
      ) : null}
    </div>
  );
}

const priceOf = (a: Asset) => a.product?.monthly;

type Line = { text: string; links?: { id: string; label: string }[] };
const and = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] ?? ""));

/** What a normal person would want to know, in sentences: no relations, no tables. */
function goodToKnow(asset: Asset, lookup: (id: string) => Asset | undefined, people: InsuranceModel["people"], gap?: Asset): Line[] {
  const fact = (k: string) => asset.facts.find((f) => f.k === k)?.v;
  const rel = (...names: string[]) => asset.related.filter((r) => names.includes(r.relation) && lookup(r.id)).map((r) => ({ id: r.id, label: lookup(r.id)?.label ?? "" }));
  const lines: Line[] = [];
  const add = (text: string, links?: { id: string; label: string }[]) => {
    if (links && links.length === 0) return;
    lines.push({ text, links });
  };
  const holders = and(asset.personIds.map((id) => people.find((p) => p.id === id)?.name).filter((n): n is string => Boolean(n)));
  switch (asset.kind) {
    case "policy": {
      add(`${fact("Insurer")}, ${fact("Premium")}.`);
      if (fact("Insured")) add(`Covers ${and((fact("Insured") ?? "").split(", "))}.`);
      if (fact("Covers")) add(`For ${fact("Covers")}.`);
      if (fact("Renews")) add(`Renews ${fact("Renews")}.`);
      add("Paid from", rel("paid from"));
      add("Protects the", rel("protects"));
      if (fact("Note")) add(`Tip: ${fact("Note")}.`);
      break;
    }
    case "gap": {
      const covers = gap?.kbcId ? KBC.products.find((p) => p.id === gap.kbcId)?.covers : undefined;
      if (covers) add(`Covers ${covers.charAt(0).toLowerCase()}${covers.slice(1)}.`);
      if (asset.product) add(asset.product.pitch);
      add("Goes with", rel("builds on"));
      for (const f of asset.facts.filter((x) => x.k === "Worth a look")) add(`${f.v}.`);
      break;
    }
    case "account":
      add(`Balance ${fact("Balance")}.`);
      if (holders) add(`${asset.personIds.length > 1 ? "Shared by" : "Belongs to"} ${holders}.`);
      add("Pays for", [...rel("pays premium"), ...rel("pays")]);
      add("Has the card", rel("card"));
      add("Saving for", rel("saving for"));
      break;
    case "card":
      add(`${fact("Status")}, expires ${fact("Expires")}.`);
      add("Linked to", rel("draws on"));
      break;
    case "loan":
      add(`${fact("Still owed")} still owed, until ${fact("Ends")}.`);
      add("Paid from", rel("paid from"));
      add("Protected by", rel("protected by"));
      break;
    case "goal":
      add(asset.detail);
      add("Kept in", rel("kept in"));
      break;
    case "person":
      add(`${asset.detail}`);
      if (fact("Lives in")) add(`Lives in ${fact("Lives in")}.`);
      if (fact("Prefers")) add(`Prefers the ${fact("Prefers")}.`);
      add("Looks after", rel("proxy mandate", "proxy view only", "shared view"));
      break;
    case "product":
      add(`Covers ${(fact("Covers") ?? "").toLowerCase()}.`);
      break;
    default:
      break;
  }
  return lines;
}

function Panel({
  asset,
  state,
  personName,
  stories,
  inPlace,
  gap,
  viaPolicy,
  people,
  personId,
  lookup,
  onJump,
  canOpen,
  canSwitch,
  onOpen,
  onOpenStory,
  proposal,
  onToggleProposal,
  footer,
}: {
  asset: Asset;
  state: Asset["state"];
  personName: string;
  stories: Asset[];
  inPlace: string[];
  gap?: Asset;
  viaPolicy?: Asset;
  people: InsuranceModel["people"];
  personId: string;
  lookup: (id: string) => Asset | undefined;
  onJump: (id: string) => void;
  canOpen: boolean;
  canSwitch: boolean;
  onOpen: () => void;
  onOpenStory: (a: Asset) => void;
  proposal: string[];
  onToggleProposal: (id: string) => void;
  footer: React.ReactNode;
}) {
  const isPerson = asset.kind === "person";
  const tagline =
    gap ? gap.story?.headline
    : asset.kind === "policy" || asset.kind === "product" ? (state === "neutral" ? "Not needed right now" : STATE_WORD[state as Status])
    : asset.kind === "category" || asset.kind === "group" ? asset.caption
    : isPerson ? asset.detail.replace(/^[^,]+, /, "").replace(/\.$/, "")
    : asset.caption;
  const renews = asset.facts.find((f) => f.k === "Renews")?.v;
  const good = goodToKnow(asset, lookup, people, gap);
  const first = stories.slice(0, 3);
  const rest = stories.slice(3);
  const card = (a: Asset) => (
    <li key={a.id} className={`cw-story cw-story-${a.state}`}>
      <button type="button" className="cw-story-main" onClick={() => onOpenStory(a)}>
        <PixelIcon id={a.glyph} size={30} />
        <span>
          <strong>{a.story?.headline}</strong>
          <small>{a.story?.line}</small>
        </span>
      </button>
      {a.product && a.coverId ? (
        <button type="button" className="cw-chip" aria-pressed={proposal.includes(a.coverId)} onClick={() => onToggleProposal(a.coverId as string)}>
          {proposal.includes(a.coverId) ? "✓ Added" : `+ €${priceOf(a)}/mo`}
        </button>
      ) : null}
    </li>
  );

  return (
    <aside className="cw-panel" aria-label={`About ${asset.label}`}>
      <div className="cw-scroll">
      <header className="cw-ph">
        <PixelIcon id={asset.glyph} size={40} />
        <div>
          <h2>{asset.label}</h2>
          {tagline ? <p className={`cw-tagline cw-tagline-${state}`}>{tagline}</p> : null}
        </div>
        {canOpen ? <button type="button" className="cw-open" onClick={onOpen}>Open</button> : null}
        {canSwitch ? <button type="button" className="cw-open" onClick={onOpen}>Switch</button> : null}
      </header>

      {stories.length > 0 ? (
        <ul className="cw-stories" aria-label={`Things to look at for ${personName}`}>
          {first.map(card)}
          {rest.length > 0 ? (
            <li>
              <details className="cw-rest">
                <summary>{rest.length} more</summary>
                <ul className="cw-stories">{rest.map(card)}</ul>
              </details>
            </li>
          ) : null}
        </ul>
      ) : isPerson && asset.id === `person:${personId}` ? (
        <p className="cw-quiet">All good: nothing to look at.</p>
      ) : null}

      {inPlace.length > 0 ? <p className="cw-inplace"><span>In place</span> {inPlace.join(" · ")}</p> : null}

      {gap && gap.story ? (
        <div className="cw-gapcard">
          <p className="cw-line">{gap.story.line}</p>
          {gap.product ? (
            <div className="cw-product">
              <div>
                <strong>{gap.product.name}</strong>
                <small>from €{gap.product.monthly} / month</small>
              </div>
              {gap.coverId ? (
                <button type="button" className="cw-add" aria-pressed={proposal.includes(gap.coverId)} onClick={() => onToggleProposal(gap.coverId as string)}>
                  {proposal.includes(gap.coverId) ? "✓ Added" : "Add"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {(asset.kind === "policy" || viaPolicy?.kind === "policy") && (state === "covered" || state === "shared") ? (
        <p className="cw-line">
          {(viaPolicy ?? asset).caption}
          {renews ? ` · renews ${renews}` : ""}
        </p>
      ) : null}
      {asset.kind === "product" && !gap && state === "neutral" ? <p className="cw-line">{asset.facts.find((f) => f.k === "Covers")?.v}</p> : null}
      {["account", "card", "loan", "goal"].includes(asset.kind) ? <p className="cw-line">{asset.caption}</p> : null}

      {good.length > 0 || asset.links.length > 0 ? (
        <details className="cw-more">
          <summary>Good to know</summary>
          <ul className="cw-good">
            {good.map((l, i) => (
              <li key={i}>
                {l.text}
                {l.links?.map((k, j) => (
                  <span key={k.id}>
                    {j > 0 ? " and " : " "}
                    <button type="button" onClick={() => onJump(k.id)}>{k.label}</button>
                  </span>
                ))}
                {l.links ? "." : ""}
              </li>
            ))}
            {asset.links.map((l) => (
              <li key={l.href}>{l.external ? <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a> : <Link href={l.href}>{l.label}</Link>}</li>
            ))}
          </ul>
        </details>
      ) : null}
      </div>
      {footer}
    </aside>
  );
}

/** A small helper at the foot of the panel, everywhere: ask about a risk and it points to the right place. */
function Assistant({ shown, name, ask, onAction }: { shown: Asset; name: string; ask: (q: string) => Answer; onAction: (a: Action) => void }) {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: Answer } | null>(null);
  // A new selection is a new conversation.
  useEffect(() => setThread(null), [shown.id]);
  const send = (text: string) => {
    if (!text.trim()) return;
    setThread({ q: text, a: ask(text) });
    setQ("");
  };
  return (
    <section className="cw-assist" aria-label="Assistant">
      {thread ? (
        <div className="cw-answer" role="status">
          <p className="cw-asked">{thread.q}</p>
          <p>{thread.a.text}</p>
          {thread.a.actions.length > 0 ? (
            <div className="cw-actions">
              {thread.a.actions.map((a) => (
                <button key={a.label} type="button" onClick={() => onAction(a)}>{a.label} →</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="cw-suggest">
          {suggestions(shown, name).map((s) => (
            <button key={s} type="button" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${name}'s cover…`} aria-label="Ask the assistant" />
        <button type="submit" aria-label="Send">↑</button>
      </form>
    </section>
  );
}
