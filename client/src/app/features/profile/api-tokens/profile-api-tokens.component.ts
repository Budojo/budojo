import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ApiToken,
  ApiTokenService,
  CreatedApiToken,
} from '../../../core/services/api-token.service';

/**
 * "API tokens" panel on `/dashboard/profile` (#431). Lets the user
 * mint long-lived, user-named, abilities-scoped Sanctum tokens for
 * integrations.
 *
 * Three states:
 *  - Empty / list — rows of (name, abilities chips, last-used,
 *    expires) with a per-row "Revoke" CTA.
 *  - Create dialog — form for name + abilities checkbox grid +
 *    optional expiry-in-days. On success a SECOND dialog opens
 *    showing the plaintext token ONCE with a copy CTA.
 *  - Plaintext dialog — surfaces the freshly-minted bearer string.
 *    Closeable only via "I've saved it" so a fat-finger doesn't
 *    lose the value forever.
 */
@Component({
  selector: 'app-profile-api-tokens',
  standalone: true,
  imports: [
    ButtonModule,
    CheckboxModule,
    ConfirmPopupModule,
    DatePipe,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    ProgressSpinnerModule,
    ReactiveFormsModule,
    TooltipModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-api-tokens.component.html',
  styleUrl: './profile-api-tokens.component.scss',
  providers: [ConfirmationService],
})
export class ProfileApiTokensComponent implements OnInit {
  private readonly tokenService = inject(ApiTokenService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);
  protected readonly tokens = signal<readonly ApiToken[]>([]);
  protected readonly availableAbilities = signal<readonly string[]>([]);
  protected readonly creating = signal<boolean>(false);
  protected readonly revokingId = signal<number | null>(null);
  protected readonly createDialogOpen = signal<boolean>(false);
  protected readonly createdToken = signal<CreatedApiToken | null>(null);
  protected readonly plaintextDialogOpen = signal<boolean>(false);

  protected readonly hasTokens = computed(() => this.tokens().length > 0);

  protected readonly createForm = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(100)]),
    expires_in_days: new FormControl<number | null>(null),
    abilities: this.fb.nonNullable.array<FormControl<boolean>>([]),
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.errored.set(false);
    this.tokenService.list().subscribe({
      next: (r) => {
        this.tokens.set(r.tokens);
        this.availableAbilities.set(r.availableAbilities);
        // Build the abilities checkbox group lazily once the catalog
        // arrives — every ability gets a `false`-initialised control.
        this.createForm.controls.abilities.clear();
        for (let i = 0; i < r.availableAbilities.length; i++) {
          this.createForm.controls.abilities.push(this.fb.nonNullable.control(false));
        }
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
  }

  protected openCreateDialog(): void {
    this.createForm.controls.name.reset('');
    this.createForm.controls.expires_in_days.reset(null);
    // Reset every ability checkbox to false.
    const abilitiesGroup = this.createForm.controls.abilities;
    for (let i = 0; i < abilitiesGroup.length; i++) {
      abilitiesGroup.at(i).setValue(false);
    }
    this.createDialogOpen.set(true);
  }

  protected submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const selectedAbilities = this.availableAbilities().filter(
      (_, i) => this.createForm.controls.abilities.at(i).value === true,
    );
    if (selectedAbilities.length === 0) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('profile.apiTokens.abilitiesRequired'),
      });
      return;
    }
    this.creating.set(true);
    const expires = this.createForm.controls.expires_in_days.value;
    this.tokenService
      .create({
        name: this.createForm.controls.name.value,
        abilities: selectedAbilities,
        expires_in_days: expires !== null && expires > 0 ? expires : null,
      })
      .subscribe({
        next: (token) => {
          this.creating.set(false);
          this.createDialogOpen.set(false);
          this.createdToken.set(token);
          this.plaintextDialogOpen.set(true);
          this.refresh();
        },
        error: () => {
          this.creating.set(false);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('profile.apiTokens.createErrorSummary'),
          });
        },
      });
  }

  protected confirmRevoke(event: MouseEvent, token: ApiToken): void {
    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: this.translate.instant('profile.apiTokens.confirmRevoke', { name: token.name }),
      acceptLabel: this.translate.instant('profile.apiTokens.confirmRevokeAccept'),
      rejectLabel: this.translate.instant('profile.apiTokens.confirmRevokeReject'),
      accept: () => this.revoke(token),
    });
  }

  private revoke(token: ApiToken): void {
    this.revokingId.set(token.id);
    this.tokenService.revoke(token.id).subscribe({
      next: () => {
        this.revokingId.set(null);
        this.tokens.set(this.tokens().filter((t) => t.id !== token.id));
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profile.apiTokens.revokedSummary'),
        });
      },
      error: () => {
        this.revokingId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profile.apiTokens.revokeErrorSummary'),
        });
      },
    });
  }

  protected closePlaintextDialog(): void {
    this.plaintextDialogOpen.set(false);
    this.createdToken.set(null);
  }

  protected copyPlaintext(): void {
    const token = this.createdToken();
    if (token === null) {
      return;
    }
    void navigator.clipboard.writeText(token.plain_text_token);
    this.messageService.add({
      severity: 'info',
      summary: this.translate.instant('profile.apiTokens.copiedSummary'),
    });
  }

  protected abilityChecked(index: number): boolean {
    return this.createForm.controls.abilities.at(index).value === true;
  }

  protected toggleAbility(index: number): void {
    const control = this.createForm.controls.abilities.at(index);
    control.setValue(!control.value);
  }
}
