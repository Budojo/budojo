import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';
import { LanguageService } from '../../../core/services/language.service';
import { SyncService, SyncState } from '../../../core/sync/sync.service';
import { localeFor } from '../../utils/locale';

/** What each state looks like, and whether the owner has something to do. */
const LOOK: Record<SyncState['kind'], { icon: string; attention: boolean }> = {
  off: { icon: '', attention: false },
  syncing: { icon: 'pi-sync pi-spin', attention: false },
  synced: { icon: 'pi-check-circle', attention: false },
  pending: { icon: 'pi-cloud-upload', attention: false },
  'waiting-first': { icon: 'pi-clock', attention: false },
  reconnect: { icon: 'pi-link', attention: true },
  ask: { icon: 'pi-question-circle', attention: true },
  'another-folder': { icon: 'pi-exclamation-triangle', attention: true },
  unpaired: { icon: 'pi-exclamation-triangle', attention: true },
  full: { icon: 'pi-exclamation-triangle', attention: true },
  'needs-rebase': { icon: 'pi-exclamation-circle', attention: true },
  failed: { icon: 'pi-exclamation-triangle', attention: true },
};

/**
 * The sync state, always on screen (#2046, PRD § 6.2): in the topbar, quiet
 * while the phone and Drive agree, and orange when the owner has something
 * to do. A tap opens the sentence in full, with «Sincronizza ora», or
 * «Ricollega Google» when Google let go (weekly, while the OAuth app is in
 * Testing). Nothing at all where there is no sync.
 */
@Component({
  selector: 'app-sync-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, PopoverModule, TranslatePipe],
  templateUrl: './sync-pill.component.html',
  styleUrl: './sync-pill.component.scss',
})
export class SyncPillComponent {
  private readonly sync = inject(SyncService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  protected readonly state = this.sync.state;
  protected readonly busy = signal(false);

  protected readonly icon = computed(() => LOOK[this.state().kind].icon);
  protected readonly attention = computed(() => LOOK[this.state().kind].attention);

  /** The few characters beside the icon: the time, or how many wait. */
  protected readonly short = computed(() => {
    const state = this.state();
    switch (state.kind) {
      case 'synced':
        return this.time(state.at);
      case 'pending':
      case 'needs-rebase':
        return state.count > 0 ? String(state.count) : '';
      default:
        return '';
    }
  });

  /** The state in one sentence: the pill's name for a screen reader, and the detail's title. */
  protected readonly sentence = computed(() => {
    this.language.currentLang();
    const state = this.state();
    switch (state.kind) {
      case 'synced':
        return this.translate.instant('sync.state.synced', { time: this.time(state.at) });
      case 'pending':
        return this.translate.instant(
          state.count === 1 ? 'sync.state.pendingOne' : 'sync.state.pendingOther',
          { count: state.count },
        );
      case 'needs-rebase':
        return this.translate.instant('sync.state.needsRebase');
      default:
        return this.translate.instant(`sync.state.${KEYS[state.kind]}`);
    }
  });

  /** What it means, and what to do: under the sentence. */
  protected readonly hint = computed(() => {
    this.language.currentLang();
    const state = this.state();
    switch (state.kind) {
      case 'pending':
        return this.translate.instant(state.offline ? 'sync.hint.offline' : 'sync.hint.pending');
      case 'needs-rebase':
        return this.translate.instant(
          state.count === 1 ? 'sync.hint.needsRebaseOne' : 'sync.hint.needsRebaseOther',
          { count: state.count },
        );
      case 'failed':
        return state.reason;
      case 'waiting-first':
      case 'ask':
      case 'another-folder':
      case 'unpaired':
      case 'full':
      case 'reconnect':
        return this.translate.instant(`sync.hint.${KEYS[state.kind]}`);
      default:
        return '';
    }
  });

  /**
   * Back to the pill when the detail closes with the focus in it (Escape, the
   * pill's own toggle), where it would fall to the page. A tap on a field
   * elsewhere closes it too, and that field keeps the focus: on the phone,
   * taking it back would drop the keyboard.
   */
  protected returnFocus(pill: HTMLElement): void {
    const active = document.activeElement;
    if (active === null || active === document.body || active.closest('.sync-detail') !== null) {
      pill.focus();
    }
  }

  async act(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      if (this.state().kind === 'reconnect') {
        await this.sync.reconnect();
      } else {
        await this.sync.syncNow();
      }
    } catch {
      // The pill shows the state the attempt left behind.
    } finally {
      this.busy.set(false);
    }
  }

  private time(at: number): string {
    return new Intl.DateTimeFormat(localeFor(this.language.currentLang()), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(at));
  }
}

/** The translation key of each state with a fixed sentence: listed, so the parity check sees every one. */
const KEYS: Record<SyncState['kind'], string> = {
  off: 'off',
  syncing: 'syncing',
  synced: 'synced',
  pending: 'pending',
  'waiting-first': 'waitingFirst',
  reconnect: 'reconnect',
  ask: 'ask',
  'another-folder': 'anotherFolder',
  unpaired: 'unpaired',
  full: 'full',
  'needs-rebase': 'needsRebase',
  failed: 'failed',
};
