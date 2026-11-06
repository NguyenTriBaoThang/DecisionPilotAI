import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Preferences = { language: 'en' | 'vi'; currency: 'vnd' | 'compact' }
const defaults: Preferences = { language: 'en', currency: 'vnd' }
export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('dp-preferences') || '{}')
    return { language: value?.language === 'vi' ? 'vi' : 'en', currency: value?.currency === 'compact' ? 'compact' : 'vnd' }
  } catch { return defaults }
}
const translations: Record<string, string> = {
  'Overview': 'Tổng quan', 'Ask AI Copilot': 'Hỏi trợ lý AI', 'Anomaly Center': 'Trung tâm cảnh báo',
  'Forecast Center': 'Trung tâm dự báo', 'Scenario Simulator': 'Mô phỏng kịch bản',
  'Recommendations': 'Khuyến nghị', 'Data Sources': 'Nguồn dữ liệu', 'Settings': 'Cài đặt',
  'Executive Dashboard': 'Bảng điều hành', 'Executive Business Dashboard': 'Bảng điều hành kinh doanh',
  'Ask Business Data': 'Hỏi dữ liệu kinh doanh', 'Ask Your Business Data': 'Hỏi dữ liệu kinh doanh',
  'Interactive 3D Scenario Simulator': 'Mô phỏng kịch bản tương tác 3D',
  'Recommendations & Decision Audit': 'Khuyến nghị và lịch sử quyết định',
  'Data Sources & Integrity': 'Nguồn dữ liệu và tính toàn vẹn',
  'Settings & Workspace Preferences': 'Cài đặt không gian làm việc',
  'Financial Display & Localization': 'Hiển thị tài chính và ngôn ngữ',
  'Appearance & Theme': 'Giao diện và chủ đề', 'Save Preferences': 'Lưu tùy chọn',
  'Preferences Saved': 'Đã lưu tùy chọn', 'Import New Business Snapshot': 'Nhập bộ dữ liệu mới',
  'Model Artifact Lineage': 'Nguồn gốc mô hình', 'Decision Audit Trail': 'Lịch sử quyết định',
}
export const translate = (text: string, language: Preferences['language']) => language === 'vi' ? translations[text] || text : text
const Context = createContext({ preferences: defaults, save: (_value: Preferences) => {} })
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences)
  useEffect(() => { document.documentElement.lang = preferences.language }, [preferences.language])
  const save = (value: Preferences) => {
    localStorage.setItem('dp-preferences', JSON.stringify(value))
    document.documentElement.lang = value.language
    setPreferences(value)
  }
  return <Context.Provider value={{ preferences, save }}>{children}</Context.Provider>
}
export const usePreferences = () => useContext(Context)
