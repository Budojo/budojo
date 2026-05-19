import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { AvatarCardComponent } from './avatar-card.component';
import { AuthService } from '../../../core/services/auth.service';
import { provideI18nTesting } from '../../../../test-utils/i18n-test';

describe('AvatarCardComponent', () => {
  let fixture: ComponentFixture<AvatarCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        MessageService,
        ConfirmationService,
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 1,
              first_name: 'Mario',
              last_name: 'Bonanno',
              full_name: 'Mario Bonanno',
              email: 'mario@example.com',
              avatar_url: null,
            }),
            uploadAvatar: () => ({ subscribe: () => undefined }),
            removeAvatar: () => ({ subscribe: () => undefined }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarCardComponent);
    fixture.detectChanges();
  });

  it('renders the avatar card with upload button when no avatar set', () => {
    const card = fixture.nativeElement.querySelector('[data-cy="profile-avatar-card"]');
    expect(card).not.toBeNull();
    const uploadBtn = fixture.nativeElement.querySelector('[data-cy="profile-avatar-upload"]');
    expect(uploadBtn).not.toBeNull();
    const removeBtn = fixture.nativeElement.querySelector('[data-cy="profile-avatar-remove"]');
    expect(removeBtn).toBeNull();
  });
});
