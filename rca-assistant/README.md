# RCA Triage Assistant (Agentic)

Automates the manual diagnostic sequence a production support engineer follows
for Supplier-module tickets: Build Portal config → MongoDB data → Camunda
workflow → New Relic APM → codebase search, in that strict order, stopping as
soon as a stage finds a confident root cause.

## Architecture

An **Orchestrator** runs five independent **stage agents** in order:

```
Ticket -> [1. Build Portal Config-Check] -> found? -> stop, "Configuration Issue" (TSO)
              |
              v (not found)
          [2. MongoDB Data-Check] -> found? -> stop, "Data Issue" (TSO)
              |
              v (not found)
          [3. Camunda Log-Check] -> found? -> stop, "Workflow/Camunda Issue" (Engineering)
              |
              v (not found)
          [4. New Relic Log-Check] -> found? -> stop, "Application Error (New Relic)" (Engineering)
              |
              v (not found)
          [5. Code-Debug (grep)] -> found? -> stop, "Code Defect" (Engineering)
              |
              v (not found)
          "Manual Investigation Required" (Needs Manual Triage)
```

Each stage is a plain, independently-callable, independently-testable async
function with the contract:

```ts
{ found: boolean, issue: string, evidence: string, confidence: 'high'|'medium'|'low' }
```

(plus execution metadata: `status`, `details` for the audit trail, and `mocked`).

## Mock mode - test the whole pipeline today, wire in credentials one at a time

**Every stage works with zero configuration.** If a stage's required env vars
aren't set, it runs a deterministic keyword-heuristic **mock** instead of a
real call, clearly marked `mocked: true` and prefixed `[MOCK]` in its output.
This is what lets you test the orchestrator's short-circuit control flow
end-to-end right now, before any real Mongo/Camunda/New Relic/Build Portal
credentials exist:

```bash
npm install
npm run rca:all-fixtures
```

This runs 6 fixture tickets (`src/fixtures/sample-tickets.ts`), each worded to
terminate at a different stage - one per root-cause category, plus one that
falls through everything to "Manual Investigation Required" - so you can see
every branch of the control flow in one run.

Run a single fixture or a real ticket:

```bash
npm run rca -- configIssue                 # named fixture
npm run rca -- path/to/real-ticket.json    # { ticketId, summary, description, supplierId?, reportedAt? }
```

Test one stage in isolation (useful once you start wiring in real credentials
one integration at a time, without needing the full orchestrator):

```bash
npm run stage:mongo -- dataIssue
npm run stage:camunda -- path/to/ticket.json
```

## Wiring in real credentials (do this one stage at a time)

Copy `.env.example` to `.env` and fill in only the stage you're integrating
next - every other stage keeps running in mock mode until you get to it.

| Stage | Env vars | What it does once configured |
|---|---|---|
| Build Portal | `BUILD_PORTAL_CONFIG_SNAPSHOT_PATH` | Reads a manually-exported config JSON snapshot and flags fields where `actualValue != expectedValue`. **No confirmed Build Portal API exists yet** - see the limitation comment at the top of `src/stages/buildPortalStage.ts` for how to swap in a real API call later. |
| MongoDB | `RCA_MONGODB_URI`, `RCA_MONGODB_DB_NAME`, `RCA_MONGODB_SUPPLIER_COLLECTION` | Read-only lookup of the supplier record; checks for missing record, null/malformed critical fields, duplicate `taxId`, and suspiciously recent updates. |
| Camunda | `CAMUNDA_BASE_URL`, `CAMUNDA_AUTH_USERNAME`, `CAMUNDA_AUTH_PASSWORD`, `CAMUNDA_PROCESS_DEFINITION_KEY` | Queries `/history/incident` and `/history/process-instance` (read-only) for incidents/stuck instances keyed by supplierId (falls back to ticketId). |
| New Relic | `NEW_RELIC_API_KEY`, `NEW_RELIC_ACCOUNT_ID`, `NEW_RELIC_APP_NAME` | Runs an NRQL query via NerdGraph for `TransactionError` counts/details in a ±1h window around the ticket's `reportedAt`. |
| Code-Debug | `CODE_DEBUG_ROOT_PATH` | Greps that codebase for keywords extracted from the ticket text and reports the file + nearest enclosing function as a suspect (never a guess without a concrete match). |

## Auditability & graceful failure

- Every stage's query/result is logged as a structured JSON line (`src/logging/auditLog.ts`) so a human can verify any RCA report after the fact.
- If a real data source is unreachable (timeout, auth failure, DNS error), that stage is recorded as `status: "skipped"` with a `skipReason`, and the orchestrator moves on to the next stage rather than crashing the run.
- The final `RCAReport` includes a full `stageResults` array (every stage's complete output, including skipped ones) in addition to the required output schema, for that same auditability purpose.

## Output schema

```ts
{
  ticketId: string,
  rootCauseCategory: "Configuration Issue" | "Data Issue" | "Workflow/Camunda Issue" |
                      "Application Error (New Relic)" | "Code Defect" | "Manual Investigation Required",
  rootCauseSummary: string,
  evidence: { stage: string, detail: string }[],
  recommendedOwner: "TSO" | "Engineering" | "Needs Manual Triage",
  stagesRun: string[],
  confidence: "high" | "medium" | "low"
}
```

`recommendedOwner` mapping (adjust in `src/orchestrator/orchestrator.ts` if your
org's ownership split differs - only "Configuration Issue → TSO" was specified
explicitly, the rest follow the same no-code-change-vs-code-change convention):
Configuration Issue → TSO, Data Issue → TSO, Workflow/Camunda Issue → Engineering,
Application Error → Engineering, Code Defect → Engineering.

## Testing

```bash
npm test
```

30 tests covering: every stage's mock-mode heuristics, the Build Portal
snapshot-comparison logic (including a missing-file graceful failure), a real
grep-based Code-Debug run against a temp fixture codebase, the
`runStageSafely` error-to-skip conversion, and the orchestrator's short-circuit
control flow (stops at the first `found`, treats `skipped` as inconclusive and
continues, escalates to Manual Investigation Required, and builds the evidence
trail) - all without needing any real Mongo/Camunda/New Relic/Build Portal
credentials.
