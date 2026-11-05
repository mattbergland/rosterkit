# rosterkit

Build an editable creator dataset from one public roster, creator site, link-in-bio or social-profile URL. Export CSV or JSON. No database or login is required; results live in the browser until navigation/reload.

## Run

```sh
npm install
# Supply the server-side variables listed in .env.example via your environment.
npm run dev
```

`OPENAI_MODEL` defaults to `gpt-5`. `MAX_CREATORS` defaults to 60 and cannot exceed 60. `BROWSERBASE_PROJECT_ID` is optional: the server discovers the first project accessible to the API key. If none exists, screenshot capture falls back to plain fetch. Never commit credentials. The API keys are only used in server modules.

## Pipeline

`POST /api/build` accepts `{ "url": "https://…" }`, returns newline-delimited JSON events (`progress`, `screenshot`, `result`, `error`), and has a 300-second deployment limit.

1. Browserbase + Playwright render, scroll, collect text/anchors/images/HTML and capture a full-page JPEG. Tall screenshots are split into at most three viewport-height tiles (top, middle, bottom). Plain fetch is the fallback.
2. Jev (`jev-latest`) batches page-type Choice and creator-presence Noul questions. Images use the required experimental-image opt-in header. If screenshots are unavailable, the log explicitly reports text-only triage.
3. OpenAI structured outputs extract creators. URL and literal-field grounding remove values not observed in the source evidence. Instructions in source pages are untrusted data.
4. Pure URL parsing normalizes platform accounts and rejects share links and service utility pages. Agency header/footer accounts are excluded.
5. Up to five workers fetch creator details/link-in-bio pages, using Browserbase only for empty/JS-rendered pages. Page and request sizes are bounded. Run-budget exhaustion retains rows and marks them for review.
6. One Jev request per creator batches account Choices (including `none`), a fixed-taxonomy niche Choice, bio-professionalism Score (0–4), and optional avatar visual Choice. Candidate URLs come only from observed links. JSON includes distributions and avatar assessments. Code uses a 0.75 confidence threshold, not model arithmetic.
7. The browser supports per-cell editing, filtering, sticky table headers, CSV formula-injection escaping, and CSV/JSON downloads. Follower counts remain blank.

## Verification

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
node scripts/e2e.mjs http://localhost:3000 https://linktr.ee/hankgreen hankgreen
node scripts/e2e.mjs http://localhost:3000 https://www.outloudtalent.com agency
node scripts/visual.mjs http://localhost:3000
```

E2E evidence is saved to `~/rosterkit-evidence/`. The visual script uses Playwright, performs a real agency build, verifies editing and downloads, and saves screenshots to `~/screens/`. Set `CHROME_PATH` when the installed Chromium executable differs from its default path.

## Limitations

Public sites may block automation, hide rosters behind login, or publish no social URLs/bios. Those fields remain empty, and errors are shown rather than invented. Low confidence must be reviewed; Jev image support is experimental. A bio score is not a background check and must not be treated as an assurance of brand safety. Screenshot tiles do not cover every pixel of extremely tall pages. There is no logged-in scraping, follower scraping, persistent dataset storage, or background-job queue.

Public network URLs are checked, redirect targets are revalidated, response sizes are capped, and local/private destinations are blocked. The in-memory single-active-build-per-IP guard is a convenience, not distributed rate limiting; apply Vercel Firewall rate limits or authentication before broad promotion to control paid API use.

## Deployment

Deploy to Vercel with the variables in `.env.example` configured as encrypted production/preview environment variables. GitHub `main` is connected for automatic deployments. `DESIGN.md` is the source design reference.
