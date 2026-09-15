import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService, TicketFilters } from './services/report.service';
import { SummaryReport, Ticket } from './models/report.model';
import { exportTicketsToCsv } from './services/csv-export';
import { CategoryChartComponent } from './components/category-chart/category-chart.component';
import { TrendChartComponent } from './components/trend-chart/trend-chart.component';
import { TicketTableComponent } from './components/ticket-table/ticket-table.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CategoryChartComponent, TrendChartComponent, TicketTableComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'Supplier Ticket Categorization Dashboard';

  summary: SummaryReport | null = null;
  tickets: Ticket[] = [];
  loading = false;
  error: string | null = null;
  syncing = false;
  categorizing = false;

  dateFrom = '';
  dateTo = '';

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  get categories(): string[] {
    return this.summary?.byCategory.map((c) => c.category) ?? [];
  }

  loadDashboard(): void {
    this.loading = true;
    this.error = null;

    this.reportService.getSummary(this.dateFrom || undefined, this.dateTo || undefined).subscribe({
      next: (summary) => {
        this.summary = summary;
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load summary report. Is the backend running?';
        this.loading = false;
      },
    });

    this.loadTickets({});
  }

  loadTickets(filters: TicketFilters): void {
    const rangedFilters = { ...filters, from: this.dateFrom || undefined, to: this.dateTo || undefined };
    this.reportService.getTickets(rangedFilters).subscribe({
      next: (tickets) => (this.tickets = tickets),
      error: () => (this.error = 'Could not load tickets.'),
    });
  }

  onExport(): void {
    exportTicketsToCsv(this.tickets);
  }

  onSync(): void {
    this.syncing = true;
    this.reportService.triggerSync().subscribe({
      next: () => {
        this.syncing = false;
        this.loadDashboard();
      },
      error: () => {
        this.syncing = false;
        this.error = 'Sync failed. Check Jira credentials on the backend.';
      },
    });
  }

  onCategorize(): void {
    this.categorizing = true;
    this.reportService.triggerCategorize().subscribe({
      next: () => {
        this.categorizing = false;
        this.loadDashboard();
      },
      error: () => {
        this.categorizing = false;
        this.error = 'Categorization failed. Check the Claude API key on the backend.';
      },
    });
  }
}
