# Family cover map: a KBC Insurance dashboard prototype

**One picture of everything a family is (and is not) insured for, that you walk through instead of read.**

Insurance is the part of banking people understand least and look at least. Policies sit in PDFs, nobody knows what pays when something goes wrong, and the gaps only show up on the worst day. This prototype turns a family's insurance into a **tech tree you can traverse**: you are in the middle, your insurances are around you, and the things you are *not* covered for light up as dangers, each with a plain story and the KBC product that would solve it.

> Hackathon prototype. All people, accounts, prices and cover details are **mock data**. It is not a KBC product or advice, and nothing is really bought.

The case study is the Peeters family (two households, six people) from the NovaBank mock data lake in `data/novabank_datalake/`.

## What makes it different

### 1. Uncluttered on purpose
People should barely have to read. Every choice pushes the other way from a normal insurance portal:

- A **picture first**: pixel-art icons on solid tiles (covered) or dashed outlines (not covered), with a one-line caption at most ("2 to look at").
- **Nothing shown that you already know.** The centre is just "Me"; nobody is told who their own spouse is.
- **Details are folded away** until you ask. The right panel shows a short list, not a data sheet.
- **One product shown once**, even if it belongs in two categories (loan insurance sits with the house when you have a mortgage).
- **Only what applies to you.** A student does not get a home-owner tree, a renter does not see loan insurance, and only the four KBC categories surround you. Accounts and loans are not insurance, so they are not on the map.

### 2. Traversing the tech tree
Drag to pan, scroll to zoom, click to select, double-click (or **Open**) to go one level deeper. The breadcrumb ("Insurance / Me / Home / Zeedijk 120") and the back arrow take you out again, and the camera eases between levels.

```
Me
├─ Home            ├─ Your homes (Leuvenselaan 112 ✓, Zeedijk 120 ✗)
│                  ├─ Loan cover · Contents · Outdoors & liability
├─ Mobility        ├─ Car · Help on the road · Two wheels
├─ Person & family ├─ Family · Health & life · Loans & safety · Through work
├─ Travel          └─ The trip · Abroad
└─ Family tree     (parents above, spouse beside, children below)
```

The categories and their products are the team's KBC grouping (4 categories, 37 products) in `data/kbc_insurance_catalogue.csv`. Each asset opens into its own small graph: who it covers, what it goes with, what you could add.

### 3. Personal, story-driven problems and the KBC product that solves them
Dangers are told as short personal stories, built from the data, not as generic risk talk:

| Who | The story | The KBC product |
| --- | --- | --- |
| Koen & Els | "Apartment in Blankenberge not covered": a second home with no policy | KBC Home Insurance – second home |
| Lotte | "Going abroad soon": Erasmus in Lisbon, not covered abroad | KBC Travel Insurance |
| Jozef | "Exposed to scams and fraud": a phishing call in June | KBC CyberSecure Insurance |
| Jozef | "No cover for hospital stays": a hospital bill paid out of pocket | KBC Hospitalisation Insurance |
| Arne | "Needs their own home cover": saving for a first place (66%) | KBC Home Insurance – owner |

Each danger shows **what could happen** ("a fire starts in the kitchen: nothing pays today"), then the offer, as a choice you can turn down (**see the cover, get covered, not needed, covered elsewhere**). Prices are labelled estimates, and where a price cannot honestly be known (hospital cover at 82) it says so and points to an advisor.

For anything you *do* have, a policy shows **when it pays and when it does not** as everyday situations ("you skid on ice and hit a lamppost: the omnium pays; the gearbox breaks: not paid"), plus its documents as PDFs that open in a new tab.

### 4. Very visual
Every asset has a hand-built pixel-art icon (generated from vector drawings, three tones, 24×24 grid). Status is carried by shape as well as colour: solid tile = covered, dashed = not covered, dotted = needed soon, plus number and "!" badges on the tiles where dangers sit. Dark, KBC and plain themes are in the settings menu.

### 5. Alerts for what is not covered
A bell in the top bar lists what needs a look, most pressing first, with what is urgent elsewhere in the family (Koen looks after his parents). Every danger has an **Ask** button. Getting covered removes the alert, turns the tile solid and lands you on the new policy with "Danger avoided" (and an Undo).

### 6. Talk to each insurance, separately
Inspect an insurance and you talk **to that insurance**, in its own KBC-branded chat with its own history: "KBC Car Insurance" says "I pay when you back into a parked car, I don't when the gearbox breaks". A cover you do not have speaks for itself ("I'm not in place for you, nothing is decided"). A question that is another insurance's job is handed over ("That's not me, Hospitalisation looks after that"). With nothing selected you can still ask and the right insurance answers. Every voice is labelled **AI voice**, it never reassures when it does not know, and "Talk to a person" is always one click away.

### 7. Access-aware
What Koen sees follows what he may see of each person, worked out from account ownership and mandates: his parents are **proxy**, Lotte is **view-only**, Els is joint, and **Arne shares nothing**, so Arne's gaps, plans and alerts are simply not there. One place decides this (`lib/insurance/access.ts`).

## The four screen captures

1. **Overview, traversing the tree:** `/insurance` → Home → Your homes → Zeedijk 120 → the policy.
2. **Dangers on assets:** tile badges, then Zeedijk 120 with "What could happen".
3. **Danger overview + ask the agent:** the "Dangers to look at" list, **Ask** on a danger, or "Talk to an insurance".
4. **Danger avoided, asset insured:** **Get covered → Confirm**. The danger goes, the asset is insured, the bell drops.

## This approach is not insurance-specific
Anything a bank offers that has a person, things they own or owe, risks, and products that answer those risks fits the same pattern: *you in the middle, categories around you, walk down to the asset, see the danger as a story, act in one step*. Due to the time limit we built **this one case study** (insurance). Savings and investing, loans and mortgages, pensions or payments would reuse the map, panel and chat as they are: what changes is the catalogue (`data/*.csv`), the rules that decide what is a danger (`lib/insurance/model.ts`), and the icons.

## Run it

Needs Node 20+.

```bash
npm install
npm run dev
```

Open <http://localhost:3000/insurance>. (`/` is the starter's plain product explorer.) Next.js 15, React 19, TypeScript. No UI library: the map is hand-written SVG.

| Command | What it does |
| --- | --- |
| `npm run build` | Production build (also type-checks) |
| `npm run build:catalogue` | Rebuilds `data/kbc-insurance-catalogue.json` from `data/kbc_insurance_catalogue.csv` |
| `npm run build:pixel-art` | Rebuilds `app/insurance/pixel-art.json` from the vector drawings in `scripts/build-pixel-art.mjs` |
| `npm run build:documents` | Writes the mock PDFs to `public/documents/` |
| `GET /api/assist?q=…&person=P03&shown=pol:INS02` | Runs the same assistant the page uses, for testing (and the place a real LLM would plug in) |

Add `?person=P03` to open as someone else's view, and `?theme=kbc` or `?theme=plain` for the other looks.

## Where things are

```
app/insurance/       the page: map (EgoMap), panel (Panel), chat (Chat), scenes, assistant, pixel art
lib/insurance/       model (rules → dangers), ego (assets and relations), access, insure, alerts
data/                kbc_insurance_catalogue.csv, scenarios.csv, properties.csv, the NovaBank data lake
scripts/             generators for the catalogue, pixel art and mock PDFs
public/documents/    mock policy and bank PDFs
```

Sources you can edit without touching code: `kbc_insurance_catalogue.csv` (products and categories), `scenarios.csv` ("when it pays / when it does not"), `properties.csv` (homes by address; the Blankenberge apartment is added demo data), `insurance-catalogue.json` (the wording of each danger and its price).

## What is unfinished

**The big one: integration with the rest of KBC.** Today the graph is built from a static mock data lake. The next step is to feed it from the real services and reflect them in the graph:

- **Transactions.** Premiums paid, a garage bill, a hospital payment or a holiday booking should create and remove dangers by themselves, and appear as evidence on the asset. Today these are hand-picked from the mock data.
- **Other KBC services** (accounts, cards, loans, savings goals, pensions) as further branches of the same tree, with their own dangers and products, not only insurance.
- **Opt-in data sharing.** Who shares what with whom (a proxy for a parent, a student sharing with parents) should be something the customer switches on and off, and the tree should grow and shrink with it. The access rules are in place, derived from the mock account-access table, but there is no consent flow.
- **Real policy data**, conditions and prices from the insurers, instead of sample text and estimates.

**Also not done**

- **The assistant is rule-based**, not an LLM. It is honest about what it does not know and hands over, but it only understands the situations we wrote for. The seam for a real model is `answer()` in `app/insurance/assistant.ts` (see `/api/assist`).
- **Covers outside the team's list.** Nothing for self-employed people (professional liability, a work van, tools) or for care-dependency; the assistant says so and routes to an advisor.
- **Cover through work** is only "check what your employer offers": we know an employer exists, not what it gives.
- **No real purchase.** "Get covered" is a demo; state lives in the browser and resets on reload. There is no sign-in.
- **Languages.** English only; Dutch and French are needed.
- **A list or table view** for people who want totals and dates at a glance. Premiums and renewals are only available by asking.
- **Mobile layout** and keyboard navigation of the map need work; the map is pointer-first.
- **The "Family map" view** (a poster-style overview of the whole family) is an earlier design and less polished than the person view.
- **No automated tests** beyond type-checking and the production build.

## Notes on the data
All names, IBANs, amounts and policies are fictional (`data/novabank_datalake/README.md` describes the data lake and the scenarios planted in it). The KBC names are used to show how it would look in a KBC setting; the product text, prices and scenarios are invented for the demo.
