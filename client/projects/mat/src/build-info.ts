/**
 * The build this bundle came from. CI overwrites the value before `ng build mat`
 * (`.github/workflows/mobile-apk.yml`), so the phone can say which APK it is
 * running. That is how the owner tells two installs apart when checking that
 * an update kept the data (#2027).
 */
export const MAT_BUILD = 'dev';
