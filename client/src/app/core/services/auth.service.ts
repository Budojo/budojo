import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AcademyService } from './academy.service';
import { environment } from '../../../environments/environment';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  data: { id: number; name: string; email: string };
  token: string;
}

const TOKEN_KEY = 'auth_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly academyService = inject(AcademyService);
  private readonly base = `${environment.apiBase}/api/v1/auth`;

  readonly isLoggedIn = signal<boolean>(!!localStorage.getItem(TOKEN_KEY));

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private storeToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.isLoggedIn.set(true);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.academyService.clear();
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/register`, payload)
      .pipe(tap((res) => this.storeToken(res.token)));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/login`, payload)
      .pipe(tap((res) => this.storeToken(res.token)));
  }
}
