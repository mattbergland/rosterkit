# rosterkit

Build an editable creator dataset from one public roster, creator site, link-in-bio or social-profile URL. Export CSV or JSON. No database or login is required; results live in the browser until navigation/reload.

## Run

```sh
npm install
# Supply the server-side variables listed in .env.example via your environment.
npm run dev
```

`OPENAI_MODEL` defaults to `gpt-5`. `MAX_CREATORS` defaults to 60 and cannot exceed 60. `BROWSERBASE_PROJECT_ID` is optional: the server discovers the first project accessible to the API key. Browserbase is optional; unavailable or unconfigured Browserbase falls back to self-hosted Chromium, then plain fetch. Never commit credentials. The API keys are only used in server modules.

## Pipeline

`POST /api/build` accepts `{ "url": "https://…" }`, returns newline-delimited JSON events (`progress`, `screenshot`, `result`, `error`), and has a 300-second deployment limit.

1. Rendering tries Browserbase, then self-hosted Chromium, then plain fetch. Both browsers share the same public-network checks, scroll, HTML/text/anchor/image collection and full-page JPEG capture. Tall screenshots are split into at most three viewport-height tiles (top, middle, bottom). Renderer selection and failures are logged server-side only. The Thread kits wait for their asynchronously loaded audience labels before capture.
2. Jev (`jev-latest`) batches page-type Choice and creator-presence Noul questions. Images use the required experimental-image opt-in header. If screenshots are unavailable, the log explicitly reports text-only triage.
3. OpenAI structured outputs extract creators. URL and literal-field grounding remove values not observed in the source evidence. Instructions in source pages are untrusted data.
4. Pure URL parsing normalizes platform accounts and rejects share links and service utility pages. Agency header/footer accounts are excluded.
5. Up to five workers fetch creator details/link-in-bio pages, requesting a browser only for empty/JS-rendered pages or known rendered kits. Static enrichment still uses cheap plain fetch first. Page and request sizes are bounded. Run-budget exhaustion retains rows and marks them for review.
6. One Jev request per creator batches account Choices (including `none`), a fixed-taxonomy niche Choice, bio-professionalism Score (0–4), and optional avatar visual Choice. Candidate URLs come only from observed links. JSON includes distributions and avatar assessments. Code uses a 0.75 confidence threshold, not model arithmetic.
7. Audience metrics are extracted from source cards and creator details first. The extraction model proposes literal counts and evidence; code validates creator/platform attribution and parses K/M/B counts. Missing YouTube, TikTok, Twitch, Instagram, X and Threads counts get a best-effort public HTML/JSON fallback: five concurrent requests, seven seconds per profile, at most 120 requests and 35 seconds total. Blocked, private, hidden and ambiguous counts stay blank. No login or private API is used.
8. July rosters, including iframe embeds, are parsed from public structured data without per-creator extraction calls. All structured rows are retained. Up to eight public July media kits add details, and one bounded Jev batch classifies tags (not July’s generic industry defaults). Implausible engagement percentages are blank and flagged. The adapter registry also recognizes conservative embedded `creators` arrays with explicit platform follower/subscriber fields.
9. Homepages and pages without creators trigger bounded same-origin roster discovery: likely paths, relevant links, sitemap/robots entries and embedded rosters. Homepage-like soft 404s are rejected. Adapter hits rank first; other candidate pages are checked for creator presence. Distinct rosters are merged and creators deduplicated. The interface shows discovered source pages and any time/extraction limit.
10. The Thread share links retain their token query string and are rendered before deterministic labeled-text parsing. The adapter reads followers, average post metrics, plausible engagement, audience demographics and the manager’s contact. The audience-details dialog keeps those optional metrics readable without adding every field to the main table. Public individual kits are supported; no roster-level route was found in the inspected page links or JavaScript.
11. The browser supports per-cell editing, filtering, sticky table headers, compact audience chips, CSV formula-injection escaping, and CSV/JSON downloads. Export counts are integers. Existing export columns retain their order; `youtube_followers` remains a compatibility alias of `youtube_subscribers` and is never double-counted. `total_reach` adds known platform audiences (not unique people); a creator’s stated total is retained only when channel counts are absent. `metrics_source` records `platform:site` or `platform:profile`. `metrics_as_of` uses the source’s printed date where available (the oldest if multiple platform dates differ), otherwise the UTC collection date. Engagement fields are source-provided percentages, not inferred. These public figures may be rounded or stale.

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

Public sites may block automation, hide rosters behind login, or publish no social URLs/bios/audience figures. Those fields remain empty, and errors are shown rather than invented. Expensive unstructured extraction/enrichment is limited to 60 creators per build (configurable downward); structured rosters are not subject to that cap. Discovery and enrichment have bounded coverage, not an exhaustive crawl. Low confidence must be reviewed; Jev image support is experimental. A bio score is not a background check and must not be treated as an assurance of brand safety. Screenshot tiles do not cover every pixel of extremely tall pages. There is no logged-in scraping, persistent dataset storage, or background-job queue.

Public network URLs are checked, redirect targets are revalidated, response sizes are capped, and local/private destinations are blocked. The in-memory single-active-build-per-IP guard is a convenience, not distributed rate limiting; apply Vercel Firewall rate limits or authentication before broad promotion to control paid API use.

## Deployment

Deploy to Vercel with the variables in `.env.example` configured as encrypted production/preview environment variables. GitHub `main` is connected for automatic deployments. `DESIGN.md` is the source design reference.

The API uses Next.js's default Node runtime (an explicit runtime export is incompatible with Cache Components). Playwright Core is pinned to 1.63.0 (Chromium 153), matching `@sparticuz/chromium` 153.0.0. Both packages are server externals; output tracing includes Playwright runtime assets and Chromium's compressed binaries. Chromium unpacks into ephemeral `/tmp`, not a remote download. Node 22.17+ or 24+ is required; the production project uses Node 26. Vercel's default 2048 MB function memory exceeds the browser package's recommended 1600 MB; no larger/paid memory override is required. Self-hosted captures are serialized within each instance and browsers are closed on success or error to bound memory. Vercel's 250 MB function-package limit includes the compressed binary assets (about 67 MB), not the runtime-unpacked browser. No browser is shared between requests.

Locally the renderer uses `CHROME_PATH`, Playwright's expected installed browser, or an existing Chromium under `~/.cache/ms-playwright` (or `PLAYWRIGHT_BROWSERS_PATH`). Run `npx playwright install chromium` if none is installed. Production never connects to a development CDP endpoint.
