import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { TrendPoint } from '../../models/report.model';

Chart.register(...registerables);

const PALETTE = [
  '#4C6EF5', '#F76707', '#12B886', '#E64980', '#7048E8', '#FAB005', '#15AABF', '#868E96',
];

@Component({
  selector: 'app-trend-chart',
  standalone: true,
  template: `<div class="chart-card">
    <h3>Category Volume Over Time</h3>
    <canvas #canvas></canvas>
  </div>`,
  styleUrl: '../category-chart/category-chart.component.css',
})
export class TrendChartComponent implements OnChanges {
  @Input() data: TrendPoint[] = [];
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

    const weeks = Array.from(new Set(this.data.map((d) => d.week))).sort();
    const categories = Array.from(new Set(this.data.map((d) => d.category)));

    const datasets = categories.map((category, i) => ({
      label: category,
      data: weeks.map((week) => {
        const point = this.data.find((d) => d.week === week && d.category === category);
        return point?.count ?? 0;
      }),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length],
      tension: 0.25,
    }));

    if (this.chart) {
      this.chart.data.labels = weeks;
      this.chart.data.datasets = datasets;
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: { labels: weeks, datasets },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
}
