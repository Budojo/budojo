import type { TranslateService } from '@ngx-translate/core';
import type { PaymentMethod } from '../../core/services/payment.service';
import { PAYMENT_METHOD_KEYS, PAYMENT_METHODS } from './i18n-enum-keys';

export interface PaymentMethodOption {
  readonly label: string;
  readonly value: PaymentMethod;
}

/**
 * The "paid by" picker's options (#1761), in the owner's language. One list for
 * the mark-paid confirm and the carnet sale, so the two never name a method
 * differently. There is no "not recorded" option: the picker clears instead,
 * and an empty picker is what leaves the method unrecorded.
 */
export function paymentMethodOptions(translate: TranslateService): PaymentMethodOption[] {
  return PAYMENT_METHODS.map((method) => ({
    label: translate.instant(PAYMENT_METHOD_KEYS[method]),
    value: method,
  }));
}
