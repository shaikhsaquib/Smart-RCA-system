import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket } from '../../models/report.model';
import { TicketFilters } from '../../services/report.service';

@Component({
  selector: 'app-ticket-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ticket-table.component.html',
  styleUrl: './ticket-table.component.css',
})
export class TicketTableComponent {
  @Input() tickets: Ticket[] = [];
  @Input() categories: string[] = [];
  @Output() filtersChange = new EventEmitter<TicketFilters>();
  @Output() exportRequested = new EventEmitter<void>();

  filters: TicketFilters = {};
  priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
  confidenceLevels = ['high', 'medium', 'low'];

  onFilterChange(): void {
    this.filtersChange.emit({ ...this.filters });
  }
}
