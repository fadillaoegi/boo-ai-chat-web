import { useEffect, useState } from 'react'
import type { AppLanguage } from './i18n'

export type Theme = 'light' | 'dark'

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Preferensi tampilan boleh hilang; aplikasi tetap berjalan.
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readPreference('boo-theme') === 'dark' ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    writePreference('boo-theme', theme)
  }, [theme])

  return [theme, setTheme] as const
}

export function useLanguage() {
  const [language, setLanguage] = useState<AppLanguage>(() => readPreference('boo-language') === 'id' ? 'id' : 'en')

  useEffect(() => {
    document.documentElement.lang = language
    writePreference('boo-language', language)
  }, [language])

  return [language, setLanguage] as const
}
