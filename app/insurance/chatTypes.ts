import type { Action } from "./assistant";
import type { Nav } from "./assistant";

/** One line in the conversation. The chat only speaks when the person engages: there are no greetings. */
export type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  actions?: Action[];
  /** A system line that moved the map: where it went, and where to go back to. */
  nav?: { to: Nav; from: Nav; undone?: boolean };
  /** An offer for a missing cover, shown as a card with "not needed" as an equal choice. */
  offerGapId?: string;
  /** Who said it: the insurance that was selected at the time. */
  from?: { label: string; glyph: string };
};
