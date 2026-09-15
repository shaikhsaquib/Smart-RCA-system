import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SummaryReport, Ticket } from '../models/report.model';

export interface TicketFilters {
  category?: string;
  priority?: string;
  confidence?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSummary(from?: string, to?: string): Observable<SummaryReport> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<SummaryReport>(`${this.apiUrl}/reports/summary`, { params });
  }

  getTickets(filters: TicketFilters): Observable<Ticket[]> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });
    return this.http.get<Ticket[]>(`${this.apiUrl}/tickets`, { params });
  }

  triggerSync(jql?: string): Observable<{ ticketsFetched: number; ticketsNew: number; ticketsUpdated: number }> {
    return this.http.post<{ ticketsFetched: number; ticketsNew: number; ticketsUpdated: number }>(
      `${this.apiUrl}/tickets/sync`,
      jql ? { jql } : {}
    );
  }

  triggerCategorize(): Observable<{ categorized: number; flaggedLowConfidence: number }> {
    return this.http.post<{ categorized: number; flaggedLowConfidence: number }>(
      `${this.apiUrl}/tickets/categorize`,
      {}
    );
  }
}
