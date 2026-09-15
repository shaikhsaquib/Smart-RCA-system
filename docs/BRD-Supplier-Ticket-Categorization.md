# Business Requirements Document (BRD)
## Project: Supplier Module Query Categorization Assistant (Jira-Integrated)

**Prepared by:** Mohd Saquib
**Document version:** 1.0
**Date:** September 15, 2026
**Related work:** Smart RCA Assistant proposal (Project ATLAS); Procurement Knowledge Assistant (RAG demo)

---

## 1. Purpose

This document defines the business rationale, scope, and requirements for a system that
connects to Jira, retrieves tickets raised against the Supplier module, and automatically
categorizes them by query/issue type. The output gives a clear, data-backed breakdown of
*what kinds of problems* are actually being raised against the Supplier module, instead of
relying on manual triage or memory.

## 2. Background

Production support tickets are currently reviewed and resolved individually. There is no
systematic view of:
- What proportion of Supplier-module tickets are data corrections vs. integration failures
  vs. access/permission issues vs. genuine bugs vs. "how do I" queries.
- Whether certain categories are trending up over time (signal for a recurring root cause
  worth fixing at the source rather than patching ticket-by-ticket).

This directly extends the earlier Smart RCA Assistant proposal (RAG over Jira tickets,
Project ATLAS-aligned) and manager feedback to diversify and better classify ticket types
(Bug/Setup/RCA, etc.), but scoped specifically to the Supplier module and focused on
categorization/analytics rather than answer-generation.

## 3. Business Objectives

| # | Objective | Success Measure |
|---|---|---|
| 1 | Automatically retrieve all Jira tickets relevant to the Supplier module | 100% of Supplier-module tickets in the configured JQL scope are ingested |
| 2 | Categorize each ticket into a clear, consistent query-type taxonomy | ≥85% categorization accuracy against a manually labeled sample |
| 3 | Surface volume/trend breakdown by category | Dashboard/report showing category counts and trend over a selectable time window |
| 4 | Support prioritization of proactive fixes (e.g., a spike in "data sync failure" tickets justifies a permanent fix over repeated manual correction) | At least one actionable insight identified from real categorized data |
| 5 | Produce a reusable, demonstrable artifact (portfolio + potential internal proposal) | Working demo + documentation suitable for both resume and internal pitch |

## 4. Scope

### 4.1 In Scope
- Connecting to Jira via API (read-only) to retrieve tickets scoped to the Supplier module
  (via project key, component, label, or filter — to be confirmed against actual Jira setup)
- Extracting ticket summary, description, status, priority, reporter, created/resolved dates
- Defining a query-type taxonomy (e.g., Data Correction, Access/Permission, Integration
  Failure, Configuration Query, Documentation/How-To, Bug, Duplicate/Spam)
- Automated categorization of each ticket using an LLM-based classifier against the taxonomy
- Aggregated reporting: counts per category, trend over time, breakdown by priority
- A simple dashboard/report view of the results
- A one-time or scheduled batch sync (not real-time/streaming)

### 4.2 Out of Scope
- Writing back to Jira (auto-tagging/labeling tickets) — read-only for this version unless
  explicitly extended later
- Automated ticket resolution or response generation (that is the separate RCA Assistant
  concern, not this project)
- Real-time/streaming ingestion — batch sync is sufficient
- Categorizing tickets outside the Supplier module
- Fine-tuning a custom classification model — an LLM with a well-defined prompt/taxonomy is
  sufficient for this scope

## 5. Stakeholders

| Stakeholder | Role |
|---|---|
| Mohd Saquib | Product owner, developer, tester |
| Salim (Manager) | Potential internal audience if pitched as a support-improvement idea |
| Prospective employers/interviewers | External audience for portfolio version |

## 6. Business Requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | The system shall connect to Jira and retrieve tickets scoped to the Supplier module using a configurable JQL filter | Must |
| BR-02 | The system shall categorize each retrieved ticket into a predefined query-type taxonomy | Must |
| BR-03 | The system shall report a confidence indicator for each categorization, and flag low-confidence results for manual review | Should |
| BR-04 | The system shall provide an aggregated view (counts by category, trend over time, breakdown by priority) | Must |
| BR-05 | The system shall allow the taxonomy to be updated/extended without requiring code changes to the classification logic | Should |
| BR-06 | The system shall not modify Jira data (read-only) in this version | Must |
| BR-07 | The system shall support filtering the sync by date range (e.g., last 90 days) to avoid pulling the entire ticket history unnecessarily | Should |
| BR-08 | The system shall present results in a simple, shareable dashboard/report format | Must |

## 7. Assumptions
- Jira access is available with sufficient permissions to run JQL searches against the
  relevant project(s)/component(s) representing the Supplier module.
- A representative sample of tickets can be manually labeled to validate categorization
  accuracy.
- Ticket volume for the Supplier module is small/medium enough that batch LLM classification
  is cost-viable (no need for bulk/streaming infrastructure).

## 8. Constraints
- Must use read-only Jira access; no write-back in this version.
- Should reuse the existing technology stack (Node.js/TypeScript, and LLM API access already
  used in the RAG demo project) to minimize new tooling overhead.
- Any confidential/production ticket content used for demo purposes must be reviewed for
  sensitivity before being shared externally (e.g., in a public portfolio).

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Ticket descriptions are inconsistent/unstructured, reducing classification accuracy | Misleading category breakdown | Validate against a manually labeled sample before trusting aggregated output; refine taxonomy and prompt iteratively |
| Taxonomy categories overlap or are ambiguous (e.g., "Bug" vs "Integration Failure") | Inconsistent categorization | Define taxonomy with clear, mutually exclusive definitions and examples up front; allow a "review needed" fallback category |
| Confidential ticket content restricts external/portfolio use | Cannot publicly showcase real data | Use anonymized/synthetic ticket examples for any public-facing demo; keep the real analysis internal only |
| Jira API rate limits during bulk sync | Slower/failed ingestion | Implement pagination and backoff; batch sync in chunks |

## 10. Success Criteria
- Successful read-only sync of Supplier-module tickets from Jira for a defined date range
- Categorization accuracy of ≥85% validated against a manually labeled sample of at least 30
  tickets
- A report/dashboard showing category distribution and trend, reviewed and confirmed to
  surface at least one genuinely useful insight
- Documentation (this BRD + FSD) suitable for reuse as an internal proposal pitch or resume
  artifact
