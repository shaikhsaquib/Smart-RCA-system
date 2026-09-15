import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { CategoryCount } from '../../models/report.model';

Chart.register(...registerables);

const PALETTE = [
  '#4C6EF5', '#F76707', '#12B886', '#E64980', '#7048E8', '#FAB005', '#15AABF', '#868E96',
];

@Component({
  selector: 'app-category-chart',
  standalone: true,
  template: `<div class="chart-card">
    <h3>Tickets by Category</h3>
    <canvas #canvas></canvas>
  </div>`,
  styleUrl: './category-chart.component.css',
})
export class CategoryChartComponent implements OnChanges {
  @Input() data: CategoryCount[] = [];
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;

  ngOnChanges(): void {
    if (!this.canvasRef) return;
    this.render();
  }

  ngAfterViewInit(): void {
    this.render();
  }

  private render(): void {
    if (!this.canvasRef?.nativeElement) return;

    const labels = this.data.map((d) => d.category);
    const values = this.data.map((d) => d.count);

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets[0].data = values;
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tickets',
            data: values,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}
