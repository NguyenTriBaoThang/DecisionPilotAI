import { it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PreferencesProvider, readPreferences } from '../preferences'
import { SettingsPage } from '../components/SettingsPage'
import { money } from '../api'

it('saves preferences, applies formatting, and restores saved selections', () => {
  const view = render(<PreferencesProvider><SettingsPage dark setDark={() => {}} session={{ actor: 'tester', role: 'admin', authentication: 'local', import_enabled: false }} /></PreferencesProvider>)
  fireEvent.change(screen.getByLabelText('Currency Display Mode'), { target: { value: 'compact' } })
  fireEvent.change(screen.getByLabelText('Language for navigation, page titles and number formatting'), { target: { value: 'vi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
  expect(readPreferences()).toEqual({ language: 'vi', currency: 'compact' })
  expect(document.documentElement.lang).toBe('vi')
  expect(money(2_400_000)).not.toBe('₫2,400,000')
  view.unmount()
  render(<PreferencesProvider><SettingsPage dark setDark={() => {}} session={{ actor: 'tester', role: 'admin', authentication: 'local', import_enabled: false }} /></PreferencesProvider>)
  expect((screen.getByLabelText('Currency Display Mode') as HTMLSelectElement).value).toBe('compact')
  expect(screen.getByText('Cài đặt không gian làm việc')).toBeTruthy()
})

it('recovers from malformed or unsupported stored preferences', () => {
  localStorage.setItem('dp-preferences', '{broken')
  expect(readPreferences()).toEqual({ language: 'en', currency: 'vnd' })
  localStorage.setItem('dp-preferences', 'null')
  expect(readPreferences()).toEqual({ language: 'en', currency: 'vnd' })
})
