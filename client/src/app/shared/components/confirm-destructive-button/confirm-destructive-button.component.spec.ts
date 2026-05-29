import { TestBed } from '@angular/core/testing';
import { ConfirmationService, ConfirmEventType } from 'primeng/api';
import { ConfirmDestructiveButtonComponent } from './confirm-destructive-button.component';

function setup(inputs: {
  ariaLabel?: string;
  confirmMessage?: string;
  acceptLabel?: string;
  rejectLabel?: string;
}) {
  TestBed.configureTestingModule({
    imports: [ConfirmDestructiveButtonComponent],
    providers: [ConfirmationService],
  });
  const fixture = TestBed.createComponent(ConfirmDestructiveButtonComponent);
  fixture.componentRef.setInput('ariaLabel', inputs.ariaLabel ?? 'Delete row');
  fixture.componentRef.setInput('confirmMessage', inputs.confirmMessage ?? 'Are you sure?');
  fixture.componentRef.setInput('acceptLabel', inputs.acceptLabel ?? 'Delete');
  fixture.componentRef.setInput('rejectLabel', inputs.rejectLabel ?? 'Cancel');
  fixture.detectChanges();
  return { fixture, confirmationService: TestBed.inject(ConfirmationService) };
}

describe('ConfirmDestructiveButtonComponent (#1034)', () => {
  it('mounts a p-button host with the default icon binding', () => {
    const { fixture } = setup({});
    const btn = fixture.nativeElement.querySelector('p-button');
    expect(btn).not.toBeNull();
    // Default `icon` input value is the canonical signifier for destroy.
    expect(fixture.componentInstance.icon()).toBe('pi pi-trash');
  });

  it('opens a confirm popup via ConfirmationService on click with the supplied copy', () => {
    const { fixture, confirmationService } = setup({
      ariaLabel: 'Revoke device',
      confirmMessage: 'This device will stop receiving pushes.',
      acceptLabel: 'Revoke',
      rejectLabel: 'Keep',
    });
    const confirmSpy = vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      // Verify the wire shape — what the host sees through PrimeNG.
      expect(opts.message).toBe('This device will stop receiving pushes.');
      expect(opts.acceptLabel).toBe('Revoke');
      expect(opts.rejectLabel).toBe('Keep');
      expect(opts.acceptButtonProps?.severity).toBe('danger');
      return confirmationService;
    });

    // Component method is protected — bypass via the typed `as` for the spec
    // boundary. The integration assertion above is what actually pins the
    // contract for the consumer.
    (fixture.componentInstance as unknown as { open: (e: Event) => void }).open(
      new MouseEvent('click'),
    );

    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it('emits `confirmed` only when the user accepts (NOT on reject / cancel)', () => {
    const { fixture, confirmationService } = setup({});
    let emitCount = 0;
    fixture.componentInstance.confirmed.subscribe(() => emitCount++);

    let storedAccept: (() => void) | undefined;
    let storedReject: ((type?: ConfirmEventType) => void) | undefined;
    vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      storedAccept = opts.accept as (() => void) | undefined;
      storedReject = opts.reject as ((type?: ConfirmEventType) => void) | undefined;
      return confirmationService;
    });

    (fixture.componentInstance as unknown as { open: (e: Event) => void }).open(
      new MouseEvent('click'),
    );
    storedReject?.();
    expect(emitCount).toBe(0);

    storedAccept?.();
    expect(emitCount).toBe(1);
  });

  it('passes confirmIcon to the popup when set, omits it when null (#1103)', () => {
    const { fixture, confirmationService } = setup({});
    let icon: string | undefined = 'sentinel';
    const spy = vi.spyOn(confirmationService, 'confirm').mockImplementation((opts) => {
      icon = opts.icon;
      return confirmationService;
    });

    // Default (null) → no icon flows into the confirm config.
    (fixture.componentInstance as unknown as { open: (e: Event) => void }).open(
      new MouseEvent('click'),
    );
    expect(icon).toBeUndefined();

    // Opt-in → the warning glyph reaches the popup (Norman § signifier).
    fixture.componentRef.setInput('confirmIcon', 'pi pi-exclamation-triangle');
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { open: (e: Event) => void }).open(
      new MouseEvent('click'),
    );
    expect(icon).toBe('pi pi-exclamation-triangle');

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('suppresses the tooltip on a labelled button; keeps ariaLabel for icon-only (#1104)', () => {
    const { fixture } = setup({ ariaLabel: 'Revoke session' });
    const cmp = fixture.componentInstance as unknown as {
      resolvedTooltip: () => string | undefined;
    };

    // Icon-only (no label) → ariaLabel is the only affordance, so it tooltips.
    expect(cmp.resolvedTooltip()).toBe('Revoke session');

    // Labelled → the visible label IS the affordance; no duplicate tooltip
    // (undefined, not null — PrimeNG's pTooltip rejects null).
    fixture.componentRef.setInput('label', 'Sign out other sessions');
    fixture.detectChanges();
    expect(cmp.resolvedTooltip()).toBeUndefined();

    // Explicit tooltip always wins, even with a label.
    fixture.componentRef.setInput('tooltip', 'Custom hint');
    fixture.detectChanges();
    expect(cmp.resolvedTooltip()).toBe('Custom hint');
  });
});
