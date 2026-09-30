"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "./assistant";
import type { Msg } from "./chatTypes";
import { PixelIcon } from "./pixel";

/**
 * A chat with Sam, the virtual helper. Sam does not speak first: until you type or tap something the
 * frame only shows a friendly line and an easy way in. When an answer moves the map, a slim line says
 * where it went and lets you undo it.
 */
export function ChatPanel({
  msgs,
  chips,
  opener,
  onSend,
  onAction,
  onUndo,
  renderOffer,
}: {
  msgs: Msg[];
  chips: string[];
  opener: string;
  onSend: (text: string) => void;
  onAction: (a: Action) => void;
  onUndo: (id: string) => void;
  renderOffer: (gapId: string) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const list = useRef<HTMLDivElement>(null);
  // Scroll the conversation itself, never the page.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);
  const started = msgs.length > 0;

  return (
    <section className={`cw-chat${started ? " cw-chat-open" : ""}`} aria-label="Chat with Sam">
      <header className="cw-chat-head">
        <span className="cw-sam"><PixelIcon id="care" size={16} /></span>
        <strong>Sam</strong>
        <small>virtual helper</small>
        <button type="button" className="cw-person" onClick={() => onAction({ kind: "call", label: "Talk to a person" })}>Talk to a person</button>
      </header>

      {started ? (
        <div ref={list} className="cw-msgs" role="log" aria-live="polite" aria-relevant="additions">
          {msgs.map((m) =>
            m.role === "system" ? (
              <p key={m.id} className="cw-sys">
                {m.text}{" "}
                {m.nav ? m.nav.undone ? <em>undone</em> : <button type="button" onClick={() => onUndo(m.id)}>Undo</button> : null}
              </p>
            ) : (
              <div key={m.id} className={`cw-msg cw-msg-${m.role}`}>
                <p>{m.text}</p>
                {m.offerGapId ? renderOffer(m.offerGapId) : null}
                {m.actions && m.actions.length > 0 ? (
                  <div className="cw-actions">
                    {m.actions.map((a) =>
                      a.kind === "link" ? (
                        <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer">{a.label} ↗</a>
                      ) : (
                        <button key={a.label} type="button" onClick={() => onAction(a)}>{a.label}</button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="cw-opener">{opener}</p>
      )}

      {chips.length > 0 ? (
        <div className="cw-chips">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => onSend(c)}>{c}</button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          onSend(q);
          setQ("");
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tell me what’s on your mind…" aria-label="Message Sam" autoComplete="off" />
        <button type="submit" aria-label="Send">↑</button>
      </form>
    </section>
  );
}
