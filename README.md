# kusmijnclaudje-tectonic

Hackathon starter for an accessible explorer of **mock** KBC insurance and bank products.

This is an unofficial prototype. Names, prices, and cover details are invented for local development. They are not real KBC products or advice.

## Stack

- Next.js (App Router) + TypeScript
- Static mock data in `data/products.json`
- Accessible baseline: skip link, semantic headings, keyboard focus, reduced-motion respect

## Setup

1. Install [Node.js](https://nodejs.org/) (LTS).
2. If `git` is missing on macOS, install Command Line Tools: `xcode-select --install`.
3. From this folder:

```bash
git init
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project layout

```text
app/                 Pages and global styles
data/products.json   Mock catalogue (edit this first)
lib/                 Types and product helpers
```

Add a product by appending an object to `data/products.json` with `id`, `name`, `category`, copy, `highlights`, `whoItIsFor`, and `typicalPrice`. Categories: `insurance`, `banking`, `lending`, `investing`.

## Family cover map (`/insurance`)

A person-centred map of the mock NovaBank family: the four KBC insurance categories around the person, smaller satellites for accounts, borrowing and family, and a navbar bell for alerts.

- `data/kbc_insurance_catalogue.csv` is the KBC grouping (categories → products). Edit it, then run `npm run build:catalogue` to regenerate `data/kbc-insurance-catalogue.json`.
- Pixel-art icons are drawn as vectors in `scripts/build-pixel-art.mjs`; `npm run build:pixel-art` regenerates `app/insurance/pixel-art.json`.
- The family data lake lives in `data/novabank_datalake/` (see its README). All names, prices and cover details are mock.

### More scripts and endpoints for the insurance page

- `npm run build:documents` writes mock PDFs to `public/documents/` (policy conditions, key-information sheets, bank notices). They are clearly marked as mock.
- `data/properties.csv` lists the homes by address (the Blankenberge apartment is added demo data).
- `GET /api/assist?q=…&person=P03` runs the same assistant the page uses, for testing and as the place a real LLM would plug in.

### Talking to the insurance itself

The chat speaks as whatever is selected: your car insurance says "I pay when you back into a parked car, I don't when the gearbox breaks", a cover you do not have speaks for itself ("I'm not in place for you, nothing is decided"), and a question that is not its job is handed over to the right insurance. Everything is labelled "AI voice" so it is never mistaken for the insurer. The situations come from `data/scenarios.csv` (sample text; the real conditions decide).
