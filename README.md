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
cp .env.example .env                 # then set DATABASE_URL (see below)
npm run db:migrate:deploy            # apply the schema to your Postgres DB
npm run db:seed                      # (optional) seed four example fit checks
npm run dev
```

**Database options for local dev** (the schema provider is PostgreSQL):

- **Postgres (recommended, matches prod):** set `DATABASE_URL` to a Postgres URL — a free
  [Neon](https://neon.tech)/[Supabase](https://supabase.com) dev database, or local Postgres. Then
  `npm run db:migrate:deploy` (or `npm run db:push`).
- **SQLite (zero-setup):** change `provider = "postgresql"` to `"sqlite"` in `prisma/schema.prisma`,
  set `DATABASE_URL="file:./dev.db"`, and run `npm run db:push`. Use this only for local MVP work —
  production must be Postgres.

> The Prisma CLI loads `DATABASE_URL` from `.env`; Next.js also reads `.env.local`.

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
| `GET /api/config`                          | Active AI providers + storage backend (no secrets).                  |
| `GET /api/cleanup`                          | Deletes uploads/previews older than `STORAGE_TTL_MINUTES` (cron).    |
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

Production uses **PostgreSQL** (the schema provider) and **Vercel Blob** for file storage. The Vercel
build runs `prisma generate && prisma migrate deploy && next build` (see `vercel.json`) — so the
Prisma Client is generated and the committed migration in `prisma/migrations/` is applied to your
database **without any destructive flags**. File storage auto-selects Vercel Blob when
`BLOB_READ_WRITE_TOKEN` is present (`lib/fileStorage.ts`), else local disk.

### Deploy to Vercel (recommended)

1. **Create a Postgres database** — e.g. Vercel Postgres, [Neon](https://neon.tech), or
   [Supabase](https://supabase.com). Copy its connection string (use the **direct / non-pooling**
   URL so migrations run cleanly).
2. **Import the repo** at [vercel.com/new](https://vercel.com/new) → `Hemang-ai/Furniture-fit`
   (Vercel auto-detects Next.js and uses `vercel.json`).
3. **Add environment variables** — project **Settings → Environment Variables**. Add `DATABASE_URL`
   (and the keys below) and **select both _Production_ and _Preview_** (and _Development_ if you use
   `vercel env pull`):

   | Name | Example / value |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require` |
   | `VISION_PROVIDER` / `IMAGE_GENERATION_PROVIDER` | `mock` \| `openai` \| `gemini` |
   | `OPENAI_API_KEY` and/or `GEMINI_API_KEY` | (only if not using `mock`) |
   | `BLOB_READ_WRITE_TOKEN` | auto-added when you do **Storage → Create → Blob** |

4. **Add a Blob store** (optional but recommended so uploads/previews persist): project **Storage →
   Create → Blob** — Vercel injects `BLOB_READ_WRITE_TOKEN` automatically.
5. **Redeploy** (Deployments → ⋯ → Redeploy, or push a commit). The build generates the client and
   applies migrations to your Postgres database.

One-click import: `https://vercel.com/new/clone?repository-url=https://github.com/Hemang-ai/Furniture-fit`

> If you change the schema later, create a migration locally with `npm run db:migrate` and commit it;
> the next deploy applies it via `prisma migrate deploy`. For ad-hoc syncing use `npm run db:push`.

Other Node hosts (Render, Railway, Fly.io) work too — set a Postgres `DATABASE_URL`, run
`npm run db:migrate:deploy`, and configure a blob/S3 store.

### Ephemeral storage (auto-delete photos)

Uploaded room photos and generated previews are meant to be **temporary**. `GET /api/cleanup`
deletes files older than `STORAGE_TTL_MINUTES` (default 60) from the active backend (**Supabase
Storage** or **Vercel Blob**) — so it can run as often as you like (e.g. every minute) without
disturbing an in-progress fit check; it only reaps files past the TTL.

- **Vercel Cron** (`vercel.json`) calls it daily as a backstop. **The Hobby plan only allows
  once-per-day cron**, so for true minute-by-minute cleanup use an **external cron** (e.g.
  [cron-job.org](https://cron-job.org), free) hitting
  `https://<your-app>.vercel.app/api/cleanup` every minute.
- Protect it: set `CRON_SECRET` and have the caller send `Authorization: Bearer <CRON_SECRET>`
  (Vercel Cron adds this automatically). Set `STORAGE_TTL_MINUTES` to control how long files live.
- Trade-off: once a photo is reaped, older results pages won't show the image (the verdict,
  dimensions, and clearance data remain — those live in Postgres, not in the photo).

---

## MVP limitations

- Fit verdicts are **estimates** from the dimensions you provide, not measurements derived from the
  image. The polygon you draw is stored but not used to infer real-world size.
- Clearance rules are **typical assumptions**, not product-specific — always confirm the manual.
- The URL parser is best-effort and does **not** bypass anti-bot protection; many retailers will
  block it, in which case enter details manually.
- The default image preview is a **mock** (your original photo with a placeholder label) unless an
  OpenAI/Gemini provider + key is configured.
- The database is **PostgreSQL** (schema provider); production uses Postgres + Vercel Blob, and the
  build applies migrations with `prisma migrate deploy`. SQLite remains a documented zero-setup local
  option (flip the provider + `npm run db:push`).

---

## Future upgrades

- **Apple RoomPlan** for true room capture on iOS
- **WebXR / `<model-viewer>`** AR placement in-browser
- **GLB / USDZ** product assets for realistic 3D previews
- **SAM 2** segmentation to auto-detect openings
- **Depth estimation** for scale calibration from a single image
- **Retailer catalog APIs** for reliable product specs
- **Checkout integration** to go from "it fits" to purchase
