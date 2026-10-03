import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classOnTheMat } from '../../features/attendance/daily/class-pick';
import { closureOn } from '../../shared/utils/training-days';
import { AcademyClassService } from '../services/academy-class.service';
import { AcademyService } from '../services/academy.service';
import { RuntimeService } from '../services/runtime.service';

/**
 * Home by the clock (#2035, PRD § 6.1): **the phone opens on the check-in** of
 * the class on the mat, from 15 minutes before it to 30 after it ends, and on
 * Oggi otherwise. Each is one tap from the other in the tab bar.
 *
 * Only on the app's first screen: a tap on Oggi later stays on Oggi. A page
 * loading again after a sync is a first screen too, and during a class the
 * check-in is where the owner is anyway; no storage is kept to tell it apart
 * (`docs/legal/cookie-audit.md`). Never on the PC, where the owner sits down
 * to more than the register, and never on a day the academy is closed.
 */
export const homeByTheClockGuard: CanActivateFn = async () => {
  const runtime = inject(RuntimeService);
  const academy = inject(AcademyService);
  const classes = inject(AcademyClassService);
  const router = inject(Router);

  // Not the app's first screen: the owner chose Oggi, or a link led there.
  if (router.navigated) {
    return true;
  }
  await runtime.load();
  const now = new Date();
  if (runtime.profile() !== 'mobile' || closureOn(academy.academy()?.closures, now) !== null) {
    return true;
  }
  try {
    const onTheMat = classOnTheMat(await firstValueFrom(classes.list()), now);
    return onTheMat === null ? true : router.createUrlTree(['/dashboard/attendance']);
  } catch {
    // No classes to read: Oggi, which says so itself.
    return true;
  }
};
