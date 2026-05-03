import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatsOverviewComponent } from './overview/stats-overview.component';

@Component({
  selector: 'app-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatsOverviewComponent],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {}
