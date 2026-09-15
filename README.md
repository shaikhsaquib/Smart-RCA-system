# Smart RCA System

Two related but independent tools for Supplier-module production support:

1. **`backend/` + `dashboard/`** — the Supplier Module Query Categorization
   Assistant: read-only Jira ingestion + LLM-based categorization + reporting
   dashboard. Implements the BRD/FSD "Supplier Module Query Categorization
   Assistant (Jira-Integrated)". Answers *"what kinds of tickets are coming in?"*
2. **`rca-assistant/`** — an agentic RCA triage pipeline that automates the
   manual diagnostic sequence an engineer follows on a single ticket (Build
   Portal → MongoDB → Camunda → New Relic → codebase search), producing a
   structured root-cause report. Answers *"why did this specific ticket happen,
   and who should fix it?"* See `rca-assistant/README.md` for details.

## Categorization Assistant architecture

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
| Storage | MongoDB Atlas free tier (M0), Atlas Vector Search for the Jira KB | Free |
| Embeddings (Jira KB) | Voyage AI (default) or OpenAI, behind a swappable interface | Pay-as-you-go, small volume |
| Dashboard | Angular + Chart.js (`dashboard/`) | Free |
| Scheduling | GitHub Actions scheduled workflow | Free (public repo / included minutes) |
| Hosting | Render.com free web service, or your organization's Azure free tier | Free |

## Repository layout

```
backend/         Express API, Jira ingestion, Claude categorization, aggregation, CLI scripts
dashboard/       Angular dashboard (charts + ticket table + CSV export)
rca-assistant/   Agentic RCA triage pipeline (orchestrator + 5 diagnostic stage agents) - see its own README
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

### Testing Jira connectivity before setting up MongoDB

If you only have `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` set and want to
confirm they (and your JQL) work before touching Mongo, use the no-Mongo test
path — nothing is written anywhere, it just fetches and prints/returns tickets:

```bash
npm run test:jira                          # uses JIRA_DEFAULT_JQL from .env
npm run test:jira -- "project = PLS ORDER BY updated DESC"

# or via the API (works even with MONGODB_URI unset):
curl -X POST http://localhost:3000/api/tickets/jira-test -H "Content-Type: application/json" -d '{}'
```

Everything else under `/api/tickets/*` (`/sync`, `/categorize`, `GET /`) does
need MongoDB, since that's where results get stored — see section 6 below.

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

## 6. Optional infra — MongoDB, New Relic, Camunda

None of these are required for the server to start. Leave any of them unset and
the app boots normally, logs one clear warning per unconfigured service, and
disables only the features that need it:

- **MongoDB unset/unreachable** → `/health` still responds; `/api/tickets/*`
  and `/api/reports/*` return `503 { error, feature: "disabled" }` instead of
  crashing; the `sync-tickets`/`categorize-tickets`/`validate-accuracy`/
  `sync:jira-kb` CLI scripts print a one-line instruction and exit(1) instead
  of a raw stack trace.
- **New Relic (`NEW_RELIC_LICENSE_KEY`) unset** → boots with a warning, no APM.
  If you do set it, also run `npm install newrelic` once (see
  `src/config/newrelic.ts` for why it isn't a default dependency).
- **Camunda (`CAMUNDA_BASE_URL`) unset** → boots with a warning;
  `isCamundaEnabled()` reports `false` everywhere.

Check `isMongoConnected()` (`src/config/db.ts`) / `isCamundaEnabled()`
(`src/config/camunda.ts`) before writing any new route or script that touches
one of these services.

## 7. Jira Knowledge-Base sync (RAG context for RCA)

Builds a searchable knowledge base from past Jira tickets, for use as retrieval
context in Claude-powered RCA answers. Fetches issues matching a configurable
field/value + assignee list, normalizes and chunks them, embeds each chunk, and
upserts into MongoDB Atlas Vector Search.

Requires `MONGODB_URI` (see above) plus the `JIRA_*`/`JIRA_KB_*` and embedding
vars in `.env.example`. Nothing is hardcoded — project key, match field, match
value, and assignee names are all env-configured, so this is reusable for
other ticket sets later.

**On GEP's Jira specifically:** "Supplier Profile" is not a real `component` or
label on any ticket — confirmed live against `smartbygep.atlassian.net` — it's
a value of a custom field called **Actionable-Team** (`customfield_15279`,
`cf[15279]` in JQL), and it's only meaningful inside the **`PLS`** project
("Project-LEO-Supplier"); the same field holds unrelated team names on tickets
in shared projects like `INC`. `.env.example` is set to those confirmed
values (`JIRA_KB_PROJECT_KEY=PLS`, `JIRA_KB_MATCH_FIELD=cf[15279]`,
`JIRA_KB_COMPONENT=Supplier Profile`). If you point this at a different Jira
project/instance that does use a real `component` field, leave
`JIRA_KB_MATCH_FIELD` unset — it defaults to `component`.

```bash
cd backend
cp .env.example .env   # fill in MONGODB_URI, JIRA_*, JIRA_KB_*, and an embedding provider key
npm run sync:jira-kb
```

Each run logs issue/chunk/upsert counts, e.g.:

```
[jiraSync] JQL: project = "SUPPORT" AND assignee in ("...", "...") AND component = "Supplier Profile" ORDER BY updated DESC
[jiraSync] Issues fetched: 47
[jiraSync] Chunks to embed: 112
[jiraSync] Documents embedded: 112
[jiraSync] Upserted: 112
```

It's idempotent — re-running upserts by `(ticketKey, chunkIndex)` rather than
duplicating rows — and safe to re-run on a cron once you're happy with it.

**One manual setup step:** Atlas Vector Search indexes are usually managed
outside application code. The sync calls `ensureVectorIndex()` as a best-effort
attempt to create one automatically, but your Atlas tier/permissions may
require doing this by hand once, in Atlas UI → your cluster → Search →
Create Search Index → JSON Editor, on the `jira_kb_chunks` collection
(or whatever `JIRA_KB_COLLECTION` is set to):

```json
{
  "name": "jira_kb_vector_index",
  "type": "vectorSearch",
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine" }
  ]
}
```

Use `numDimensions: 1536` if `EMBEDDING_PROVIDER=openai` (text-embedding-3-small).

**Querying the knowledge base** — `searchKnowledgeBase(query, topK)` in
`src/services/knowledgeBase.ts` embeds the query, runs `$vectorSearch`, and
returns the top matches ready to drop into a Claude API call as context:

```ts
import { searchKnowledgeBase } from './services/knowledgeBase';

const matches = await searchKnowledgeBase('supplier bank details sync failure', 5);
// [{ ticketKey, summary, status, assignee, text, score }, ...]
// Pass `matches` into your Claude prompt as retrieved context for an RCA answer.
```

## 8. Data sensitivity

Per the BRD/FSD non-functional requirements: any ticket content used in
public-facing/portfolio material must be anonymized or replaced with
synthetic examples. Keep real Supplier-module ticket data and its
categorization results internal only.
