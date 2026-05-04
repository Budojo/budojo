import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { setupStaleChunkRecovery } from './app/shared/utils/stale-chunk-recovery';

// Arm the stale-chunk recovery listeners BEFORE bootstrap so they're
// active for the very first lazy import (preload kicks in right after
// the initial NavigationEnd). See the file's docblock for the failure
// mode this guards against.
setupStaleChunkRecovery();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
