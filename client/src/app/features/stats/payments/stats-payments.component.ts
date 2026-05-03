import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-stats-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './stats-payments.component.html',
  styleUrl: './stats-payments.component.scss',
})
export class StatsPaymentsComponent {}
