import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zh from './zh';
import en from './en';

export const defaultNS = 'translation';

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: 'zh',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
