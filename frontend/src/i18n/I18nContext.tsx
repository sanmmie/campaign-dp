import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Locale, DEFAULT_LOCALE } from '@deltadp/shared';
import { getTranslation, isValidLocale, I18nState } from './index';

interface I18nContextValue extends I18nState {}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = localStorage.getItem('deltadp-locale');
  if (stored && isValidLocale(stored)) {
    return stored as Locale;
  }
  const browserLang = navigator.language.split('-')[0];
  if (isValidLocale(browserLang)) {
    return browserLang as Locale;
  }
  return DEFAULT_LOCALE;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? getInitialLocale());

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('deltadp-locale', newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return getTranslation(locale, key, params);
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function useTranslation() {
  const { t, locale, setLocale } = useI18n();
  return { t, locale, setLocale };
}