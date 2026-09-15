import { RCATicketInput } from '../types/rca';

/**
 * Fake tickets for testing the orchestrator's short-circuit control flow end-to-end
 * before any real credentials are wired in. Each is worded so that, in mock mode
 * (no stage env vars configured), it terminates at a different stage - see each
 * stage file's MOCK_*_PATTERNS for the keyword heuristics being triggered.
 */
export const SAMPLE_TICKETS: Record<string, RCATicketInput> = {
  configIssue: {
    ticketId: 'SUPPORT-5001',
    summary: "Payment Terms dropdown missing options on Supplier Onboarding screen",
    description:
      "The 'Payment Terms' field on the Supplier Onboarding screen is not showing the dropdown options that were configured in the Build Portal last week.",
    supplierId: 'SUP-1001',
    reportedAt: '2026-09-10T09:00:00Z',
  },

  dataIssue: {
    ticketId: 'SUPPORT-5002',
    summary: "Supplier bank details showing as null",
    description:
      "Supplier ABC's bank details show as null in the portal after the last update. Payment run failed as a result.",
    supplierId: 'SUP-1002',
    reportedAt: '2026-09-11T14:30:00Z',
  },

  workflowIssue: {
    ticketId: 'SUPPORT-5003',
    summary: "Supplier onboarding stuck mid-workflow",
    description:
      "Supplier onboarding workflow appears stuck - the process instance never completed after submission three days ago.",
    supplierId: 'SUP-1003',
    reportedAt: '2026-09-12T11:15:00Z',
  },

  applicationError: {
    ticketId: 'SUPPORT-5004',
    summary: "Intermittent failures submitting new supplier records",
    description:
      "Users are seeing intermittent 500 errors and timeouts when submitting new supplier records; looks like an exception in the API.",
    supplierId: 'SUP-1004',
    reportedAt: '2026-09-13T16:45:00Z',
  },

  codeDefect: {
    ticketId: 'SUPPORT-5005',
    summary: "Approval button behaves oddly on supplier records",
    description:
      "The supplier approval button occasionally shows unexpected behavior and users briefly see a stack trace before the page recovers.",
    supplierId: 'SUP-1005',
    reportedAt: '2026-09-14T10:00:00Z',
  },

  manualInvestigation: {
    ticketId: 'SUPPORT-5006',
    summary: "Supplier dashboard looks different after UI refresh",
    description:
      "User is asking why the Supplier dashboard looks different after the recent UI refresh, and wants confirmation that this is expected.",
    supplierId: 'SUP-1006',
    reportedAt: '2026-09-15T08:00:00Z',
  },
};
