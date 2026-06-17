# FitVision AI

Estimated fit checks for your space. Upload a room/kitchen photo, add a product (by URL or manual
entry), mark the placement area, get an **estimated** fit verdict with confidence and clearance
analysis, and generate an AI-style preview.

> **Core principle:** FitVision AI never claims an exact measurement from a single image. Every
> verdict is an **estimate** with a confidence level, clearance margins, and warnings — it is **not
> an installer guarantee**. Measurements you enter manually drive the math.

---

## Why FitVision AI

Buying a fridge, range, washer, TV, or large furniture online is a gamble: *"Will it actually fit
my space — with the clearances it needs?"* Returns of large appliances are expensive and painful.
FitVision AI helps shoppers (and the retailers who sell to them) answer that question **before**
checkout:

- **Reduce costly returns & non-fits** by checking dimensions + required clearances up front.
- **Build buyer confidence** with a clear verdict, confidence level, and an AI visualization of the
  product in the actual room.
- **Stay honest about uncertainty** — every result is labeled an estimate, with the assumptions and
  warnings shown, so it never over-promises.

**Who it's for:** online appliance/furniture shoppers, retail product teams, and anyone validating
whether a big item fits a specific spot.

## Features (what to use & the value it brings)

| Feature | What it does | Value |
| --- | --- | --- |
| **Room photo upload** | Upload a photo of the space and mark the opening on a canvas (points stored normalized). | Grounds the check in your real space. |
| **Add product (URL or manual)** | Paste a product URL to auto-extract specs, or enter them by hand. | Fast input; works even when scraping is blocked. |
| **Fit engine** | Computes per-dimension clearance margins and a verdict: `FITS` / `TIGHT_FIT` / `DOES_NOT_FIT` / `NEED_MORE_DATA`, each with HIGH/MEDIUM/LOW confidence. | The trustworthy core — transparent math, not a black box. |
| **Category clearance rules** | Built-in side/top/rear clearance assumptions per category (fridge, range, dishwasher, washer/dryer, TV, furniture), editable. | Catches the "fits the hole but not the clearances" mistake. |
| **AI dimension estimation** | When you don't know dimensions, AI estimates product size and the available opening from the photo (OpenAI/Gemini), or a heuristic fallback. | Removes the #1 blocker — not having a tape measure — while capping confidence at LOW. |
| **AI room preview** | Generates an image of the product placed in your room (OpenAI or Gemini), conditioned on your actual photo. | Lets shoppers *see* the result before buying. |
| **Honesty guardrails** | Disclaimers near every verdict, AI-estimated dimensions clearly flagged, "not an installer guarantee" language throughout. | Trust and liability safety. |

## Using the app

1. **Start a fit check** → upload a room photo.
2. **Add the product** — paste a URL (or enter manually), or click **Estimate product size with AI**.
3. **Mark the opening** on the photo and enter the available width/height/depth — or click
   **Estimate available space with AI** if you don't have measurements.
4. **Review the verdict**: verdict + confidence, plain-English summary, an AI room preview, the
   product-vs-available dimensions, the clearance table (green = OK, red = exceeds), and warnings.
5. **Generate / regenerate the preview** to see the product composited into your room.

---

## Tech stack

- **Next.js (App Router)** + **TypeScript** + **React 19**
- **Tailwind CSS v4** (`@tailwindcss/postcss`, single `@import "tailwindcss";`)
- Hand-rolled **shadcn/ui-style** components (`class-variance-authority` + `clsx` + `tailwind-merge`)
- **React Hook Form** + **Zod**
- **Prisma v5** with **SQLite** locally (structured to migrate to Postgres/Supabase)
- File uploads to `/public/uploads` behind a `lib/fileStorage.ts` abstraction (swappable for Vercel
  Blob / S3)
- **Jest** + **ts-jest** for unit tests

---

## Setup

```bash
npm install
cp .env.example .env        # the Prisma CLI reads .env; Next.js reads it too
npx prisma migrate dev --name init   # creates prisma/dev.db and runs the seed
npm run db:seed             # (optional) re-run the seed any time
npm run dev
```

> The Prisma CLI loads `DATABASE_URL` from `.env`, so use `.env` for it. You can still
> put machine-only secret overrides in `.env.local` (Next.js and the seed read both).

Then open http://localhost:3000. The seed prints `/fit-check/<id>` URLs for four example results
(FITS, TIGHT_FIT, FITS, DOES_NOT_FIT).

### Build & test

```bash
npm run build   # production build
npm test        # Jest unit tests (fit engine)
```

---

## Environment variables

| Variable                    | Default          | Description                                                                 |
| --------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`              | `file:./dev.db`  | Prisma datasource. SQLite path resolves relative to `prisma/` (→ `prisma/dev.db`). Swap for a Postgres/Supabase URL in production. |
| `IMAGE_GENERATION_PROVIDER` | `mock`           | AI preview provider: `mock`, `openai` (Images edit), or `gemini` (image model). |
| `VISION_PROVIDER`           | `mock`           | Dimension-estimation provider: `mock` (heuristic), `openai` (GPT vision), or `gemini` (Gemini vision). |
| `OPENAI_API_KEY`            | _(empty)_        | Used when either provider is set to `openai`. Falls back to mock if unset.  |
| `GEMINI_API_KEY`            | _(empty)_        | Used when either provider is set to `gemini`. Falls back to mock if unset.  |
| `OPENAI_IMAGE_MODEL`        | `gpt-image-1`    | Optional override for the OpenAI image model.                                |
| `OPENAI_VISION_MODEL`       | `gpt-4o-mini`    | Optional override for the OpenAI vision model.                               |
| `GEMINI_IMAGE_MODEL`        | `gemini-2.5-flash-image` | Optional override for the Gemini image model.                |
| `GEMINI_VISION_MODEL`       | `gemini-2.0-flash` | Optional override for the Gemini vision model.                             |

Never commit real secrets. Use `.env` / `.env.local` (both gitignored).

### AI features

**Dimension estimation (`lib/aiVision.ts`).** In the wizard, "Estimate product size with AI" and
"Estimate available space with AI" call `POST /api/estimate-dimensions`. The configured
`VISION_PROVIDER` looks at the room photo (OpenAI/Gemini) — or uses category-typical sizes (mock) —
and returns estimated W/H/D plus reasoning. AI-estimated dimensions are clearly labeled and **cap
the verdict confidence at LOW**. Manual measurements always override them. The "I don't know" path
can either return `NEED_MORE_DATA` or use AI to produce a best-guess, low-confidence verdict.

**Preview generation (`lib/imageGeneration.ts`).** `POST /api/fit-check/[id]/generate-preview` runs
the configured `IMAGE_GENERATION_PROVIDER`. OpenAI uses the Images **edit** endpoint and Gemini uses
an image-capable model, both conditioned on your actual room photo (and product image when
provided). Generated images are **AI visualizations, not measurement guarantees**.

`GET /api/config` reports which providers are active (no secrets) so the UI can show the current mode.

---

## Routes

| Route                                      | Description                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `/`                                        | Landing page: how-it-works, features, disclaimer.                     |
| `/fit-check/new`                           | 3-step wizard: upload photo → add product → mark area + measurements. |
| `/fit-check/[id]`                          | Results: verdict, confidence, summary, clearance analysis, warnings, preview. |
| `POST /api/upload`                         | Multipart file → saves to `/public/uploads` → `{ path }`.            |
| `POST /api/parse-product`                  | `{ url }` → best-effort extracted product specs (for confirmation).  |
| `POST /api/estimate-dimensions`            | AI estimate of product / available dimensions from the photo.        |
| `GET /api/config`                          | Active AI providers (no secrets).                                    |
| `POST /api/fit-check/create`               | `{ roomImagePath, product, measurement }` → computes + persists → `{ id, fitReport }`. |
| `GET /api/fit-check/[id]`                   | Full fit check with parsed report.                                   |
| `POST /api/fit-check/[id]/generate-preview`| Runs the image provider, persists `generatedPreviewPath` → `{ path }`. |

---

## How the fit engine works (`lib/fitEngine.ts`)

For each dimension it computes the space left after the product, subtracts the **assumed** clearance
requirement for the category, and classifies the slack:

- Missing product **or** available dimensions (or the "I don't know" path) → `NEED_MORE_DATA` / LOW
- Any dimension's slack `< 0` → `DOES_NOT_FIT` / HIGH (with dimension-specific warnings)
- Otherwise any slack `< 1"` → `TIGHT_FIT` / MEDIUM
- Otherwise → `FITS` / HIGH

Default clearance assumptions (editable via `updateClearanceRules`, and per-call overrides):

| Category                     | Each side | Top   | Rear  |
| ---------------------------- | --------- | ----- | ----- |
| refrigerator                 | 0.5"      | 1"    | 2"    |
| range                        | 0.25"     | 0"    | 1"    |
| dishwasher                   | 0.25"     | 0.25" | 1"    |
| washer / dryer               | 1"        | 0"    | 4"    |
| tv / furniture / electronics | 0"        | 0"    | 1"    |

Every report also appends: _"Door swing and delivery path not verified.", "Floor levelness not
checked.", "Electrical, water, and gas connections not checked."_

---

## Deployment

> **Note on Streamlit:** Streamlit Community Cloud (`streamlit.app`) only hosts **Python Streamlit**
> apps. FitVision AI is a **Next.js / Node** application (React Server Components, API routes,
> Prisma), so it **cannot** run on streamlit.app. Use a Node/Next.js host instead — **Vercel** is
> recommended (built by the Next.js team).

### Deploy to Vercel (recommended)

1. Push this repo to GitHub (already done if you're reading this there).
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** this repository. Vercel auto-detects
   Next.js.
3. Add environment variables in the Vercel project settings (`DATABASE_URL`,
   `IMAGE_GENERATION_PROVIDER`, `VISION_PROVIDER`, `OPENAI_API_KEY` / `GEMINI_API_KEY`, and any model
   overrides). **Do not** use a SQLite `file:` URL in production (see below).
4. Deploy.

### Production changes required (serverless)

The local MVP uses SQLite and writes uploads to `/public/uploads`. Serverless platforms have an
**ephemeral, read-only-ish filesystem**, so for production:

- **Database:** switch Prisma to **Postgres** (e.g. Supabase / Neon). In `prisma/schema.prisma` set
  `provider = "postgresql"` and point `DATABASE_URL` at the managed DB, then run `prisma migrate deploy`.
- **File storage:** swap `lib/fileStorage.ts` from local disk to **Vercel Blob** or **S3** (the
  `FileStorage` interface is the single seam — implement `save` / `saveFromUrl` and return the public
  URL). Generated AI previews and uploads then persist.
- Keep secrets in the host's env-var settings (never commit them).

Other Node hosts (Render, Railway, Fly.io, Netlify) work too; the same DB + storage changes apply.

---

## MVP limitations

- Fit verdicts are **estimates** from the dimensions you provide, not measurements derived from the
  image. The polygon you draw is stored but not used to infer real-world size.
- Clearance rules are **typical assumptions**, not product-specific — always confirm the manual.
- The URL parser is best-effort and does **not** bypass anti-bot protection; many retailers will
  block it, in which case enter details manually.
- The default image preview is a **mock** (your original photo with a placeholder label).
- Local file storage and SQLite are for development; move to managed storage + Postgres for
  production.

---

## Future upgrades

- **Apple RoomPlan** for true room capture on iOS
- **WebXR / `<model-viewer>`** AR placement in-browser
- **GLB / USDZ** product assets for realistic 3D previews
- **SAM 2** segmentation to auto-detect openings
- **Depth estimation** for scale calibration from a single image
- **Retailer catalog APIs** for reliable product specs
- **Checkout integration** to go from "it fits" to purchase
