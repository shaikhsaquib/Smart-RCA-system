import { Ticket } from '../models/report.model';

const COLUMNS: (keyof Ticket)[] = [
  'key',
  'summary',
  'status',
  'priority',
  'category',
  'confidence',
  'rationale',
  'createdAt',
];

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTicketsToCsv(tickets: Ticket[], filename = 'categorized-tickets.csv'): void {
  const header = COLUMNS.join(',');
  const rows = tickets.map((t) => COLUMNS.map((col) => escapeCsvValue(t[col])).join(','));
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
