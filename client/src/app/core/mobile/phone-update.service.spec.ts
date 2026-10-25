import { TestBed } from '@angular/core/testing';
import { LATEST_RELEASE_URL } from './app-update';
import { PHONE_UPDATE_SOURCE, PhoneUpdateService, PhoneUpdateSource } from './phone-update.service';

/**
 * The update notice's source (#2041): asked once per launch, only on the
 * phone and only by a release build; any failure is silence.
 */
describe('PhoneUpdateService', () => {
  const RELEASE = {
    tag_name: 'v2.80.0',
    assets: [
      {
        name: 'Budojo-Android-2.80.0.apk',
        browser_download_url:
          'https://github.com/Budojo/budojo/releases/download/v2.80.0/Budojo-Android-2.80.0.apk',
      },
    ],
  };
  let latest: ReturnType<typeof vi.fn<PhoneUpdateSource['latest']>>;

  function service(source: Partial<PhoneUpdateSource>): PhoneUpdateService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PHONE_UPDATE_SOURCE,
          useValue: { onPhone: true, running: '2.79.0', latest, ...source },
        },
      ],
    });
    return TestBed.inject(PhoneUpdateService);
  }

  beforeEach(() => {
    latest = vi.fn(async () => RELEASE);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reads the latest release from GitHub, by the API', () => {
    expect(LATEST_RELEASE_URL).toBe('https://api.github.com/repos/Budojo/budojo/releases/latest');
  });

  it('offers the newer APK on the phone', async () => {
    const update = service({});
    update.check();

    await vi.waitFor(() =>
      expect(update.available()).toEqual({
        version: '2.80.0',
        url: RELEASE.assets[0].browser_download_url,
      }),
    );
  });

  it('asks once per launch, however often Oggi opens', async () => {
    const update = service({});
    update.check();
    update.check();
    await vi.waitFor(() => expect(update.available()).not.toBeNull());

    expect(latest).toHaveBeenCalledOnce();
  });

  it('asks nothing off the phone: the PC has its own updater', () => {
    const update = service({ onPhone: false });
    update.check();

    expect(latest).not.toHaveBeenCalled();
    expect(update.available()).toBeNull();
  });

  it('asks nothing from a test build, which no release installs over', () => {
    const update = service({ running: '0.0.231' });
    update.check();

    expect(latest).not.toHaveBeenCalled();
  });

  it('stays quiet with no network, or when GitHub says no', async () => {
    latest.mockRejectedValue(new TypeError('Failed to fetch'));
    const update = service({});
    update.check();
    await Promise.resolve();
    await Promise.resolve();

    expect(latest).toHaveBeenCalledOnce();
    expect(update.available()).toBeNull();
  });
});
