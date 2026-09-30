"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forViewer } from "@/lib/insurance/access";
import { alertsFor } from "@/lib/insurance/alerts";
import type { AccessLevel, Asset, EgoModel } from "@/lib/insurance/ego";
import { KBC } from "@/lib/insurance/kbc";
import type { InsuranceModel } from "@/lib/insurance/model";
import { answer, opener, suggestions, type Action, type Nav, type Reply } from "./assistant";
import type { Msg } from "./chatTypes";
import { ChatPanel } from "./Chat";
import { EgoMap } from "./EgoMap";
import { OfferCard, Panel } from "./Panel";
import { PixelIcon } from "./pixel";
import { PosterMap } from "./PosterMap";
import { assetScene, categoryScene, groupScene, personScene, stepLabel, type Step } from "./scenes";

type Theme = "kbc" | "dark" | "plain";
type View = "person" | "family";

const THEME_LABEL: Record<Theme, string> = { kbc: "KBC", dark: "Dark", plain: "Plain" };
/** Whose screen this is. They are "Me" on the map; everyone else is by name. */
const VIEWER = "P01";
// What the viewer can do for each person. Joint account holders need no label: they are family.
const ACCESS_WORD: Record<AccessLevel, string> = { self: "", joint: "", proxy: "Proxy", view: "View only", none: "No access" };

export function InsuranceTree({ model, ego: egoRaw, initialTheme, initialPerson }: { model: InsuranceModel; ego: EgoModel; initialTheme: Theme; initialPerson: string }) {
  // The world as this viewer may see it: one place decides what is hidden.
  const ego = useMemo<EgoModel>(() => {
    const me = egoRaw.assets[`person:${VIEWER}`];
    const named = me ? { ...egoRaw, assets: { ...egoRaw.assets, [me.id]: { ...me, label: "Me", caption: "" } } } : egoRaw;
    return forViewer(named, VIEWER);
  }, [egoRaw]);
  const levelOf = useCallback((id: string): AccessLevel => egoRaw.access[VIEWER]?.[id] ?? "none", [egoRaw]);

  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>("person");
  const [personId, setPersonId] = useState(initialPerson);
  const [trail, setTrail] = useState<Step[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, Reply>>({});
  const [requested, setRequested] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const seq = useRef(0);

  // The theme belongs to the whole page, so it lives on <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const nodesById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);
  const person = model.people.find((p) => p.id === personId) ?? model.people[0];
  const personLabel = personId === VIEWER ? "Me" : person.name;
  const nameOf = useCallback((id: string) => (id === VIEWER ? "Me" : (model.people.find((p) => p.id === id)?.name ?? id)), [model.people]);
  const ageOf = useCallback((id: string) => model.people.find((p) => p.id === id)?.age ?? 40, [model.people]);
  const canActFor = useCallback((id: string) => ["self", "joint", "proxy"].includes(levelOf(id)), [levelOf]);

  const here = trail[trail.length - 1];
  const sceneBase = useMemo(() => {
    if (!here) return personScene(ego, personId);
    if (here.kind === "group") return groupScene(ego, personId, here.id);
    if (here.kind === "category") return categoryScene(ego, personId, here.group, here.id);
    return assetScene(ego, here.id, personId);
  }, [ego, here, personId]);
  // In the family tree, say where the viewer's access stops.
  const scene = useMemo(
    () => (sceneBase.tree ? { ...sceneBase, tree: sceneBase.tree.map((r) => ({ ...r, nodes: r.nodes.map((n) => ({ ...n, caption: ACCESS_WORD[levelOf(n.id.replace("person:", ""))] })) })) } : sceneBase),
    [sceneBase, levelOf],
  );
  // Groups and categories are not assets: the scene describes them.
  const lookup = useCallback((id: string): Asset | undefined => scene.details[id] ?? ego.assets[id], [scene, ego]);
  const shown = ((selectedId && lookup(selectedId)) || lookup(scene.center.id)) as Asset;

  const navigate = useCallback((nav: Nav) => {
    setView("person");
    if (nav.person) setPersonId(nav.person);
    setTrail(nav.steps);
    setSelectedId(null);
  }, []);
  const switchPerson = useCallback((id: string) => navigate({ steps: [], person: id }), [navigate]);
  const open = useCallback(
    (id: string) => {
      if (id.startsWith("person:")) return switchPerson(id.slice(7));
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
    if (view !== "person") return;
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
  }, [view, back, overview, open, shown, scene.center.id]);

  const toggleProposal = useCallback((id: string) => setProposal((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), []);
  const addCovers = useCallback((covers: string[]) => setProposal((cur) => [...new Set([...cur, ...covers])]), []);
  const respond = useCallback((gapId: string, reply: Reply) => setResponses((r) => ({ ...r, [gapId]: reply })), []);
  const undoRespond = useCallback((gapId: string) => setResponses((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== gapId))), []);
  const proposalNodes = proposal.map((id) => nodesById.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
  const monthly = proposalNodes.reduce((s, n) => s + n.product.monthly, 0);

  const state = shown.kind === "policy" || shown.kind === "product" || shown.kind === "property" ? (shown.personState[personId] ?? (shown.kind === "product" ? "neutral" : shown.state)) : shown.state;
  const connections = shown.related.filter((r) => lookup(r.id) && (shown.kind !== "person" || r.id.startsWith("person:")));
  const relatedIds = connections.map((r) => r.id);
  // What would close a gap: the gap itself, or a catalogue product this person is missing.
  const viaAsset = shown.kind === "product" ? ego.assets[shown.via?.[personId] ?? ""] : undefined;
  const propertyGap = shown.kind === "property" ? shown.related.map((r) => ego.assets[r.id]).find((a) => a?.kind === "gap" && a.personIds.includes(personId)) : undefined;
  const gap = shown.kind === "gap" ? shown : viaAsset?.kind === "gap" ? viaAsset : propertyGap;
  const canOpen = shown.id !== scene.center.id && shown.kind !== "person";
  const canSwitch = shown.kind === "person" && shown.id !== `person:${personId}`;

  // The switcher is about the person being looked at: their spouse, children, parents, and so on.
  const menuGroups = useMemo(() => {
    const LABEL: [string, string][] = [["spouse", "Spouse"], ["child", "Children"], ["parent", "Parents"], ["sibling", "Siblings"], ["grandparent", "Grandparents"], ["grandchild", "Grandchildren"]];
    const rel = ego.family[personId] ?? [];
    const groups = LABEL.map(([key, label]) => ({ label, ids: rel.filter((r) => r.relation === key).map((r) => r.id) })).filter((g) => g.ids.length > 0);
    const listed = new Set([personId, ...groups.flatMap((g) => g.ids)]);
    const others = model.people.filter((p) => !listed.has(p.id)).map((p) => p.id);
    return others.length > 0 ? [...groups, { label: "Others in the family", ids: others }] : groups;
  }, [ego, model.people, personId]);

  // Alerts are messages, not a place on the map: a bell in the bar, and a short list in the panel.
  // What you may not see, and what you have said you do not need, never shows up here.
  const alerts = useMemo(() => alertsFor(ego, personId, levelOf, responses), [ego, personId, responses, levelOf]);
  const alertCount = alerts.mine.length + alerts.others.length;
  const hasOthers = model.people.some((p) => p.id !== VIEWER && levelOf(p.id) !== "none");

  const openAlert = useCallback(
    (a: Asset, e?: React.MouseEvent<HTMLButtonElement>) => {
      e?.currentTarget.closest("details")?.removeAttribute("open");
      const category = KBC.products.find((p) => p.id === a.kbcId)?.category;
      navigate({ person: a.personIds[0], steps: category ? [{ kind: "category", group: "insurance", id: category }, { kind: "asset", id: a.id }] : [{ kind: "asset", id: a.id }] });
    },
    [navigate],
  );

  // What the panel shows as "worth a look": a category's own, or everything for the person.
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

  // --- the chat. Sam only speaks when you do; answers can move the map, and you can undo that.
  const id = () => `m${++seq.current}`;
  const navLabel = (nav: Nav) => {
    const pid = nav.person ?? personId;
    return [nameOf(pid), ...nav.steps.map((s) => stepLabel(ego, s, pid))].join(" › ");
  };
  const goWithNote = (nav: Nav): Msg => {
    const from: Nav = { steps: trail, person: personId };
    navigate(nav);
    return { id: id(), role: "system", text: `Took you to ${navLabel(nav)}.`, nav: { to: nav, from } };
  };
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const ans = answer(t, { ego, model, viewer: VIEWER, personId, shown, mine: alerts.mine, others: alerts.others });
    const out: Msg[] = [{ id: id(), role: "user", text: t }];
    if (ans.navigate) out.push(goWithNote(ans.navigate));
    if (ans.respond) respond(ans.respond.gapId, ans.respond.reply);
    out.push({ id: id(), role: "assistant", text: ans.text, actions: ans.actions, offerGapId: ans.offerGapId });
    setMsgs((m) => [...m, ...out]);
  };
  const runAction = (a: Action) => {
    if (a.kind === "go") {
      const note = goWithNote(a.nav);
      setMsgs((m) => [...m, note]);
    } else if (a.kind === "add") addCovers(a.covers);
    else if (a.kind === "call") {
      setMsgs((m) => [...m, { id: id(), role: "assistant", text: `Done: I\u2019ve asked your advisor to call you (this is a demo, so nothing is sent). You can carry on here meanwhile.` }]);
    } else if (a.kind === "respond") respond(a.gapId, a.reply);
  };
  const undoNav = (msgId: string) => {
    const m = msgs.find((x) => x.id === msgId);
    if (!m?.nav) return;
    navigate(m.nav.from);
    setMsgs((all) => all.map((x) => (x.id === msgId && x.nav ? { ...x, nav: { ...x.nav, undone: true } } : x)));
  };
  const worried = alerts.others[0] ? nameOf(alerts.others[0].personIds[0]) : undefined;
  const chips = suggestions(shown, personId === VIEWER, person.name, worried);
  const viewerName = model.people.find((p) => p.id === VIEWER)?.name ?? "there";

  // The poster map shows only the people the viewer may see.
  const posterModel = useMemo<InsuranceModel>(() => {
    const visible = (id: string) => levelOf(id) !== "none";
    return { ...model, people: model.people.filter((p) => visible(p.id)), nodes: model.nodes.map((n) => ({ ...n, cells: n.cells.filter((c) => visible(c.personId)) })) };
  }, [model, levelOf]);

  return (
    <div className="cw">
      <header className="cw-bar">
        <Link href="/" className="cw-mark" aria-label="Product explorer home">
          KBC<span> · Insurance</span>
        </Link>
        <span className="cw-sep" aria-hidden="true" />
        <details className="cw-menu">
          <summary>
            <PixelIcon id={ego.assets[`person:${person.id}`]?.glyph ?? "adult"} size={16} /> {personLabel}
            <span aria-hidden="true"> ▾</span>
          </summary>
          <ul>
            <li className="cw-menu-group">
              <span>Looking at</span>
              <button type="button" aria-current="true" onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
                <PixelIcon id={ego.assets[`person:${person.id}`]?.glyph ?? "adult"} size={16} /> {personLabel}
              </button>
            </li>
            {menuGroups.map((g) => (
              <li key={g.label} className="cw-menu-group">
                <span>{g.label}</span>
                {g.ids.map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    onClick={(e) => {
                      switchPerson(pid);
                      e.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <PixelIcon id={ego.assets[`person:${pid}`]?.glyph ?? "adult"} size={16} /> {nameOf(pid)}
                    {ACCESS_WORD[levelOf(pid)] ? <small className="cw-access"> · {ACCESS_WORD[levelOf(pid)].toLowerCase()}</small> : null}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </details>
        {hasOthers ? (
          <div className="cw-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "person"} onClick={() => setView("person")}>Person</button>
            <button type="button" aria-pressed={view === "family"} onClick={() => setView("family")}>Family map</button>
          </div>
        ) : null}
        <div className="cw-right">
          <details className="cw-menu cw-alerts">
            <summary aria-label={`${alerts.mine.length} things to look at, ${alerts.others.length} for family`}>
              <PixelIcon id="alert" size={16} />
              {alerts.mine.length > 0 ? <span className="cw-badge">{alerts.mine.length}</span> : null}
            </summary>
            <div>
              {alertCount === 0 ? <p>Nothing to look at right now.</p> : null}
              {[{ title: `For ${personLabel === "Me" ? "me" : person.name}`, items: alerts.mine }, { title: "Elsewhere in the family", items: alerts.others }]
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
                                {a.personIds[0] !== personId ? `${nameOf(a.personIds[0])} · ` : ""}
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
          <details className="cw-menu cw-proposal">
            <summary className={proposalNodes.length > 0 ? "cw-cta" : ""}>{proposalNodes.length > 0 ? `€${monthly}/mo · ${proposalNodes.length}` : "Shortlist"}</summary>
            <div>
              {proposalNodes.length === 0 ? (
                <p>Add a product from a missing cover to start an offer.</p>
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
                  <p><strong>From €{monthly} / month</strong> · estimates</p>
                </>
              )}
            </div>
          </details>
          <details className="cw-menu cw-settings">
            <summary aria-label="Settings">⚙</summary>
            <div>
              <p className="cw-set-label">Look</p>
              <div className="cw-seg" role="group" aria-label="Theme">
                {(["kbc", "dark", "plain"] as Theme[]).map((t) => (
                  <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{THEME_LABEL[t]}</button>
                ))}
              </div>
              <p className="cw-set-note">Demo: all names, prices and cover are mock data, not KBC offers. Prices are estimates.</p>
            </div>
          </details>
        </div>
      </header>

      {view === "person" ? (
        <>
          <div className="cw-crumbs">
            <button type="button" className="cw-back" onClick={back} disabled={trail.length === 0} aria-label="Back">←</button>
            <nav aria-label="Where you are">
              <span className="cw-root">Insurance</span>
              <span aria-hidden="true"> / </span>
              <button type="button" onClick={overview} aria-current={trail.length === 0 ? "page" : undefined} disabled={trail.length === 0}>{personLabel}</button>
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
            <aside className="cw-panel" aria-label={`About ${shown.label}`}>
              <Panel
                asset={shown}
                state={state}
                title={shown.label}
                isMe={personId === VIEWER}
                personName={person.name}
                level={levelOf(personId)}
                age={ageOf(personId)}
                stories={stories}
                inPlace={inPlace}
                gap={gap}
                viaPolicy={shown.kind === "product" ? ego.assets[shown.via?.[personId] ?? ""] : undefined}
                personId={personId}
                lookup={lookup}
                onJump={setSelectedId}
                canOpen={canOpen}
                canSwitch={canSwitch}
                onOpen={() => open(shown.id)}
                onOpenStory={(a) => openAlert(a)}
                proposal={proposal}
                onToggleProposal={toggleProposal}
                responses={responses}
                onRespond={respond}
                onUndoRespond={undoRespond}
                requested={requested.includes(personId)}
                onRequestAccess={() => setRequested((r) => [...r, personId])}
              />
              <ChatPanel
                msgs={msgs}
                chips={chips}
                opener={opener(personId === VIEWER, person.name, viewerName)}
                onSend={send}
                onAction={runAction}
                onUndo={undoNav}
                renderOffer={(gapId) => {
                  const g = ego.assets[gapId];
                  if (!g) return null;
                  const who = g.personIds[0];
                  return <OfferCard gap={g} age={ageOf(who)} name={nameOf(who)} canAct={canActFor(who)} proposal={proposal} response={responses[g.id]} onAdd={toggleProposal} onRespond={respond} onUndo={undoRespond} />;
                }}
              />
            </aside>
          </div>
        </>
      ) : (
        <div className="cw-body cw-body-wide">
          <section className="cw-canvas" aria-label="Family cover map">
            <PosterMap model={posterModel} scope="all" proposal={proposal} onToggleProposal={toggleProposal} focusRequest={null} />
          </section>
        </div>
      )}
    </div>
  );
}
