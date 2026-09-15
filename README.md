# Smart RCA System — Supplier Module Query Categorization Assistant

Read-only Jira ingestion + LLM-based categorization + reporting dashboard for
Supplier-module support tickets. Implements the BRD/FSD "Supplier Module Query
Categorization Assistant (Jira-Integrated)".

## Architecture

```
                    INGESTION PIPELINE
  [Jira API] -> [JQL Query: Supplier scope] -> [Ticket Fetcher] -> [Normalizer] -> [Ticket Store]

                    CATEGORIZATION PIPELINE
  [Ticket Store] -> [Prompt Builder w/ Taxonomy] -> [Claude Classifier] -> [Category + Confidence]
        -> [Low-confidence flag if below threshold] -> [Categorized Ticket Store]

                    AGGREGATION & REPORTING PIPELINE
  [Categorized Ticket Store] -> [Aggregation Queries] -> [Dashboard/Report UI]
```

| Layer | Technology | Cost |
|---|---|---|
| Jira integration | Jira REST API (JQL search), read-only | Your existing Jira license |
| Backend | Node.js + Express + TypeScript (`backend/`) | Free |
| Classification | Claude API (`@anthropic-ai/sdk`), tool-use for structured output | Free trial credits, then pay-as-you-go (Haiku is cheap) |
| Storage | MongoDB Atlas free tier (M0) | Free |
| Dashboard | Angular + Chart.js (`dashboard/`) | Free |
| Scheduling | GitHub Actions scheduled workflow | Free (public repo / included minutes) |
| Hosting | Render.com free web service, or your organization's Azure free tier | Free |

## Repository layout

```
backend/     Express API, Jira ingestion, Claude categorization, aggregation, CLI scripts
dashboard/   Angular dashboard (charts + ticket table + CSV export)
.github/workflows/sync-and-categorize.yml   Scheduled batch sync + categorize job
```

## 1. Prerequisites (all free)

1. **Jira API token** — https://id.atlassian.com/manage-profile/security/api-tokens
   Confirm the JQL scope for the Supplier module with your team (project key /
   component / label), e.g.:
   `project = SUPPORT AND component = "Supplier" AND created >= -90d`
2. **MongoDB Atlas free cluster (M0)** — https://www.mongodb.com/cloud/atlas/register
   Create a free M0 cluster, a database user, and allow network access from
   your IP (or `0.0.0.0/0` for a quick demo). Copy the connection string.
3. **Anthropic API key** — https://console.anthropic.com

## 2. Backend setup

```bash
cd backend
cp .env.example .env   # fill in MONGODB_URI, JIRA_*, ANTHROPIC_API_KEY
npm install
npm run dev             # starts the API on http://localhost:3000
```

Run a batch sync + categorization manually:

```bash
npm run sync-tickets
npm run categorize-tickets
```

Or via the API:

```bash
curl -X POST http://localhost:3000/api/tickets/sync
curl -X POST http://localhost:3000/api/tickets/categorize
curl http://localhost:3000/api/reports/summary
```

### Validating categorization accuracy (target: ≥85%)

Manually label a sample of ≥30 real tickets in a CSV (`key,expectedCategory`),
then run:

```bash
npm run validate-accuracy -- path/to/labels.csv
```

## 3. Dashboard setup

```bash
cd dashboard
npm install
npm start   # ng serve, http://localhost:4200, proxies to backend at :3000
```

Update `src/environments/environment.ts` if the backend runs somewhere other
than `http://localhost:3000`.

## 4. Editing the taxonomy (no code changes needed — BR-05)

Categories, definitions, and few-shot examples live in
`backend/src/config/taxonomy.json`. Add/edit/remove categories there; the
classifier prompt and validation logic pick up the change automatically.

## 5. Free-tier deployment

- **Scheduling:** `.github/workflows/sync-and-categorize.yml` runs the sync +
  categorize CLI scripts on a daily cron via GitHub Actions. Add
  `MONGODB_URI`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`,
  `JIRA_DEFAULT_JQL`, `ANTHROPIC_API_KEY` as repository secrets.
- **Backend hosting:** deploy `backend/` as a free Render.com web service
  (or your organization's Azure free tier, e.g. Azure App Service free plan),
  with the same environment variables as secrets/app settings.
- **Dashboard hosting:** `npm run build` in `dashboard/` produces static
  files (`dashboard/dist/dashboard`) deployable to any free static host
  (Render static site, Azure Static Web Apps free tier, GitHub Pages).

## 6. Data sensitivity

Per the BRD/FSD non-functional requirements: any ticket content used in
public-facing/portfolio material must be anonymized or replaced with
synthetic examples. Keep real Supplier-module ticket data and its
categorization results internal only.
