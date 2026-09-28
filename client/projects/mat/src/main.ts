import { bootstrapApplication } from '@angular/platform-browser';
import { MatAppComponent } from './app/mat-app.component';
import { matConfig } from './app/mat.config';

bootstrapApplication(MatAppComponent, matConfig).catch((error: unknown) => console.error(error));
