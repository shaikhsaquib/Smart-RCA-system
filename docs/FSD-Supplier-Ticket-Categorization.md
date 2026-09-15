# Functional Specification Document (FSD)
## Project: Supplier Module Query Categorization Assistant (Jira-Integrated)

**Prepared by:** Mohd Saquib
**Document version:** 1.0
**Date:** September 15, 2026
**Reference:** BRD-Supplier-Ticket-Categorization v1.0

---

## 1. Introduction

This document translates the business requirements into functional and technical
specifications for a system that retrieves Jira tickets related to the Supplier module and
categorizes them by query type.

## 2. System Overview

The system has three pipelines:

1. **Ingestion Pipeline** — pulls tickets from Jira via JQL and normalizes them.
2. **Categorization Pipeline** — classifies each ticket into a query-type taxonomy using an
   LLM, with a confidence score.
3. **Aggregation & Reporting Pipeline** — rolls up categorized tickets into summary views
   (counts, trends, priority breakdown).

```
                    INGESTION PIPELINE
  [Jira API] → [JQL Query: Supplier scope] → [Ticket Fetcher] → [Normalizer] → [Ticket Store]

                    CATEGORIZATION PIPELINE
  [Ticket Store] → [Prompt Builder w/ Taxonomy] → [LLM Classifier] → [Category + Confidence]
        → [Low-confidence flag if below threshold] → [Categorized Ticket Store]

                    AGGREGATION & REPORTING PIPELINE
  [Categorized Ticket Store] → [Aggregation Queries] → [Dashboard/Report UI]
```

## 3. Architecture

| Layer | Technology | Notes |
|---|---|---|
| Jira integration | Jira REST API (JQL search) | Read-only; scoped via project/component/label filter for Supplier module |
| Backend/orchestration | Node.js + Express (TypeScript) | Handles sync, classification calls, aggregation |
| Classification | LLM (Claude API or Azure OpenAI) via prompt-based classification | Few-shot prompt with taxonomy definitions and examples |
| Storage | MongoDB (reuses existing skillset) | Stores raw + categorized ticket records |
| Dashboard | Angular, with a charting library (e.g., ngx-charts or Chart.js) | Category breakdown, trend line, priority split |
| Scheduling (optional) | Simple cron job or manual trigger script | Batch sync — not real-time |
| Secrets management | Environment variables / Azure Key Vault | Jira API token, LLM API key |

## 4. Functional Modules

### 4.1 Jira Ticket Retrieval Module
**Purpose:** Pull tickets scoped to the Supplier module from Jira.

**Functional flow:**
1. Accept a configurable JQL filter (e.g., `project = SUPPORT AND component = "Supplier" AND
   created >= -90d`) — exact filter to be confirmed against actual Jira project/component/label
   setup for the Supplier module.
2. Query Jira via the search API, paginating through results.
3. Normalize each ticket into a standard internal record: key, summary, description, status,
   priority, reporter, created date, resolved date, existing labels.
4. Store normalized tickets in the Ticket Store, skipping/updating tickets already ingested
   (upsert by ticket key).

**Inputs:** JQL filter, date range
**Outputs:** Normalized ticket records in the Ticket Store
**Trigger:** Manual script run or scheduled batch job (`npm run sync-tickets`)

### 4.2 Taxonomy Definition Module
**Purpose:** Define the fixed set of query-type categories used for classification.

**Initial proposed taxonomy** (to be refined against real ticket samples):

| Category | Definition |
|---|---|
| Data Correction | Request to fix/update incorrect supplier data (e.g., wrong bank details, address, tax ID) |
| Access/Permission | User cannot access supplier record/module, or permission-related error |
| Integration Failure | Sync/integration issue between Supplier module and another system (e.g., SAP, ERP) |
| Configuration Query | Question about how a setting/workflow is configured, not a defect |
| Documentation/How-To | User asking how to perform an action, not reporting an error |
| Bug | Genuine defect/unexpected system behavior not covered by the above |
| Duplicate/Spam | Duplicate of an existing ticket or not a genuine issue |
| Uncategorized | Fallback when confidence is below threshold or ticket doesn't clearly fit |

Each category includes a short definition and 2-3 example ticket summaries used as few-shot
examples in the classification prompt.

### 4.3 Categorization Module
**Purpose:** Classify each ticket into one taxonomy category with a confidence score.

**Functional flow:**
1. Retrieve un-categorized (or re-categorization-requested) tickets from the Ticket Store.
2. Build a prompt containing: taxonomy definitions + few-shot examples + the ticket's summary
   and description.
3. Instruct the LLM to return: `category`, `confidence` (high/medium/low), and a one-line
   `rationale`.
4. If confidence is "low", flag the ticket as `Uncategorized` and mark for manual review.
5. Store the categorization result linked to the ticket record.

**Inputs:** Ticket summary + description, taxonomy definitions
**Outputs:** Category label, confidence level, rationale string

### 4.4 Aggregation Module
**Purpose:** Roll up categorized tickets into summary statistics.

**Functional flow:**
1. Compute ticket counts grouped by category.
2. Compute category counts grouped by time bucket (e.g., weekly/monthly) for trend view.
3. Compute category breakdown by priority (e.g., how many "Integration Failure" tickets are
   High priority vs Low).
4. Compute percentage of tickets flagged as low-confidence/Uncategorized (data quality
   signal on the taxonomy/classifier itself).

**Inputs:** Categorized ticket records
**Outputs:** Aggregated summary objects consumed by the dashboard

### 4.5 Dashboard/Report Module
**Purpose:** Present categorization results in a reviewable format.

**Functional flow:**
1. Display a bar/pie chart of ticket counts per category.
2. Display a trend line of category volume over the selected date range.
3. Display a table of tickets with filters (category, priority, confidence level) for drill-down.
4. Allow export of the underlying categorized data (e.g., CSV) for offline review.

## 5. API Specification

### 5.1 `POST /api/tickets/sync`
**Description:** Triggers a batch sync of Supplier-module tickets from Jira.

**Request body:**
```json
{
  "jql": "project = SUPPORT AND component = \"Supplier\" AND created >= -90d",
  "maxResults": 100
}
```

**Response body:**
```json
{
  "ticketsFetched": 142,
  "ticketsNew": 37,
  "ticketsUpdated": 5
}
```

### 5.2 `POST /api/tickets/categorize`
**Description:** Runs categorization on all un-categorized tickets in the store.

**Response body:**
```json
{
  "categorized": 37,
  "flaggedLowConfidence": 4
}
```

### 5.3 `GET /api/reports/summary`
**Description:** Returns aggregated category breakdown for a date range.

**Query params:** `from`, `to`

**Response body:**
```json
{
  "totalTickets": 142,
  "byCategory": [
    { "category": "Data Correction", "count": 54 },
    { "category": "Integration Failure", "count": 31 },
    { "category": "Access/Permission", "count": 18 }
  ],
  "trend": [
    { "week": "2026-08-24", "category": "Data Correction", "count": 12 }
  ],
  "lowConfidenceRate": 0.09
}
```

### 5.4 `GET /api/tickets`
**Description:** Returns individual categorized ticket records with filters.

**Query params:** `category`, `priority`, `confidence`, `from`, `to`

## 6. Data Model

### 6.1 Ticket record
| Field | Type | Description |
|---|---|---|
| key | string | Jira issue key (e.g., SUPPORT-1234) |
| summary | string | Ticket title |
| description | string | Full ticket description |
| status | string | Jira status |
| priority | string | Jira priority |
| reporter | string | Reporter name/email |
| createdAt | datetime | Ticket creation date |
| resolvedAt | datetime, nullable | Resolution date if closed |
| category | string | Assigned taxonomy category |
| confidence | string (high/medium/low) | Classifier confidence |
| rationale | string | One-line explanation from classifier |
| categorizedAt | datetime | When classification was performed |

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Sync + categorization batch of ~150 tickets completes within a few minutes |
| Security | Jira API token and LLM API key stored as environment variables/Key Vault secrets, never in source code |
| Data sensitivity | Any ticket content used in public-facing/portfolio material must be anonymized or replaced with synthetic examples |
| Accuracy | ≥85% categorization accuracy validated against a manually labeled sample |
| Maintainability | Taxonomy definitions kept in a separate config file, not hardcoded in classification logic, so categories can be adjusted without code changes |
| Auditability | Every categorization stores its rationale, so results can be spot-checked and disputed/corrected |

## 8. Error Handling & Fallback Behavior

| Condition | System behavior |
|---|---|
| Jira API rate limit hit during sync | Backoff and retry with delay; resume pagination from last successful page |
| Jira API authentication failure | Return clear error; do not proceed with partial/stale data silently |
| LLM classification returns invalid/unexpected category | Fallback to `Uncategorized`, flag for manual review |
| Ticket has empty/near-empty description | Fallback to `Uncategorized` rather than guessing from summary alone |
| Duplicate ticket key on sync | Upsert (update existing record) rather than creating duplicates |

## 9. Testing Approach

| Test type | Description |
|---|---|
| Manual labeling validation | Manually categorize a sample of ≥30 real tickets; compare against classifier output to measure accuracy |
| Taxonomy boundary test | Test tickets deliberately near category boundaries (e.g., "Bug" vs "Integration Failure") to check consistency |
| Low-confidence handling test | Verify ambiguous/sparse tickets are correctly flagged rather than force-categorized |
| Aggregation correctness test | Verify category counts and trend numbers match a manually computed baseline on a known test dataset |
| API contract test | Verify all endpoints match this spec's request/response shapes |

## 10. Deployment Plan

1. Configure Jira API access (API token, base URL, confirm correct JQL scope for Supplier
   module with the team/manager if this becomes an internal pitch).
2. Build and test the ingestion module against a small ticket sample first.
3. Define and refine the taxonomy against real ticket examples before finalizing prompts.
4. Deploy backend (Node/Express) and dashboard (Angular) — reuse the same Azure deployment
   pattern as the RAG demo project for consistency.
5. Run an initial batch sync + categorization, validate accuracy against manual labels.
6. Iterate on taxonomy/prompt if accuracy is below target before treating results as reliable.

## 11. Traceability to Business Requirements

| Business Requirement | Addressed by |
|---|---|
| BR-01 (Jira retrieval, configurable JQL) | Jira Ticket Retrieval Module, `/api/tickets/sync` |
| BR-02 (categorization into taxonomy) | Categorization Module, `/api/tickets/categorize` |
| BR-03 (confidence + low-confidence flagging) | Categorization Module, ticket data model |
| BR-04 (aggregated view) | Aggregation Module, `/api/reports/summary` |
| BR-05 (taxonomy extendable without code change) | Taxonomy Definition Module (external config) |
| BR-06 (read-only Jira access) | Architecture (search-only API usage, no write-back) |
| BR-07 (date-range filtering) | Jira Ticket Retrieval Module (JQL date filter) |
| BR-08 (dashboard/report presentation) | Dashboard/Report Module |
