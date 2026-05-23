import { Injectable } from '@angular/core';
import type { Belt } from '../../core/services/athlete.service';

/**
 * Belt color palette for the card render. Mirrors the BJJ canon —
 * the visual identity of the promotion. Source of truth for the
 * pure-canvas card is here (not the PrimeNG token layer) because we
 * need exact hex for image data even when the SPA is rendering in
 * dark mode.
 */
const BELT_COLORS: Readonly<Record<Belt, { fill: string; ink: string; label: string }>> = {
  grey: { fill: '#9ca3af', ink: '#1f2937', label: 'GREY' },
  yellow: { fill: '#fbbf24', ink: '#1f2937', label: 'YELLOW' },
  orange: { fill: '#fb923c', ink: '#1f2937', label: 'ORANGE' },
  green: { fill: '#22c55e', ink: '#0b1f12', label: 'GREEN' },
  white: { fill: '#ffffff', ink: '#1f2937', label: 'WHITE' },
  blue: { fill: '#3b82f6', ink: '#ffffff', label: 'BLUE' },
  purple: { fill: '#8b5cf6', ink: '#ffffff', label: 'PURPLE' },
  brown: { fill: '#92400e', ink: '#ffffff', label: 'BROWN' },
  black: { fill: '#111827', ink: '#ffffff', label: 'BLACK' },
  'red-and-black': { fill: '#7f1d1d', ink: '#ffffff', label: 'RED & BLACK' },
  'red-and-white': { fill: '#b91c1c', ink: '#ffffff', label: 'CORAL' },
  red: { fill: '#dc2626', ink: '#ffffff', label: 'RED' },
};

export type ShareCardVariant = 'story' | 'square';

export interface PromotionShareCardInput {
  readonly athleteName: string;
  readonly fromBelt: Belt | null;
  readonly toBelt: Belt;
  readonly academyName: string;
  readonly date: string; // YYYY-MM-DD
}

/**
 * Generates a shareable PNG card for a belt promotion (#959). Pure
 * `<canvas>` 2d render, no server round-trip — the card is composed
 * client-side and handed to `navigator.share({ files: [...] })`.
 *
 * Two variants: `story` (1080×1920, Instagram Stories portrait) and
 * `square` (1080×1080, Instagram Feed / WhatsApp). The story variant
 * is the default — Stories carry more reach than Feed and Stories
 * accept the portrait shape natively.
 *
 * No web fonts loaded — the card uses the system stack so it renders
 * pixel-identical on every device without a font-load race against
 * the share intent.
 */
@Injectable({ providedIn: 'root' })
export class PromotionShareCardService {
  async toBlob(input: PromotionShareCardInput, variant: ShareCardVariant = 'story'): Promise<Blob> {
    const dims = variant === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 };
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Background — soft gradient from the new-belt color into a deep
    // neutral. Belt-color anchor keeps the card visually tied to the
    // milestone.
    const toBeltStyle = BELT_COLORS[input.toBelt];
    const gradient = ctx.createLinearGradient(0, 0, 0, dims.h);
    gradient.addColorStop(0, toBeltStyle.fill);
    gradient.addColorStop(1, '#0b1020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, dims.w, dims.h);

    // Card panel — centered translucent slab so the text reads on any
    // belt color (yellow + white in particular wash out without it).
    const padX = dims.w * 0.08;
    const padY = dims.h * 0.12;
    const panelX = padX;
    const panelY = padY;
    const panelW = dims.w - 2 * padX;
    const panelH = dims.h - 2 * padY;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    this.roundedRect(ctx, panelX, panelY, panelW, panelH, 36);
    ctx.fill();

    // Eyebrow — "PROMOTED TO" small label.
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PROMOTED TO', dims.w / 2, panelY + 96);

    // New belt label — the headline.
    ctx.fillStyle = '#0b1020';
    ctx.font = `800 ${Math.round(dims.w * 0.13)}px system-ui, sans-serif`;
    ctx.fillText(toBeltStyle.label, dims.w / 2, panelY + 220);

    // Belt visual — bar with the new belt color (with optional
    // stripe-band hint by leaving the right ~12% darker for the black
    // belt bar convention).
    const beltBarY = panelY + 280;
    const beltBarH = 80;
    ctx.fillStyle = toBeltStyle.fill;
    ctx.fillRect(panelX + 60, beltBarY, panelW - 120, beltBarH);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(panelX + panelW - 200, beltBarY, 60, beltBarH);

    // Athlete name.
    ctx.fillStyle = '#0b1020';
    ctx.font = `700 ${Math.round(dims.w * 0.07)}px system-ui, sans-serif`;
    ctx.fillText(input.athleteName, dims.w / 2, panelY + 560);

    // From-belt transition line ("from white belt to blue belt").
    if (input.fromBelt !== null) {
      const fromLabel = BELT_COLORS[input.fromBelt].label.toLowerCase();
      const toLabel = toBeltStyle.label.toLowerCase();
      ctx.fillStyle = '#374151';
      ctx.font = `500 ${Math.round(dims.w * 0.035)}px system-ui, sans-serif`;
      ctx.fillText(`${fromLabel} → ${toLabel}`, dims.w / 2, panelY + 640);
    }

    // Academy + date — footer line, smaller.
    ctx.fillStyle = '#6b7280';
    ctx.font = `500 ${Math.round(dims.w * 0.028)}px system-ui, sans-serif`;
    ctx.fillText(input.academyName, dims.w / 2, panelY + panelH - 140);
    ctx.fillText(input.date, dims.w / 2, panelY + panelH - 90);

    // Bottom-right discreet brand mark — establishes the card's
    // origin without overwhelming the celebration. Lowercase to keep
    // it ambient.
    ctx.fillStyle = '#9ca3af';
    ctx.font = '500 24px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('budojo', panelX + panelW - 40, panelY + panelH - 40);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    });
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
