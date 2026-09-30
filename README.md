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
