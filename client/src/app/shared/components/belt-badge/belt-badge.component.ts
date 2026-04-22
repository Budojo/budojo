import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { Belt } from '../../../core/services/athlete.service';

interface BeltStyle {
  background: string;
  color: string;
}

const BELT_STYLES: Record<Belt, BeltStyle> = {
  white: { background: '#f3f4f6', color: '#374151' },
  blue: { background: '#1D4ED8', color: '#ffffff' },
  purple: { background: '#7C3AED', color: '#ffffff' },
  brown: { background: '#92400E', color: '#ffffff' },
  black: { background: '#111827', color: '#ffffff' },
};

@Component({
  selector: 'app-belt-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagModule],
  template: ` <p-tag [value]="label()" [style]="style()" [rounded]="true" /> `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
    `,
  ],
})
export class BeltBadgeComponent {
  readonly belt = input.required<Belt>();

  label(): string {
    return this.belt().charAt(0).toUpperCase() + this.belt().slice(1);
  }

  style(): Record<string, string> {
    const s = BELT_STYLES[this.belt()];
    return { background: s.background, color: s.color };
  }
}
