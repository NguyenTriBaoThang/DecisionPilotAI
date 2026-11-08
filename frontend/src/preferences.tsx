import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Preferences = { language: 'en' | 'vi'; currency: 'vnd' | 'compact' }

// Default to 'vi' for Vietnamese business innovation hackathon, with quick EN toggle
const defaults: Preferences = { language: 'vi', currency: 'vnd' }

export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('dp-preferences') || '{}')
    return {
      language: value?.language === 'en' ? 'en' : 'vi',
      currency: value?.currency === 'compact' ? 'compact' : 'vnd',
    }
  } catch {
    return defaults
  }
}

export const translations: Record<string, { vi: string; en: string }> = {
  // Navigation & Workflow
  'Overview': { vi: 'Tổng quan & Chẩn đoán', en: 'Overview & Diagnostics' },
  'Overview & Diagnostics': { vi: 'Tổng quan & Chẩn đoán', en: 'Overview & Diagnostics' },
  'Ask AI Copilot': { vi: 'Trợ lý AI Phân tích', en: 'Ask AI Copilot' },
  'Ask Business Data': { vi: 'Hỏi dữ liệu kinh doanh', en: 'Ask Business Data' },
  'Ask Your Business Data': { vi: 'Hỏi dữ liệu kinh doanh của bạn', en: 'Ask Your Business Data' },
  'Scenario Simulator': { vi: 'Mô phỏng Kịch bản 3D', en: '3D Scenario Simulator' },
  'Interactive 3D Scenario Simulator': { vi: 'Mô phỏng Kịch bản 3D Tương tác', en: 'Interactive 3D Scenario Simulator' },
  'Recommendations': { vi: 'Khuyến nghị & Quyết định', en: 'Actionable Recommendations' },
  'Actionable Recommendations': { vi: 'Khuyến nghị & Quyết định Chiến lược', en: 'Actionable Recommendations' },
  'Recommendations & Decision Audit': { vi: 'Khuyến nghị & Nhật ký Quyết định', en: 'Recommendations & Decision Audit' },
  'Data Sources': { vi: 'Nguồn dữ liệu', en: 'Data Sources' },
  'Settings': { vi: 'Cài đặt hệ thống', en: 'Settings' },

  // Workflow Stepper Steps
  'Step 1: Diagnostics': { vi: 'Bước 1: Chẩn đoán', en: 'Step 1: Diagnostics' },
  'Step 2: AI Investigation': { vi: 'Bước 2: Phân tích AI', en: 'Step 2: AI Investigation' },
  'Step 3: 3D Simulation': { vi: 'Bước 3: Mô phỏng 3D', en: 'Step 3: 3D Simulation' },
  'Step 4: Decisions': { vi: 'Bước 4: Ra quyết định', en: 'Step 4: Decisions' },
  'Monitor health & alerts': { vi: 'Giám sát sức khỏe & cảnh báo', en: 'Monitor health & alerts' },
  'Investigate root causes': { vi: 'Điều tra nguyên nhân gốc rễ', en: 'Investigate root causes' },
  'Test What-If scenarios': { vi: 'Thử nghiệm kịch bản What-If', en: 'Test What-If scenarios' },
  'Approve strategic actions': { vi: 'Phê duyệt hành động chiến lược', en: 'Approve strategic actions' },
  'End-to-End Decision Flow': { vi: 'Quy trình Ra quyết định Toàn diện (End-to-End)', en: 'End-to-End Decision Flow' },
  'Next Step': { vi: 'Bước tiếp theo', en: 'Next Step' },
  'Previous Step': { vi: 'Bước trước', en: 'Previous Step' },
  'Next: Investigate Root Causes with AI Copilot': { vi: 'Tiếp tục: Bước 2 - Điều tra nguyên nhân cùng AI Copilot', en: 'Next: Investigate Root Causes with AI Copilot' },
  'Next: Simulate What-If Scenarios in 3D': { vi: 'Tiếp tục: Bước 3 - Mô phỏng Kịch bản What-If trong không gian 3D', en: 'Next: Simulate What-If Scenarios in 3D' },
  'Next: Review & Approve AI Recommendations': { vi: 'Tiếp tục: Bước 4 - Phê duyệt Khuyến nghị Chiến lược', en: 'Next: Review & Approve AI Recommendations' },
  'Back to Overview & Diagnostics': { vi: 'Quay lại Bước 1: Tổng quan & Chẩn đoán', en: 'Back to Overview & Diagnostics' },
  'Back to AI Copilot Investigation': { vi: 'Quay lại Bước 2: Điều tra cùng AI Copilot', en: 'Back to AI Copilot Investigation' },
  'Back to 3D Scenario Simulator': { vi: 'Quay lại Bước 3: Mô phỏng Kịch bản 3D', en: 'Back to 3D Scenario Simulator' },
  'Decision Process Complete': { vi: 'Quy trình Ra quyết định Hoàn tất', en: 'Decision Process Complete' },

  // Hero Section
  'DECISION INTELLIGENCE PLATFORM': { vi: 'NỀN TẢNG TRÍ TUỆ RA QUYẾT ĐỊNH DOANH NGHIỆP', en: 'DECISION INTELLIGENCE PLATFORM' },
  'Your Business, Understood.': { vi: 'Thấu hiểu Doanh nghiệp. Dự báo Chuẩn xác. Quyết định Tự tin.', en: 'Your Business, Understood.' },
  'Turn complex business data into clear insights, accurate forecasts, and confident decisions.': {
    vi: 'Biến dữ liệu kinh doanh phức tạp thành hiểu biết rõ ràng, dự báo chuẩn xác và hành động tự tin.',
    en: 'Turn complex business data into clear insights, accurate forecasts, and confident decisions.',
  },
  'Simulate Scenarios': { vi: 'Mô phỏng Kịch bản', en: 'Simulate Scenarios' },
  'AI Core Active · Realtime': { vi: 'Lõi AI Hoạt động · Thời gian thực', en: 'AI Core Active · Realtime' },
  'Executive Intelligence Summary': { vi: 'Tóm tắt Trí tuệ Điều hành', en: 'Executive Intelligence Summary' },

  // KPI Metrics
  'Total Revenue': { vi: 'Tổng doanh thu', en: 'Total Revenue' },
  'Gross Profit': { vi: 'Lợi nhuận gộp', en: 'Gross Profit' },
  'Gross Margin': { vi: 'Biên lợi nhuận gộp', en: 'Gross Margin' },
  'Total Orders': { vi: 'Tổng đơn hàng', en: 'Total Orders' },
  'Active Customers': { vi: 'Khách hàng hoạt động', en: 'Active Customers' },
  'Marketing ROAS': { vi: 'Hiệu quả ROAS', en: 'Marketing ROAS' },
  'Physical Stock Availability': { vi: 'Tỷ lệ sẵn có kho hàng', en: 'Physical Stock Availability' },

  // Filters & Controls
  'Reporting Scope:': { vi: 'Phạm vi báo cáo:', en: 'Reporting Scope:' },
  'From': { vi: 'Từ ngày', en: 'From' },
  'To': { vi: 'Đến ngày', en: 'To' },
  'Category': { vi: 'Ngành hàng', en: 'Category' },
  'Region': { vi: 'Khu vực', en: 'Region' },
  'Sales Channel': { vi: 'Kênh bán hàng', en: 'Sales Channel' },
  'Product': { vi: 'Sản phẩm', en: 'Product' },
  'All categories': { vi: 'Tất cả ngành hàng', en: 'All categories' },
  'All regions': { vi: 'Tất cả khu vực', en: 'All regions' },
  'All channels': { vi: 'Tất cả kênh bán', en: 'All channels' },
  'All products': { vi: 'Tất cả sản phẩm', en: 'All products' },
  'Daily Grain': { vi: 'Theo ngày', en: 'Daily Grain' },
  'Weekly Grain': { vi: 'Theo tuần', en: 'Weekly Grain' },
  'Monthly Grain': { vi: 'Theo tháng', en: 'Monthly Grain' },
  'Grain': { vi: 'Chu kỳ', en: 'Grain' },

  // Charts & Sections
  'Revenue & Gross Profit Trend': { vi: 'Xu hướng Doanh thu & Lợi nhuận gộp', en: 'Revenue & Gross Profit Trend' },
  'Revenue': { vi: 'Doanh thu', en: 'Revenue' },
  'Active Anomaly Radar': { vi: 'Radar Cảnh báo Bất thường', en: 'Active Anomaly Radar' },
  'Ranked by severity & business impact': { vi: 'Xếp theo mức độ nghiêm trọng & tác động', en: 'Ranked by severity & business impact' },
  'Open Anomaly Radar Center': { vi: 'Xem chi tiết Trung tâm Cảnh báo', en: 'Open Anomaly Radar Center' },
  'Product Performance': { vi: 'Hiệu quả Sản phẩm', en: 'Product Performance' },
  'Top revenue generating SKUs': { vi: 'Top sản phẩm doanh thu cao nhất', en: 'Top revenue generating SKUs' },
  'Marketing Campaign Efficiency': { vi: 'Hiệu quả Chiến dịch Tiếp thị', en: 'Marketing Campaign Efficiency' },
  'Revenue by Region': { vi: 'Doanh thu theo Khu vực', en: 'Revenue by Region' },
  'Revenue by Sales Channel': { vi: 'Doanh thu theo Kênh bán', en: 'Revenue by Sales Channel' },
  'HCMC, Hanoi and Danang distribution': { vi: 'Phân bổ tại TP.HCM, Hà Nội và Đà Nẵng', en: 'HCMC, Hanoi and Danang distribution' },
  'Online, Retail and B2B channels': { vi: 'Kênh trực tuyến, Cửa hàng và B2B', en: 'Online, Retail and B2B channels' },
  'Product SKU': { vi: 'Mã SKU', en: 'Product SKU' },
  'Units Sold': { vi: 'Sản lượng bán', en: 'Units Sold' },
  'Marketing Channel': { vi: 'Kênh tiếp thị', en: 'Marketing Channel' },
  'Ad Spend': { vi: 'Chi tiêu QC', en: 'Ad Spend' },
  'ROAS': { vi: 'ROAS', en: 'ROAS' },
  'Orders': { vi: 'Đơn hàng', en: 'Orders' },
  'Channel': { vi: 'Kênh', en: 'Channel' },
  'New Customers': { vi: 'Khách hàng mới', en: 'New Customers' },
  'Returning Customers': { vi: 'Khách hàng quay lại', en: 'Returning Customers' },

  // Anomaly Alerts
  'Revenue decline': { vi: 'Doanh thu sụt giảm', en: 'Revenue decline' },
  'Gross margin pressure': { vi: 'Áp lực biên lợi nhuận', en: 'Gross margin pressure' },
  'Unusual sales volume': { vi: 'Sản lượng bán bất thường', en: 'Unusual sales volume' },
  'Facebook Ads spend spike': { vi: 'Chi tiêu Facebook Ads tăng vọt', en: 'Facebook Ads spend spike' },
  'Facebook Ads ROAS drop': { vi: 'ROAS Facebook Ads giảm mạnh', en: 'Facebook Ads ROAS drop' },
  'Facebook Ads conversion drop': { vi: 'Tỷ lệ chuyển đổi Facebook giảm', en: 'Facebook Ads conversion drop' },
  'Marketing spend anomaly': { vi: 'Chi tiêu tiếp thị bất thường', en: 'Marketing spend anomaly' },
  'Marketing ROAS drop': { vi: 'ROAS tiếp thị sụt giảm', en: 'Marketing ROAS drop' },
  'Marketing conversion drop': { vi: 'Chuyển đổi tiếp thị giảm', en: 'Marketing conversion drop' },
  'Stockout risk detected': { vi: 'Phát hiện nguy cơ đứt hàng', en: 'Stockout risk detected' },

  // Scenario Simulator 3D Tabs
  'Business Overview': { vi: 'Tổng quan Kinh doanh', en: 'Business Overview' },
  'Pricing & Discount': { vi: 'Giá bán & Chiết khấu', en: 'Pricing & Discount' },
  'Marketing Budget': { vi: 'Ngân sách Tiếp thị', en: 'Marketing Budget' },
  'Inventory Planning': { vi: 'Kế hoạch Tồn kho', en: 'Inventory Planning' },
  'AI Recommendations': { vi: 'Khuyến nghị từ AI', en: 'AI Recommendations' },
  'Financial baseline & 8 core KPIs': { vi: 'Cơ sở tài chính & 8 chỉ số KPI trọng yếu', en: 'Financial baseline & 8 core KPIs' },
  'Price elasticity simulation (0-20%)': { vi: 'Mô phỏng độ co giãn giá (0-20%)', en: 'Price elasticity simulation (0-20%)' },
  'ROAS & channel spend reallocation': { vi: 'ROAS & Tái phân bổ ngân sách theo kênh', en: 'ROAS & channel spend reallocation' },
  'Lead-time & stockout risk prevention': { vi: 'Thời gian nhập hàng & Phòng ngừa rủi ro đứt hàng', en: 'Lead-time & stockout risk prevention' },
  'Synthesized actions & human approval': { vi: 'Tổng hợp hành động & Phê duyệt của con người', en: 'Synthesized actions & human approval' },

  // Recommendations & Actions
  'Approve': { vi: 'Phê duyệt', en: 'Approve' },
  'Dismiss': { vi: 'Từ chối', en: 'Dismiss' },
  'Approved': { vi: 'Đã phê duyệt', en: 'Approved' },
  'Dismissed': { vi: 'Đã từ chối', en: 'Dismissed' },
  'Pending': { vi: 'Chờ xem xét', en: 'Pending' },
  'Estimated Revenue Upside': { vi: 'Doanh thu tăng thêm ước tính', en: 'Estimated Revenue Upside' },
  'Net Profit Impact': { vi: 'Tác động lợi nhuận ròng', en: 'Net Profit Impact' },
  'Confidence': { vi: 'Độ tin cậy', en: 'Confidence' },
  'Supporting Evidence': { vi: 'Căn cứ phân tích', en: 'Supporting Evidence' },
  'Risk Assessment': { vi: 'Đánh giá rủi ro', en: 'Risk Assessment' },

  // System & Shell
  'WORKSPACE': { vi: 'QUY TRÌNH RA QUYẾT ĐỊNH', en: 'DECISION WORKFLOW' },
  'SYSTEM': { vi: 'CẤU HÌNH HỆ THỐNG', en: 'SYSTEM SETTINGS' },
  'Demo Workspace': { vi: 'Không gian Demo', en: 'Demo Workspace' },
  'Imported Snapshot': { vi: 'Dữ liệu Doanh nghiệp', en: 'Imported Snapshot' },
  'DB Connected': { vi: 'Đã kết nối CSDL', en: 'DB Connected' },
  'Local Sandbox': { vi: 'Chế độ Cục bộ', en: 'Local Sandbox' },
  'Synthetic Demo': { vi: 'Dữ liệu Demo Mẫu', en: 'Synthetic Demo' },
  'Imported Data': { vi: 'Dữ liệu Đã nhập', en: 'Imported Data' },
  'Technical Docs': { vi: 'Tài liệu Kỹ thuật', en: 'Technical Docs' },
  'OpenAPI Swagger Reference': { vi: 'Tài liệu API Swagger', en: 'OpenAPI Swagger Reference' },
  'Product Showcase': { vi: 'Giới thiệu Sản phẩm', en: 'Product Showcase' },
  'Switch to light theme': { vi: 'Chuyển sang giao diện sáng', en: 'Switch to light theme' },
  'Switch to dark theme': { vi: 'Chuyển sang giao diện tối', en: 'Switch to dark theme' },
}

export function translate(text: string, language: Preferences['language']): string {
  if (!text) return text
  const entry = translations[text]
  if (entry) {
    return entry[language] || entry.en || text
  }
  return text
}

const Context = createContext({
  preferences: defaults,
  save: (_value: Preferences) => {},
  setLanguage: (_lang: 'vi' | 'en') => {},
})

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences)

  useEffect(() => {
    document.documentElement.lang = preferences.language
  }, [preferences.language])

  const save = (value: Preferences) => {
    localStorage.setItem('dp-preferences', JSON.stringify(value))
    document.documentElement.lang = value.language
    setPreferences(value)
  }

  const setLanguage = (language: 'vi' | 'en') => {
    save({ ...preferences, language })
  }

  return (
    <Context.Provider value={{ preferences, save, setLanguage }}>
      {children}
    </Context.Provider>
  )
}

export const usePreferences = () => useContext(Context)

// Quick helper hook for components
export function useT() {
  const { preferences, setLanguage } = usePreferences()
  const t = (text: string) => translate(text, preferences.language)
  return { t, language: preferences.language, setLanguage }
}
