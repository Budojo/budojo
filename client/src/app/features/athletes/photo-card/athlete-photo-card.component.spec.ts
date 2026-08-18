import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteService, type Athlete } from '../../../core/services/athlete.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';
import { AthletePhotoCardComponent } from './athlete-photo-card.component';

/**
 * The athlete photo card (#1357).
 *
 * The interesting tests are the **refusals** and the **state hand-back**. A
 * file picker is the one control a user can point at anything on their disk, so
 * what it does with a PDF matters more than what it does with a PNG; and the
 * card owns no state, so proving it emits the refreshed row is proving the
 * header and the list will actually update.
 */

const ATHLETE = {
  id: 7,
  first_name: 'Fabio',
  last_name: 'Sdringola',
  photo_url: null,
} as unknown as Athlete;

function fileOf(name: string, type: string, bytes = 10): File {
  const file = new File(['x'.repeat(bytes)], name, { type });

  // `File` size is derived from the content; override for the size-limit test
  // rather than allocating megabytes in a unit test.
  Object.defineProperty(file, 'size', { value: bytes });

  return file;
}

function selectFile(fixture: ComponentFixture<AthletePhotoCardComponent>, file: File): void {
  const input: HTMLInputElement = fixture.nativeElement.querySelector(
    '[data-cy="athlete-photo-input"]',
  );
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('AthletePhotoCardComponent', () => {
  let athleteService: AthleteService;
  let messageService: MessageService;

  function setup(athlete: Athlete = ATHLETE): ComponentFixture<AthletePhotoCardComponent> {
    TestBed.configureTestingModule({
      imports: [AthletePhotoCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        ...provideI18nTesting(),
      ],
    });

    athleteService = TestBed.inject(AthleteService);
    messageService = TestBed.inject(MessageService);

    const fixture = TestBed.createComponent(AthletePhotoCardComponent);
    fixture.componentRef.setInput('athlete', athlete);
    fixture.detectChanges();

    return fixture;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('what it offers', () => {
    it('offers upload, and no remove, when there is no photo', () => {
      const root: HTMLElement = setup().nativeElement;

      expect(root.querySelector('[data-cy="athlete-photo-upload"]')).not.toBeNull();
      // Removing nothing is not an action worth showing.
      expect(root.querySelector('[data-cy="athlete-photo-remove"]')).toBeNull();
    });

    it('offers remove once a photo exists', () => {
      const withPhoto = { ...ATHLETE, photo_url: '/storage/athletes/photos/7.png?v=1' } as Athlete;
      const root: HTMLElement = setup(withPhoto).nativeElement;

      expect(root.querySelector('[data-cy="athlete-photo-remove"]')).not.toBeNull();
    });

    // The popup silently never opens when the service comes from elsewhere —
    // exactly how restore shipped broken in #1324.
    it('provides its own ConfirmationService', () => {
      const fixture = setup();

      expect(fixture.debugElement.injector.get(ConfirmationService)).toBeTruthy();
    });
  });

  describe('what it refuses before the network', () => {
    it('refuses a file that is not an image', () => {
      // `setup()` is what resolves the services, so the spies come after it.
      const fixture = setup();
      const upload = vi.spyOn(athleteService, 'uploadPhoto');
      const toast = vi.spyOn(messageService, 'add');

      selectFile(fixture, fileOf('cert.pdf', 'application/pdf'));

      expect(upload).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    });

    it('refuses a file over 2MB', () => {
      const fixture = setup();
      const upload = vi.spyOn(athleteService, 'uploadPhoto');

      selectFile(fixture, fileOf('huge.png', 'image/png', 3 * 1024 * 1024));

      expect(upload).not.toHaveBeenCalled();
    });

    // Not belt-and-braces: a 422 round-trip to learn a PDF is not a photo is a
    // worse answer than saying so immediately. The server stays the authority.
    it('accepts a PNG within the limit', () => {
      const fixture = setup();
      const upload = vi.spyOn(athleteService, 'uploadPhoto').mockReturnValue(of(ATHLETE));

      selectFile(fixture, fileOf('face.png', 'image/png'));

      expect(upload).toHaveBeenCalledWith(7, expect.any(File));
    });
  });

  describe('handing the row back', () => {
    it('emits the refreshed athlete after an upload', () => {
      const updated = { ...ATHLETE, photo_url: '/storage/athletes/photos/7.png?v=2' } as Athlete;
      const fixture = setup();
      vi.spyOn(athleteService, 'uploadPhoto').mockReturnValue(of(updated));
      const emitted: Athlete[] = [];
      fixture.componentInstance.changed.subscribe((a) => emitted.push(a));

      selectFile(fixture, fileOf('face.png', 'image/png'));

      // The parent updates from the object the server just returned, rather
      // than refetching a row it is already holding.
      expect(emitted).toEqual([updated]);
    });

    it('reports an upload failure and stops the spinner', () => {
      const fixture = setup();
      vi.spyOn(athleteService, 'uploadPhoto').mockReturnValue(throwError(() => new Error('boom')));
      const toast = vi.spyOn(messageService, 'add');

      selectFile(fixture, fileOf('face.png', 'image/png'));

      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
      // A stuck spinner would leave the only affordance disabled forever.
      const button = fixture.nativeElement.querySelector('[data-cy="athlete-photo-upload"] button');
      expect(button?.hasAttribute('disabled')).toBe(false);
    });

    it('emits the cleared athlete after a removal', () => {
      const withPhoto = { ...ATHLETE, photo_url: '/storage/athletes/photos/7.png?v=1' } as Athlete;
      const cleared = { ...ATHLETE, photo_url: null } as Athlete;
      const fixture = setup(withPhoto);
      vi.spyOn(athleteService, 'removePhoto').mockReturnValue(of(cleared));
      const emitted: Athlete[] = [];
      fixture.componentInstance.changed.subscribe((a) => emitted.push(a));

      // Straight through the confirm, which is exercised by its own test above.
      (fixture.componentInstance as unknown as { remove: () => void })['remove']();

      expect(emitted).toEqual([cleared]);
    });
  });
});
