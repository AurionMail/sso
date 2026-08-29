import i18next from 'i18next'
import { readable } from 'svelte/store'

import  en from '../../../locales/en/translation.json' with { type: 'json' }
import fr from '../../../locales/fr/translation.json' with { type: 'json' }

function getInitialLanguage(): string {
  const match = document.cookie.match(/(?:^|; )i18next=([^;]*)/)
  if (match) return match[1]
  return navigator.language.startsWith('fr') ? 'fr' : 'en'
}

i18next.init({
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  interpolation: {
    escapeValue: false,
  },
})

export const t = readable(i18next.t.bind(i18next), (set) => {
  const handleLanguageChange = () => set(i18next.t.bind(i18next))
  i18next.on('languageChanged', handleLanguageChange)
  return () => i18next.off('languageChanged', handleLanguageChange)
})