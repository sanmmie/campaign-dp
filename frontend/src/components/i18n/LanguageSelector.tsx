import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { LOCALE_NAMES } from '../../i18n';
import { Locale, SUPPORTED_LOCALES } from '@deltadp/shared';

export function LanguageSelector() {
  const { locale, setLocale } = useTranslation();

  return (
    <div className="relative inline-block">
      <label htmlFor="language-select" className="sr-only">
        Select language
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent cursor-pointer"
        aria-label="Language"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_NAMES[loc]}
          </option>
        ))}
      </select>
    </div>
  );
}