import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { provideI18nTesting } from '../../../test-utils/i18n-test';
import { useLadder } from '../../../test-utils/ladder-test';
import { LanguageService } from './language.service';
import { TrainingModesService } from './training-modes.service';

function setup(): TrainingModesService {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), ...provideI18nTesting()],
  });
  return TestBed.inject(TrainingModesService);
}

describe('TrainingModesService (#1803)', () => {
  it('reads as BJJ until an academy is loaded — what every screen showed before', () => {
    const modes = setup();

    expect(modes.modes()).toEqual(['gi', 'nogi']);
    expect(modes.classOptions().map((o) => o.label)).toEqual([
      'Gi',
      'No-gi',
      'Gi and no-gi',
      'Other',
    ]);
    expect(modes.newClassMode()).toBe('gi');
  });

  it("offers a class the art's two modes, the middle and other, in that order", () => {
    const modes = setup();
    useLadder('judo');

    expect(modes.classOptions()).toEqual([
      { value: 'tachi-waza', label: 'Tachi-waza' },
      { value: 'ne-waza', label: 'Ne-waza' },
      { value: 'both', label: 'Tachi-waza and ne-waza' },
      { value: 'other', label: 'Other' },
    ]);
  });

  it('offers a topic the two modes, then the middle, and never other — a topic is the art', () => {
    const modes = setup();
    useLadder('karate');

    expect(modes.topicOptions().map((o) => o.value)).toEqual(['kata', 'kumite', 'both']);
  });

  it('starts a new class on gi in BJJ and on the middle everywhere else', () => {
    const modes = setup();

    useLadder('bjj');
    expect(modes.newClassMode()).toBe('gi');
    useLadder('taekwondo');
    expect(modes.newClassMode()).toBe('both');
  });

  it("gives the programme form the art's own example", () => {
    const modes = setup();
    useLadder('karate');

    expect(TestBed.inject(TranslateService).instant(modes.hintKey())).toBe(
      'Saifa is kata, sanbon kumite is kumite. Leave it on kata and kumite when it makes sense either way.',
    );
  });

  it('names both in the language in force, and follows a switch', () => {
    const modes = setup();
    useLadder('taekwondo');
    expect(modes.labels().both).toBe('Poomsae and kyorugi');

    TestBed.inject(LanguageService).setLanguage('it');
    expect(modes.labels().both).toBe('Poomsae e kyorugi');
    expect(modes.labels().other).toBe('Altro');
  });
});
