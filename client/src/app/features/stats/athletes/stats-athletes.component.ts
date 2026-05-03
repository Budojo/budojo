import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-stats-athletes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './stats-athletes.component.html',
  styleUrl: './stats-athletes.component.scss',
})
export class StatsAthletesComponent {}
