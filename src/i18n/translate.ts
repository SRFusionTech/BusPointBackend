import { Injectable, OnModuleInit } from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';

let fallback: I18nService | null = null;

/**
 * Translate a key from i18n.keys.ts in the current request's language
 * (Accept-Language / ?lang / x-lang). Outside a request it falls back to English.
 */
export function t(key: string, args?: Record<string, unknown>): string {
  const ctx = I18nContext.current();
  if (ctx) return ctx.t(key, { args }) as string;
  return fallback ? (fallback.translate(key, { lang: 'en', args }) as string) : key;
}

/** Hands the I18nService to `t()` for code that runs outside a request context. */
@Injectable()
export class I18nBridge implements OnModuleInit {
  constructor(private readonly i18n: I18nService) {}

  onModuleInit() {
    fallback = this.i18n;
  }
}
