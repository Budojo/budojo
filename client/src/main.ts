import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import {
  bootPhoneServer,
  holdRequestsOnReturn,
  phpServerPlugin,
} from './app/core/mobile/phone-server';
import { setupStaleChunkRecovery } from './app/shared/utils/stale-chunk-recovery';
import { environment } from './environments/environment';

// Arm the stale-chunk recovery listeners BEFORE bootstrap so they're
// active for the very first lazy import (preload kicks in right after
// the initial NavigationEnd). See the file's docblock for the failure
// mode this guards against.
setupStaleChunkRecovery();

async function boot(): Promise<void> {
  // On the phone (#2034) the API is a server the app starts itself: it must be
  // listening, and its address known, before the first request.
  if (environment.runtime === 'mobile') {
    const plugin = phpServerPlugin();
    const screen = document.querySelector('app-root');
    if (plugin === null || !(screen instanceof HTMLElement)) {
      return;
    }
    if (!(await bootPhoneServer(plugin, screen))) {
      return;
    }
    holdRequestsOnReturn(plugin, document);
  }

  await bootstrapApplication(App, appConfig);
}

boot().catch((err) => console.error(err));
