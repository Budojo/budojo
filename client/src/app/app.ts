import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { LanguageService } from './core/services/language.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly languageService = inject(LanguageService);

  ngOnInit(): void {
    // i18n bootstrap (#273) — must run BEFORE any user-visible
    // string is rendered so the first paint is in the right
    // language. Reads localStorage / navigator.language with
    // an `en` fallback.
    this.languageService.bootstrap();
  }
}
