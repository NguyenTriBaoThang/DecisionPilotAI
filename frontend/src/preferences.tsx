import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type Preferences = { language: 'en' | 'vi'; currency: 'vnd' | 'compact' }

// Default preferences for workspace
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

  // Remaining workspace, analytics, scenario and system copy. These entries
  // are also used by the page localization observer for text rendered by
  // components that do not consume the language hook directly.
  'Decision Intelligence': { vi: 'Trí tuệ ra quyết định', en: 'Decision Intelligence' },
  'Open navigation': { vi: 'Mở thanh điều hướng', en: 'Open navigation' },
  'Close navigation': { vi: 'Đóng thanh điều hướng', en: 'Close navigation' },
  'Step': { vi: 'Bước', en: 'Step' },
  'Anomaly Center': { vi: 'Trung tâm bất thường', en: 'Anomaly Center' },
  'Forecast Center': { vi: 'Trung tâm dự báo', en: 'Forecast Center' },
  'Overview Mode': { vi: 'Chế độ tổng quan', en: 'Overview Mode' },
  'Focus Mode': { vi: 'Chế độ tập trung', en: 'Focus Mode' },
  'Compare Scenarios': { vi: 'So sánh kịch bản', en: 'Compare Scenarios' },
  'Previous holographic tab': { vi: 'Thẻ mô phỏng trước', en: 'Previous holographic tab' },
  'Next holographic tab': { vi: 'Thẻ mô phỏng tiếp theo', en: 'Next holographic tab' },
  'Interactive 3D Scenario Landscape': { vi: 'Mô hình so sánh kịch bản 3D', en: 'Interactive 3D Scenario Landscape' },
  'Height Metric:': { vi: 'Chỉ số chiều cao:', en: 'Height Metric:' },
  'Full Comparative Matrix (2D View)': { vi: 'Bảng so sánh đầy đủ (2D)', en: 'Full Comparative Matrix (2D View)' },
  'Validated Model Calculations': { vi: 'Kết quả tính toán đã kiểm chứng', en: 'Validated Model Calculations' },
  'Baseline KPI health & operations': { vi: 'Các chỉ số và tình hình vận hành hiện tại', en: 'Baseline KPI health & operations' },
  'Elasticity slider (0–20%)': { vi: 'Điều chỉnh mức chiết khấu (0–20%)', en: 'Elasticity slider (0–20%)' },
  'Channel spend & diminishing returns': { vi: 'Ngân sách kênh và hiệu quả giảm dần', en: 'Channel spend & diminishing returns' },
  'Lead-time & safety stock risk': { vi: 'Thời gian nhập hàng và mức tồn kho an toàn', en: 'Lead-time & safety stock risk' },
  'Optimized action & human approval': { vi: 'Hành động đề xuất và phê duyệt của người dùng', en: 'Optimized action & human approval' },
  'Physical SKU': { vi: 'Sản phẩm tồn kho', en: 'Physical SKU' },
  'Lead-Time Arrival Day': { vi: 'Ngày hàng về dự kiến', en: 'Lead-Time Arrival Day' },
  'Proposed Reorder Batch:': { vi: 'Số lượng đề xuất nhập thêm:', en: 'Proposed Reorder Batch:' },
  'Enforces supplier lead-time physical constraint': { vi: 'Tính đến thời gian giao hàng thực tế của nhà cung cấp', en: 'Enforces supplier lead-time physical constraint' },
  'Recommended Action:': { vi: 'Hành động đề xuất:', en: 'Recommended Action:' },
  'Simulated Demand': { vi: 'Nhu cầu mô phỏng', en: 'Simulated Demand' },
  'Unfulfilled Stockouts': { vi: 'Số lượng thiếu hàng', en: 'Unfulfilled Stockouts' },
  'Protected Profit': { vi: 'Lợi nhuận được bảo toàn', en: 'Protected Profit' },
  'Marketing Channel': { vi: 'Kênh tiếp thị', en: 'Marketing Channel' },
  'Optimization Target': { vi: 'Mục tiêu tối ưu', en: 'Optimization Target' },
  'Maximize Attributed Profit': { vi: 'Tối đa hóa lợi nhuận được ghi nhận', en: 'Maximize Attributed Profit' },
  'Maximize Attributed Revenue': { vi: 'Tối đa hóa doanh thu được ghi nhận', en: 'Maximize Attributed Revenue' },
  'Balance ROAS & Volume': { vi: 'Cân bằng ROAS và sản lượng', en: 'Balance ROAS & Volume' },
  'Proposed Budget Adjustment:': { vi: 'Điều chỉnh ngân sách đề xuất:', en: 'Proposed Budget Adjustment:' },
  'Baseline (0%)': { vi: 'Mốc hiện tại (0%)', en: 'Baseline (0%)' },
  'Diminishing returns model: Exponent α = 0.65': { vi: 'Mô hình hiệu quả giảm dần: số mũ α = 0,65', en: 'Diminishing returns model: Exponent α = 0.65' },
  'Recommended Reallocation:': { vi: 'Phương án phân bổ đề xuất:', en: 'Recommended Reallocation:' },
  'Attributed Orders': { vi: 'Đơn hàng được ghi nhận', en: 'Attributed Orders' },
  'Attributed Revenue': { vi: 'Doanh thu được ghi nhận', en: 'Attributed Revenue' },
  'Net Marketing Profit': { vi: 'Lợi nhuận ròng từ tiếp thị', en: 'Net Marketing Profit' },
  'Business Objective': { vi: 'Mục tiêu kinh doanh', en: 'Business Objective' },
  'Maximize Contribution Profit': { vi: 'Tối đa hóa lợi nhuận đóng góp', en: 'Maximize Contribution Profit' },
  'Maximize Revenue': { vi: 'Tối đa hóa doanh thu', en: 'Maximize Revenue' },
  'Balance Risk & Return': { vi: 'Cân bằng rủi ro và lợi nhuận', en: 'Balance Risk & Return' },
  'Proposed Discount Rate:': { vi: 'Mức giảm giá đề xuất:', en: 'Proposed Discount Rate:' },
  'Discount': { vi: 'giảm giá', en: 'Discount' },
  '0% (Full Price)': { vi: '0% (Giá niêm yết)', en: '0% (Full Price)' },
  '20% (Max Promo)': { vi: '20% (Khuyến mãi tối đa)', en: '20% (Max Promo)' },
  'Horizon:': { vi: 'Thời hạn dự báo:', en: 'Horizon:' },
  '7 Days': { vi: '7 ngày', en: '7 Days' },
  '30 Days': { vi: '30 ngày', en: '30 Days' },
  'Simulating…': { vi: 'Đang mô phỏng…', en: 'Simulating…' },
  'Simulate Price Impact': { vi: 'Mô phỏng tác động giá', en: 'Simulate Price Impact' },
  'Optimal Strategy:': { vi: 'Phương án tối ưu:', en: 'Optimal Strategy:' },
  'Expected Profit Delta:': { vi: 'Mức thay đổi lợi nhuận dự kiến:', en: 'Expected Profit Delta:' },
  'vs baseline.': { vi: 'so với mức hiện tại.', en: 'vs baseline.' },
  'Projected Revenue': { vi: 'Doanh thu dự kiến', en: 'Projected Revenue' },
  'Contribution Profit': { vi: 'Lợi nhuận đóng góp', en: 'Contribution Profit' },
  'Direct Cost Reconciled': { vi: 'Đã đối soát chi phí trực tiếp', en: 'Direct Cost Reconciled' },
  'Across 730 Days': { vi: 'Trong 730 ngày', en: 'Across 730 Days' },
  'Scenario recommendation': { vi: 'Đề xuất cho kịch bản', en: 'Scenario recommendation' },
  'STATUS:': { vi: 'TRẠNG THÁI:', en: 'STATUS:' },
  'Review strategy:': { vi: 'Xem xét phương án:', en: 'Review strategy:' },
  'Last completed scenario:': { vi: 'Kịch bản hoàn tất gần nhất:', en: 'Last completed scenario:' },
  'days': { vi: 'ngày', en: 'days' },
  'objective:': { vi: 'mục tiêu:', en: 'objective:' },
  'Estimates depend on the assumptions below. Recording a decision does not execute a business action.': { vi: 'Ước tính dựa trên các giả định bên dưới. Ghi nhận quyết định không đồng nghĩa hệ thống sẽ thực hiện hành động kinh doanh.', en: 'Estimates depend on the assumptions below. Recording a decision does not execute a business action.' },
  'Profit change': { vi: 'Thay đổi lợi nhuận', en: 'Profit change' },
  'Gross margin': { vi: 'Biên lợi nhuận gộp', en: 'Gross margin' },
  'Unavailable': { vi: 'Chưa có dữ liệu', en: 'Unavailable' },
  'Unfulfilled units': { vi: 'Số lượng chưa đáp ứng', en: 'Unfulfilled units' },
  'Not estimated': { vi: 'Chưa được ước tính', en: 'Not estimated' },
  'Scenario parameters and evidence': { vi: 'Thông số và căn cứ của kịch bản', en: 'Scenario parameters and evidence' },
  'Decision recorded:': { vi: 'Đã ghi nhận quyết định:', en: 'Decision recorded:' },
  'Audit event #': { vi: 'Mã sự kiện kiểm toán #', en: 'Audit event #' },
  'Accept scenario': { vi: 'Chấp nhận kịch bản', en: 'Accept scenario' },
  'Reject scenario': { vi: 'Từ chối kịch bản', en: 'Reject scenario' },
  'Recording decision…': { vi: 'Đang ghi nhận quyết định…', en: 'Recording decision…' },
  'An analyst or administrator must record decisions.': { vi: 'Cần quyền chuyên viên phân tích hoặc quản trị viên để ghi nhận quyết định.', en: 'An analyst or administrator must record decisions.' },
  'Run a scenario before recording a decision.': { vi: 'Hãy chạy mô phỏng trước khi ghi nhận quyết định.', en: 'Run a scenario before recording a decision.' },
  'Run a scenario to review its recommendation and record a decision.': { vi: 'Chạy mô phỏng để xem đề xuất và ghi nhận quyết định.', en: 'Run a scenario to review its recommendation and record a decision.' },
  'Scenario:': { vi: 'Kịch bản:', en: 'Scenario:' },
  'Accept': { vi: 'Chấp nhận', en: 'Accept' },
  'Reject': { vi: 'Từ chối', en: 'Reject' },
  'accepted': { vi: 'đã chấp nhận', en: 'accepted' },
  'rejected': { vi: 'đã từ chối', en: 'rejected' },
  'PENDING': { vi: 'ĐANG CHỜ', en: 'PENDING' },
  'ACCEPTED': { vi: 'ĐÃ CHẤP NHẬN', en: 'ACCEPTED' },
  'REJECTED': { vi: 'ĐÃ TỪ CHỐI', en: 'REJECTED' },
  'Scenario A (5% Discount)': { vi: 'Kịch bản A (giảm giá 5%)', en: 'Scenario A (5% Discount)' },
  'Scenario B (10% Discount)': { vi: 'Kịch bản B (giảm giá 10%)', en: 'Scenario B (10% Discount)' },
  'Baseline (0% Discount)': { vi: 'Mốc hiện tại (không giảm giá)', en: 'Baseline (0% Discount)' },
  'Observed': { vi: 'Thực tế', en: 'Observed' },
  'Projected contribution profit difference vs baseline:': { vi: 'Mức chênh lệch lợi nhuận đóng góp so với hiện tại:', en: 'Projected contribution profit difference vs baseline:' },
  'No active anomalies in the selected period.': { vi: 'Không phát hiện bất thường trong giai đoạn đã chọn.', en: 'No active anomalies in the selected period.' },
  'No alerts match the selected filters.': { vi: 'Không có cảnh báo phù hợp với bộ lọc đã chọn.', en: 'No alerts match the selected filters.' },
  'No active recommendations for the current snapshot.': { vi: 'Chưa có đề xuất cho bộ dữ liệu hiện tại.', en: 'No active recommendations for the current snapshot.' },
  'No records found.': { vi: 'Không tìm thấy bản ghi nào.', en: 'No records found.' },
  'No values match this selection.': { vi: 'Không có dữ liệu phù hợp với lựa chọn này.', en: 'No values match this selection.' },
  'Select an anomaly card from the left panel to inspect root causes and charts.': { vi: 'Chọn một cảnh báo ở khung bên trái để xem nguyên nhân và biểu đồ.', en: 'Select an anomaly card from the left panel to inspect root causes and charts.' },
  'Configure the forecast parameters above and click Run Forecast to generate projections.': { vi: 'Thiết lập thông số dự báo ở trên rồi chọn Chạy dự báo để xem kết quả.', en: 'Configure the forecast parameters above and click Run Forecast to generate projections.' },
  'Run Forecast': { vi: 'Chạy dự báo', en: 'Run Forecast' },
  'Run Scenario Simulation': { vi: 'Chạy mô phỏng kịch bản', en: 'Run Scenario Simulation' },
  'Loading data': { vi: 'Đang tải dữ liệu', en: 'Loading data' },
  'Loading evaluation evidence': { vi: 'Đang tải kết quả đánh giá', en: 'Loading evaluation evidence' },
  'Processing Analytics Stream…': { vi: 'Đang xử lý dữ liệu phân tích…', en: 'Processing Analytics Stream…' },
  'Analyzing business intelligence streams…': { vi: 'Đang phân tích dữ liệu kinh doanh…', en: 'Analyzing business intelligence streams…' },
  'Calculating ROAS…': { vi: 'Đang tính ROAS…', en: 'Calculating ROAS…' },
  'Data Sources & Integrity': { vi: 'Nguồn và tính toàn vẹn dữ liệu', en: 'Data Sources & Integrity' },
  'Review the active business dataset snapshot, schema contracts, record counts and import pipelines.': { vi: 'Kiểm tra bộ dữ liệu kinh doanh đang dùng, cấu trúc bảng, số lượng bản ghi và quy trình nhập dữ liệu.', en: 'Review the active business dataset snapshot, schema contracts, record counts and import pipelines.' },
  'Dataset Identity (SHA-256)': { vi: 'Mã định danh bộ dữ liệu (SHA-256)', en: 'Dataset Identity (SHA-256)' },
  'Connected snapshot through': { vi: 'Dữ liệu được cập nhật đến', en: 'Connected snapshot through' },
  'Data Sources:': { vi: 'Nguồn dữ liệu:', en: 'Data Sources:' },
  'Database Dialect': { vi: 'Hệ quản trị cơ sở dữ liệu', en: 'Database Dialect' },
  'Database readiness and model artifact bundle probe': { vi: 'Trạng thái cơ sở dữ liệu và gói mô hình', en: 'Database readiness and model artifact bundle probe' },
  'Reconciled Relational Schema': { vi: 'Cấu trúc dữ liệu quan hệ đã đối soát', en: 'Reconciled Relational Schema' },
  'All 6 date-indexed tables are verified against foreign keys, accounting formulas and stock balance.': { vi: 'Cả 6 bảng theo ngày đã được kiểm tra khóa liên kết, công thức tài chính và cân đối tồn kho.', en: 'All 6 date-indexed tables are verified against foreign keys, accounting formulas and stock balance.' },
  'Active Tables': { vi: 'Bảng đang hoạt động', en: 'Active Tables' },
  'Data Grain': { vi: 'Mức chi tiết dữ liệu', en: 'Data Grain' },
  'Verified Records': { vi: 'Bản ghi đã kiểm tra', en: 'Verified Records' },
  'Integrity Check': { vi: 'Kiểm tra tính toàn vẹn', en: 'Integrity Check' },
  'Table Name': { vi: 'Tên bảng', en: 'Table Name' },
  'Import New Business Snapshot': { vi: 'Nhập bộ dữ liệu kinh doanh mới', en: 'Import New Business Snapshot' },
  'Replace current dataset with a validated ZIP of 6 CSVs or a 6-sheet Excel workbook (.xlsx).': { vi: 'Thay bộ dữ liệu hiện tại bằng tệp ZIP gồm 6 CSV hoặc tệp Excel gồm 6 trang tính đã được kiểm tra.', en: 'Replace current dataset with a validated ZIP of 6 CSVs or a 6-sheet Excel workbook (.xlsx).' },
  'Import enforces atomic loading: if any row violates accounting balance (e.g. Sales Revenue ≠ Quantity × Price × (1 - Discount)) or breaks inventory movement, the entire upload is rejected with HTTP 422.': { vi: 'Dữ liệu được nhập toàn bộ hoặc không nhập: nếu có dòng sai công thức doanh thu hoặc luồng tồn kho, toàn bộ tệp sẽ bị từ chối (HTTP 422).', en: 'Import enforces atomic loading: if any row violates accounting balance (e.g. Sales Revenue ≠ Quantity × Price × (1 - Discount)) or breaks inventory movement, the entire upload is rejected with HTTP 422.' },
  'Security Import Token (X-Import-Token)': { vi: 'Mã bảo mật nhập dữ liệu (X-Import-Token)', en: 'Security Import Token (X-Import-Token)' },
  'Enter IMPORT_TOKEN from server .env': { vi: 'Nhập IMPORT_TOKEN trong tệp .env của máy chủ', en: 'Enter IMPORT_TOKEN from server .env' },
  'Business snapshot file': { vi: 'Tệp dữ liệu kinh doanh', en: 'Business snapshot file' },
  'Drag and drop business.zip or business.xlsx here': { vi: 'Kéo thả business.zip hoặc business.xlsx vào đây', en: 'Drag and drop business.zip or business.xlsx here' },
  'Maximum file size: 40 MiB': { vi: 'Dung lượng tối đa: 40 MiB', en: 'Maximum file size: 40 MiB' },
  'I understand that importing replaces the active business data. Existing decision history is retained.': { vi: 'Tôi hiểu rằng nhập dữ liệu sẽ thay bộ dữ liệu kinh doanh hiện tại. Lịch sử quyết định vẫn được giữ lại.', en: 'I understand that importing replaces the active business data. Existing decision history is retained.' },
  'Import is disabled on this server.': { vi: 'Máy chủ này đang tắt chức năng nhập dữ liệu.', en: 'Import is disabled on this server.' },
  'An administrator role is required to replace data.': { vi: 'Cần quyền quản trị viên để thay dữ liệu.', en: 'An administrator role is required to replace data.' },
  'Ready to accept validated snapshots.': { vi: 'Sẵn sàng nhận bộ dữ liệu đã kiểm tra.', en: 'Ready to accept validated snapshots.' },
  'Validating and importing…': { vi: 'Đang kiểm tra và nhập dữ liệu…', en: 'Validating and importing…' },
  'Replace snapshot': { vi: 'Thay bộ dữ liệu', en: 'Replace snapshot' },
  'Model Artifact Lineage': { vi: 'Nguồn gốc phiên bản mô hình', en: 'Model Artifact Lineage' },
  'Trained models are pinned to the active dataset SHA-256 identifier.': { vi: 'Mô hình được gắn với mã SHA-256 của bộ dữ liệu đang hoạt động.', en: 'Trained models are pinned to the active dataset SHA-256 identifier.' },
  'Forecasting Model Bundle:': { vi: 'Gói mô hình dự báo:', en: 'Forecasting Model Bundle:' },
  'No matching trained artifact': { vi: 'Không có mô hình đã huấn luyện phù hợp', en: 'No matching trained artifact' },
  'Model Readiness:': { vi: 'Trạng thái mô hình:', en: 'Model Readiness:' },
  'READY FOR INFERENCE': { vi: 'SẴN SÀNG DỰ BÁO', en: 'READY FOR INFERENCE' },
  'TRAINING REQUIRED': { vi: 'CẦN HUẤN LUYỆN', en: 'TRAINING REQUIRED' },
  'Anomaly Radar Engine:': { vi: 'Mô hình phát hiện bất thường:', en: 'Anomaly Radar Engine:' },
  'What-If Simulation Engine:': { vi: 'Công cụ mô phỏng kịch bản:', en: 'What-If Simulation Engine:' },
  'Intent Routing Abstraction:': { vi: 'Bộ phân loại câu hỏi:', en: 'Intent Routing Abstraction:' },
  'Google Gemini / OpenAI / Local Rule-based': { vi: 'Google Gemini / OpenAI / luật xử lý cục bộ', en: 'Google Gemini / OpenAI / Local Rule-based' },
  'Forecast reliability': { vi: 'Độ tin cậy dự báo', en: 'Forecast reliability' },
  'Model evidence & limitations': { vi: 'Căn cứ và giới hạn của mô hình', en: 'Model evidence & limitations' },
  'Compare baseline and LightGBM forecasts using historical holdout errors and empirical prediction intervals.': { vi: 'So sánh dự báo cơ sở với LightGBM bằng sai số trên dữ liệu kiểm thử và khoảng dự báo thực nghiệm.', en: 'Compare baseline and LightGBM forecasts using historical holdout errors and empirical prediction intervals.' },
  'LightGBM must beat the better baseline by >2% validation MAE to be chosen': { vi: 'Chỉ chọn LightGBM nếu sai số MAE trên tập xác thực thấp hơn mô hình cơ sở tốt nhất trên 2%.', en: 'LightGBM must beat the better baseline by >2% validation MAE to be chosen' },
  'Ask about revenue trends, margin pressure, product popularity, marketing ROAS or run a 30-day forecast.': { vi: 'Hỏi về xu hướng doanh thu, biên lợi nhuận, sản phẩm bán chạy, ROAS tiếp thị hoặc yêu cầu dự báo 30 ngày.', en: 'Ask about revenue trends, margin pressure, product popularity, marketing ROAS or run a 30-day forecast.' },
  'Ask complex business questions in natural language. Inspect executed analytics tools, formulas, data bounds and evidence.': { vi: 'Đặt câu hỏi kinh doanh bằng ngôn ngữ tự nhiên; xem công cụ, công thức, phạm vi dữ liệu và căn cứ được dùng.', en: 'Ask complex business questions in natural language. Inspect executed analytics tools, formulas, data bounds and evidence.' },
  'Ask questions in natural language. The system extracts typed intent and queries deterministic analytics tools rather than hallucinating answers.': { vi: 'Đặt câu hỏi bằng ngôn ngữ tự nhiên. Hệ thống xác định ý định rồi truy vấn công cụ phân tích để lấy số liệu có căn cứ.', en: 'Ask questions in natural language. The system extracts typed intent and queries deterministic analytics tools rather than hallucinating answers.' },
  'Ask about revenue, SKU margins, marketing ROAS, or demand forecasts…': { vi: 'Hỏi về doanh thu, biên lợi nhuận SKU, ROAS tiếp thị hoặc dự báo nhu cầu…', en: 'Ask about revenue, SKU margins, marketing ROAS, or demand forecasts…' },
  'Business question': { vi: 'Câu hỏi kinh doanh', en: 'Business question' },
  'Breakdown Dimension': { vi: 'Chiều phân tích', en: 'Breakdown Dimension' },
  'Select': { vi: 'Chọn', en: 'Select' },
  'Entire Business': { vi: 'Toàn doanh nghiệp', en: 'Entire Business' },
  'Current Period': { vi: 'Kỳ hiện tại', en: 'Current Period' },
  'Previous Period': { vi: 'Kỳ trước', en: 'Previous Period' },
  'High Priority': { vi: 'Ưu tiên cao', en: 'High Priority' },
  'Medium Priority': { vi: 'Ưu tiên trung bình', en: 'Medium Priority' },
  'High Priority Alerts': { vi: 'Cảnh báo ưu tiên cao', en: 'High Priority Alerts' },
  'Medium Priority Alerts': { vi: 'Cảnh báo ưu tiên trung bình', en: 'Medium Priority Alerts' },
  'All Severities': { vi: 'Tất cả mức độ', en: 'All Severities' },
  'Latest events': { vi: 'Sự kiện mới nhất', en: 'Latest events' },
  'Older events': { vi: 'Sự kiện trước đó', en: 'Older events' },
  'Decision Audit Trail': { vi: 'Lịch sử kiểm toán quyết định', en: 'Decision Audit Trail' },
  'Append-only record of executive human decisions. Times in Asia/Ho_Chi_Minh (UTC+7)': { vi: 'Nhật ký chỉ ghi nối tiếp các quyết định của người quản lý. Múi giờ Asia/Ho_Chi_Minh (UTC+7).', en: 'Append-only record of executive human decisions. Times in Asia/Ho_Chi_Minh (UTC+7)' },
  'Decision subject': { vi: 'Đối tượng quyết định', en: 'Decision subject' },
  'Decision type': { vi: 'Loại quyết định', en: 'Decision type' },
  'Recorded Human Decision': { vi: 'Quyết định đã ghi nhận', en: 'Recorded Human Decision' },
  'Review Assumptions, Risks and Supporting Evidence': { vi: 'Xem xét giả định, rủi ro và căn cứ', en: 'Review Assumptions, Risks and Supporting Evidence' },
  'Review business evidence and record decisions against the active dataset. Decision history is protected against ordinary database updates and deletes.': { vi: 'Xem căn cứ kinh doanh và ghi nhận quyết định cho bộ dữ liệu hiện tại. Lịch sử được bảo vệ khỏi thao tác sửa hoặc xóa thông thường.', en: 'Review business evidence and record decisions against the active dataset. Decision history is protected against ordinary database updates and deletes.' },
  'Accept Recommendation': { vi: 'Chấp nhận đề xuất', en: 'Accept Recommendation' },
  'Insufficient evidence': { vi: 'Chưa đủ căn cứ', en: 'Insufficient evidence' },
  'Evidence status': { vi: 'Trạng thái căn cứ', en: 'Evidence status' },
  'Estimated Impact': { vi: 'Tác động ước tính', en: 'Estimated Impact' },
  'Proposed Action:': { vi: 'Hành động đề xuất:', en: 'Proposed Action:' },
  'No active dataset': { vi: 'Chưa có bộ dữ liệu hoạt động', en: 'No active dataset' },
  'No active snapshot': { vi: 'Chưa có bản dữ liệu đang hoạt động', en: 'No active snapshot' },
  'Awaiting import': { vi: 'Đang chờ nhập dữ liệu', en: 'Awaiting import' },
  'Critical Alerts': { vi: 'Cảnh báo nghiêm trọng', en: 'Critical Alerts' },
  'Anomaly Radar Engine': { vi: 'Mô hình phát hiện bất thường', en: 'Anomaly Radar Engine' },
  'Forecast Bias': { vi: 'Độ lệch dự báo', en: 'Forecast Bias' },
  'Feature Driver': { vi: 'Yếu tố ảnh hưởng', en: 'Feature Driver' },
  'Selected Model Test WAPE': { vi: 'WAPE kiểm thử của mô hình được chọn', en: 'Selected Model Test WAPE' },
  'Selected Model:': { vi: 'Mô hình được chọn:', en: 'Selected Model:' },
  'Prediction Coverage': { vi: 'Độ bao phủ dự báo', en: 'Prediction Coverage' },
  'Predicted Mean': { vi: 'Giá trị trung bình dự báo', en: 'Predicted Mean' },
  'Forecast Horizon': { vi: 'Khoảng thời gian dự báo', en: 'Forecast Horizon' },
  'Multi-Day Projection': { vi: 'Dự báo nhiều ngày', en: 'Multi-Day Projection' },
  'Range:': { vi: 'Khoảng:', en: 'Range:' },
  'Days Horizon ·': { vi: 'Số ngày dự báo ·', en: 'Days Horizon ·' },
  '30 Days Forward': { vi: 'Dự báo 30 ngày tới', en: '30 Days Forward' },
  '7 Days Forward': { vi: 'Dự báo 7 ngày tới', en: '7 Days Forward' },
  '90% nominal daily prediction band · verify observed coverage above': { vi: 'Khoảng dự báo danh nghĩa 90% theo ngày · xem độ bao phủ thực tế ở trên', en: '90% nominal daily prediction band · verify observed coverage above' },
  'Calendar Days': { vi: 'Ngày theo lịch', en: 'Calendar Days' },
  'Demand Units': { vi: 'Nhu cầu (sản phẩm)', en: 'Demand Units' },
  'Safety Stock Threshold': { vi: 'Ngưỡng tồn kho an toàn', en: 'Safety Stock Threshold' },
  'Confirmed Arrival Day': { vi: 'Ngày nhận hàng đã xác nhận', en: 'Confirmed Arrival Day' },
  'Confirmed Incoming Units': { vi: 'Số lượng hàng sắp về đã xác nhận', en: 'Confirmed Incoming Units' },
  '0 (No replenishment)': { vi: '0 (Không nhập thêm)', en: '0 (No replenishment)' },
  '500 Units': { vi: '500 sản phẩm', en: '500 Units' },
  'Fulfillment Capacity': { vi: 'Khả năng đáp ứng đơn hàng', en: 'Fulfillment Capacity' },
  'Fulfillment capacity:': { vi: 'Khả năng đáp ứng đơn hàng:', en: 'Fulfillment capacity:' },
  'Outcomes tested under alternate elasticity paths': { vi: 'Kết quả khi thử các mức co giãn giá khác nhau', en: 'Outcomes tested under alternate elasticity paths' },
  'Historical Baseline': { vi: 'Mốc lịch sử', en: 'Historical Baseline' },
  'Historical Observations': { vi: 'Dữ liệu lịch sử', en: 'Historical Observations' },
  'Historical operations provide the unconstrained baseline for simulation. Use adjacent panels to simulate promotional pricing elasticity, reallocate ad spend, or evaluate inventory lead-time shocks.': { vi: 'Dữ liệu lịch sử làm mốc cơ sở cho mô phỏng. Dùng các thẻ bên cạnh để thử giá khuyến mãi, phân bổ ngân sách quảng cáo hoặc đánh giá thay đổi thời gian nhập hàng.', en: 'Historical operations provide the unconstrained baseline for simulation. Use adjacent panels to simulate promotional pricing elasticity, reallocate ad spend, or evaluate inventory lead-time shocks.' },
  'Business Risk:': { vi: 'Rủi ro kinh doanh:', en: 'Business Risk:' },
  'Business Purpose': { vi: 'Mục tiêu kinh doanh', en: 'Business Purpose' },
  'Assumed Value': { vi: 'Giá trị giả định', en: 'Assumed Value' },
  'Deviation Rate': { vi: 'Tỷ lệ sai lệch', en: 'Deviation Rate' },
  'Absolute Delta': { vi: 'Mức chênh lệch tuyệt đối', en: 'Absolute Delta' },
  'Gain Importance': { vi: 'Mức độ quan trọng theo Gain', en: 'Gain Importance' },
  'Global feature importance gain': { vi: 'Mức độ quan trọng của đặc trưng trên toàn mô hình', en: 'Global feature importance gain' },
  'Features': { vi: 'Đặc trưng', en: 'Features' },
  'Key Foreign Keys': { vi: 'Các khóa liên kết chính', en: 'Key Foreign Keys' },
  'Primary Key': { vi: 'Khóa chính', en: 'Primary Key' },
  'Date Range Boundary': { vi: 'Giới hạn khoảng thời gian', en: 'Date Range Boundary' },
  'Row Volume': { vi: 'Số dòng dữ liệu', en: 'Row Volume' },
  'Pipeline Quality Status': { vi: 'Trạng thái chất lượng quy trình dữ liệu', en: 'Pipeline Quality Status' },
  'Model Feature Drivers': { vi: 'Các đặc trưng ảnh hưởng đến mô hình', en: 'Model Feature Drivers' },
  'Objective Function': { vi: 'Hàm mục tiêu', en: 'Objective Function' },
  'Formula:': { vi: 'Công thức:', en: 'Formula:' },
  'Mathematical boundaries': { vi: 'Giới hạn của mô hình toán học', en: 'Mathematical boundaries' },
  'Mode:': { vi: 'Chế độ:', en: 'Mode:' },
  'Height represents:': { vi: 'Chiều cao biểu thị:', en: 'Height represents:' },
  'BASELINE': { vi: 'MỐC CƠ SỞ', en: 'BASELINE' },
  'RECOMMENDED': { vi: 'ĐỀ XUẤT', en: 'RECOMMENDED' },
  'ACTIVE': { vi: 'ĐANG HOẠT ĐỘNG', en: 'ACTIVE' },
  'SELECT': { vi: 'CHỌN', en: 'SELECT' },
  'SIGNATURE DECISION SIMULATOR': { vi: 'CÔNG CỤ MÔ PHỎNG QUYẾT ĐỊNH', en: 'SIGNATURE DECISION SIMULATOR' },
  'FUTURISTIC 3D DECISION INTELLIGENCE': { vi: 'MÔ PHỎNG TRÍ TUỆ RA QUYẾT ĐỊNH 3D', en: 'FUTURISTIC 3D DECISION INTELLIGENCE' },
  'HUMAN-IN-THE-LOOP DECISION INTELLIGENCE': { vi: 'TRÍ TUỆ RA QUYẾT ĐỊNH CÓ GIÁM SÁT CỦA CON NGƯỜI', en: 'HUMAN-IN-THE-LOOP DECISION INTELLIGENCE' },
  'PREDICTIVE INTELLIGENCE': { vi: 'TRÍ TUỆ DỰ BÁO', en: 'PREDICTIVE INTELLIGENCE' },
  'RISK RADAR & ANOMALY DETECTION': { vi: 'PHÁT HIỆN RỦI RO VÀ BẤT THƯỜNG', en: 'RISK RADAR & ANOMALY DETECTION' },
  'DATA ARCHITECTURE': { vi: 'KIẾN TRÚC DỮ LIỆU', en: 'DATA ARCHITECTURE' },
  'ENGINEERING & DATA SCIENCE BLUEPRINT': { vi: 'TỔNG QUAN KỸ THUẬT VÀ KHOA HỌC DỮ LIỆU', en: 'ENGINEERING & DATA SCIENCE BLUEPRINT' },
  'CONVERSATIONAL BUSINESS INTELLIGENCE': { vi: 'TRỢ LÝ HỘI THOẠI PHÂN TÍCH KINH DOANH', en: 'CONVERSATIONAL BUSINESS INTELLIGENCE' },
  'DecisionPilot Holographic Core (Interactive WebGL)': { vi: 'Lõi mô phỏng DecisionPilot (WebGL tương tác)', en: 'DecisionPilot Holographic Core (Interactive WebGL)' },
  '3D Holographic AI Data Sphere': { vi: 'Khối cầu dữ liệu AI 3D', en: '3D Holographic AI Data Sphere' },
  'Fullscreen 3D': { vi: 'Toàn màn hình 3D', en: 'Fullscreen 3D' },
  'Exit Fullscreen': { vi: 'Thoát toàn màn hình', en: 'Exit Fullscreen' },
  'Connect Data': { vi: 'Kết nối dữ liệu', en: 'Connect Data' },
  'Launch Workspace': { vi: 'Mở không gian làm việc', en: 'Launch Workspace' },
  'Explore Demo': { vi: 'Xem bản demo', en: 'Explore Demo' },
  'Discover Features': { vi: 'Khám phá tính năng', en: 'Discover Features' },
  'Enterprise Capabilities': { vi: 'Năng lực dành cho doanh nghiệp', en: 'Enterprise Capabilities' },
  'API Endpoint:': { vi: 'Điểm cuối API:', en: 'API Endpoint:' },
  'OpenAPI Spec:': { vi: 'Đặc tả OpenAPI:', en: 'OpenAPI Spec:' },
  'Operator Role & Access': { vi: 'Vai trò và quyền truy cập', en: 'Operator Role & Access' },
  'Active Profile:': { vi: 'Hồ sơ đang dùng:', en: 'Active Profile:' },
  'Workspace Mode:': { vi: 'Chế độ không gian làm việc:', en: 'Workspace Mode:' },
  'Audit Trail Logging:': { vi: 'Ghi nhật ký kiểm toán:', en: 'Audit Trail Logging:' },
  'Enabled (Append-Only)': { vi: 'Đang bật (chỉ ghi nối tiếp)', en: 'Enabled (Append-Only)' },
  'AUTHENTICATED WORKSPACE': { vi: 'KHÔNG GIAN ĐÃ XÁC THỰC', en: 'AUTHENTICATED WORKSPACE' },
  'LOCAL DEMO · NO SIGN IN': { vi: 'BẢN DEMO CỤC BỘ · KHÔNG CẦN ĐĂNG NHẬP', en: 'LOCAL DEMO · NO SIGN IN' },
  'System Diagnostics & Telemetry': { vi: 'Chẩn đoán hệ thống', en: 'System Diagnostics & Telemetry' },
  'Backend health and ML inference pipelines.': { vi: 'Trạng thái backend và quy trình suy luận của mô hình.', en: 'Backend health and ML inference pipelines.' },
  'See active version in Data Sources': { vi: 'Xem phiên bản đang dùng tại Nguồn dữ liệu', en: 'See active version in Data Sources' },
  'Financial Display & Localization': { vi: 'Hiển thị tài chính và ngôn ngữ', en: 'Financial Display & Localization' },
  'Configure currency unit, timezone, and number formatting.': { vi: 'Thiết lập đơn vị tiền tệ, múi giờ và định dạng số.', en: 'Configure currency unit, timezone, and number formatting.' },
  'Currency Display Mode': { vi: 'Cách hiển thị tiền tệ', en: 'Currency Display Mode' },
  'Vietnamese Dong (₫ VND Integer)': { vi: 'Đồng Việt Nam (₫ VND, số nguyên)', en: 'Vietnamese Dong (₫ VND Integer)' },
  'Compact Formatted (₫2.4M / ₫1.8B)': { vi: 'Định dạng rút gọn (₫2,4M / ₫1,8B)', en: 'Compact Formatted (₫2.4M / ₫1.8B)' },
  'Language for navigation, page titles and number formatting': { vi: 'Ngôn ngữ điều hướng, tiêu đề trang và định dạng số', en: 'Language for navigation, page titles and number formatting' },
  'English (Official Competition Language)': { vi: 'Tiếng Anh (ngôn ngữ chính thức của cuộc thi)', en: 'English (Official Competition Language)' },
  'Tiếng Việt (Vietnamese SME Context)': { vi: 'Tiếng Việt (bối cảnh doanh nghiệp Việt Nam)', en: 'Tiếng Việt (Vietnamese SME Context)' },
  'Appearance & Theme': { vi: 'Giao diện và chủ đề', en: 'Appearance & Theme' },
  'Switch between Dark First Enterprise Theme and Crisp Light Mode.': { vi: 'Chuyển giữa giao diện tối cho doanh nghiệp và giao diện sáng.', en: 'Switch between Dark First Enterprise Theme and Crisp Light Mode.' },
  'Deep Space Dark': { vi: 'Tối không gian sâu', en: 'Deep Space Dark' },
  'Default for executive BI': { vi: 'Mặc định cho bảng điều hành', en: 'Default for executive BI' },
  'Crisp Light': { vi: 'Sáng rõ', en: 'Crisp Light' },
  'High-contrast daytime view': { vi: 'Giao diện ban ngày có độ tương phản cao', en: 'High-contrast daytime view' },
  'Settings & Workspace Preferences': { vi: 'Cài đặt và tùy chọn không gian làm việc', en: 'Settings & Workspace Preferences' },
  'Manage appearance, interface defaults, business currency display, and workspace diagnostics.': { vi: 'Quản lý giao diện, tùy chọn mặc định, cách hiển thị tiền tệ và thông tin chẩn đoán.', en: 'Manage appearance, interface defaults, business currency display, and workspace diagnostics.' },
  'Preferences could not be saved. Check browser storage permissions.': { vi: 'Không thể lưu tùy chọn. Hãy kiểm tra quyền lưu trữ của trình duyệt.', en: 'Preferences could not be saved. Check browser storage permissions.' },
  'Save Preferences': { vi: 'Lưu tùy chọn', en: 'Save Preferences' },
  'Preferences Saved': { vi: 'Đã lưu tùy chọn', en: 'Preferences Saved' },
  'Sign out': { vi: 'Đăng xuất', en: 'Sign out' },
  'DecisionPilot AI · AI for Business Innovation 2026 · Single-workspace Local-first Architecture': { vi: 'DecisionPilot AI · AI for Business Innovation 2026 · Kiến trúc cục bộ cho một không gian làm việc', en: 'DecisionPilot AI · AI for Business Innovation 2026 · Single-workspace Local-first Architecture' },
  'AI for Business Innovation 2026 · LIKELION': { vi: 'AI for Business Innovation 2026 · LIKELION', en: 'AI for Business Innovation 2026 · LIKELION' },
  'Analyze performance, uncover hidden risks, forecast what’s next, and simulate smarter decisions — powered by explainable AI for SMEs.': { vi: 'Phân tích hiệu quả, nhận diện rủi ro, dự báo xu hướng và mô phỏng quyết định với AI có thể giải thích cho doanh nghiệp vừa và nhỏ.', en: 'Analyze performance, uncover hidden risks, forecast what’s next, and simulate smarter decisions — powered by explainable AI for SMEs.' },
  'From fragmented transactions to grounded executive actions with human-in-the-loop oversight.': { vi: 'Kết nối dữ liệu rời rạc thành hành động có căn cứ, với người quản lý giám sát quyết định.', en: 'From fragmented transactions to grounded executive actions with human-in-the-loop oversight.' },
  'Not a generic dashboard or an ungrounded chatbot. An integrated decision-support engine.': { vi: 'Không chỉ là bảng điều khiển hay chatbot chung chung, mà là công cụ hỗ trợ ra quyết định dựa trên dữ liệu.', en: 'Not a generic dashboard or an ungrounded chatbot. An integrated decision-support engine.' },
  'Experience the future of SME decision intelligence with live FastAPI backend, React 19 frontend, and LightGBM models.': { vi: 'Khám phá công cụ hỗ trợ quyết định cho SME với backend FastAPI, giao diện React 19 và mô hình LightGBM.', en: 'Experience the future of SME decision intelligence with live FastAPI backend, React 19 frontend, and LightGBM models.' },
  'Complete system architecture, machine learning pipelines, microeconomic foundations, and API specifications for DecisionPilot AI.': { vi: 'Tài liệu về kiến trúc hệ thống, quy trình học máy, cơ sở mô phỏng kinh tế và đặc tả API của DecisionPilot AI.', en: 'Complete system architecture, machine learning pipelines, microeconomic foundations, and API specifications for DecisionPilot AI.' },
  'Natural language inquiry with constrained SQL drilldown and trace': { vi: 'Hỏi bằng ngôn ngữ tự nhiên, truy vấn SQL có giới hạn và xem dấu vết xử lý', en: 'Natural language inquiry with constrained SQL drilldown and trace' },
  'Ask → Detect → Explain → Forecast → Simulate → Decide': { vi: 'Hỏi → Phát hiện → Giải thích → Dự báo → Mô phỏng → Quyết định', en: 'Ask → Detect → Explain → Forecast → Simulate → Decide' },
  'What would you like to understand?': { vi: 'Bạn muốn tìm hiểu điều gì?', en: 'What would you like to understand?' },
  'Suggested Queries': { vi: 'Câu hỏi gợi ý', en: 'Suggested Queries' },
  'Send': { vi: 'Gửi', en: 'Send' },
  'Analysis Conversation': { vi: 'Trao đổi phân tích', en: 'Analysis Conversation' },
  'Investigate causes with AI Copilot': { vi: 'Tìm nguyên nhân cùng Trợ lý AI', en: 'Investigate causes with AI Copilot' },
  'Simulate Budget Shift': { vi: 'Mô phỏng điều chỉnh ngân sách', en: 'Simulate Budget Shift' },
  'Simulate Stockout Risk': { vi: 'Mô phỏng rủi ro thiếu hàng', en: 'Simulate Stockout Risk' },
  'Simulating Stock…': { vi: 'Đang mô phỏng tồn kho…', en: 'Simulating Stock…' },
  'Simulation Outcome Comparison Matrix': { vi: 'Bảng so sánh kết quả mô phỏng', en: 'Simulation Outcome Comparison Matrix' },
  'Test price discounts, ad budget shifts, and lead-time bottlenecks with microeconomic price elasticity formulas and physical stock constraints.': { vi: 'Thử các mức giảm giá, điều chỉnh ngân sách quảng cáo và thay đổi thời gian nhập hàng bằng công thức co giãn giá, có xét giới hạn tồn kho thực tế.', en: 'Test price discounts, ad budget shifts, and lead-time bottlenecks with microeconomic price elasticity formulas and physical stock constraints.' },
  'Adjust parameters to simulate market elasticity and fulfillment bottlenecks': { vi: 'Điều chỉnh thông số để mô phỏng độ nhạy giá và giới hạn đáp ứng đơn hàng', en: 'Adjust parameters to simulate market elasticity and fulfillment bottlenecks' },
  'Simulate business strategies, understand trade-offs and choose the path that fits your goals before taking action.': { vi: 'Mô phỏng các phương án kinh doanh, xem điểm đánh đổi và chọn hướng phù hợp trước khi hành động.', en: 'Simulate business strategies, understand trade-offs and choose the path that fits your goals before taking action.' },
  'How DecisionPilot AI Works': { vi: 'DecisionPilot AI hoạt động như thế nào', en: 'How DecisionPilot AI Works' },
  'How It Works': { vi: 'Cách hoạt động', en: 'How It Works' },
  'The Intelligence Loop': { vi: 'Chu trình phân tích và ra quyết định', en: 'The Intelligence Loop' },
  'That Thinks Ahead.': { vi: 'Chủ động nhìn về phía trước.', en: 'That Thinks Ahead.' },
  'Turn Data Into Confident Decisions.': { vi: 'Biến dữ liệu thành quyết định tự tin.', en: 'Turn Data Into Confident Decisions.' },
  'Explore Decisions Before Making Them · Holographic AI control center with floating interactive scenario tabs and real microeconomic simulation.': { vi: 'Thử các phương án trước khi hành động · Trung tâm mô phỏng AI 3D với các thẻ tương tác và mô hình kinh tế thực tế.', en: 'Explore Decisions Before Making Them · Holographic AI control center with floating interactive scenario tabs and real microeconomic simulation.' },
  'Interactive What-If Simulation': { vi: 'Mô phỏng tình huống “nếu như”', en: 'Interactive What-If Simulation' },
  'DecisionPilot AI operationalizes Herbert Simon\'s decision-making model (Intelligence, Design, Choice) into a closed-loop chain:': { vi: 'DecisionPilot AI vận dụng mô hình ra quyết định của Herbert Simon (Nhận diện, Thiết kế, Lựa chọn) thành một quy trình khép kín:', en: 'DecisionPilot AI operationalizes Herbert Simon\'s decision-making model (Intelligence, Design, Choice) into a closed-loop chain:' },
  'DecisionPilot AI strictly decouples Language Models from mathematical computation. The LLM only classifies executive intent and generates constrained SQL against an explicit 6-table allowlist. Every numerical figure displayed on screen originates deterministically from the database or LightGBM model output, complete with verifiable SQL execution traces.': { vi: 'DecisionPilot AI tách mô hình ngôn ngữ khỏi phần tính toán. LLM chỉ phân loại ý định và tạo truy vấn SQL có giới hạn trên 6 bảng được cho phép. Mọi con số trên màn hình đều được tính từ cơ sở dữ liệu hoặc mô hình LightGBM, kèm dấu vết truy vấn để kiểm tra.', en: 'DecisionPilot AI strictly decouples Language Models from mathematical computation. The LLM only classifies executive intent and generates constrained SQL against an explicit 6-table allowlist. Every numerical figure displayed on screen originates deterministically from the database or LightGBM model output, complete with verifiable SQL execution traces.' },
  'LightGBM daily point & 90% confidence interval projections': { vi: 'Dự báo LightGBM theo ngày kèm khoảng tin cậy 90%', en: 'LightGBM daily point & 90% confidence interval projections' },
  'LightGBM multi-horizon demand forecasting with 90% bands.': { vi: 'Dự báo nhu cầu LightGBM nhiều khoảng thời gian với dải dự báo 90%.', en: 'LightGBM multi-horizon demand forecasting with 90% bands.' },
  'Ranked business anomalies detected by Isolation Forest with severity': { vi: 'Các bất thường kinh doanh được Isolation Forest phát hiện và xếp theo mức độ nghiêm trọng', en: 'Ranked business anomalies detected by Isolation Forest with severity' },
  'Monitor sudden revenue contractions, ad spend spikes, margin pressure and stockout risks detected via Hybrid Isolation Forest & Rolling Z-Scores.': { vi: 'Theo dõi doanh thu giảm đột ngột, chi phí quảng cáo tăng, biên lợi nhuận suy giảm và nguy cơ thiếu hàng bằng Isolation Forest kết hợp Z-score trượt.', en: 'Monitor sudden revenue contractions, ad spend spikes, margin pressure and stockout risks detected via Hybrid Isolation Forest & Rolling Z-Scores.' },
  'Some signals have limited measured precision or recall. Review underlying data and use additional checks; an absence of alerts does not establish that the business is healthy.': { vi: 'Một số tín hiệu có độ chính xác hoặc độ bao phủ còn hạn chế. Hãy kiểm tra dữ liệu gốc và đối chiếu thêm; không có cảnh báo không đồng nghĩa doanh nghiệp đang hoạt động tốt.', en: 'Some signals have limited measured precision or recall. Review underlying data and use additional checks; an absence of alerts does not establish that the business is healthy.' },
  'Each dimension independently reconciles to 100% of the total observed delta. Contributions are descriptive, not causal claims.': { vi: 'Mỗi chiều phân tích được đối soát độc lập với 100% mức thay đổi quan sát được. Đây là phân rã mô tả, không khẳng định quan hệ nhân quả.', en: 'Each dimension independently reconciles to 100% of the total observed delta. Contributions are descriptive, not causal claims.' },
  'Human-in-the-loop executive sign-off (Approve / Reject) with audit log': { vi: 'Người quản lý xem xét và chấp thuận hoặc từ chối; quyết định được ghi vào nhật ký kiểm toán.', en: 'Human-in-the-loop executive sign-off (Approve / Reject) with audit log' },
  'Prioritized recommendations backed by evidence and audit trail.': { vi: 'Các đề xuất được ưu tiên theo mức độ quan trọng, kèm căn cứ và lịch sử kiểm toán.', en: 'Prioritized recommendations backed by evidence and audit trail.' },
  'Open Data Sources to import a dataset': { vi: 'Mở Nguồn dữ liệu để nhập bộ dữ liệu', en: 'Open Data Sources to import a dataset' },
  'Workspace sign in': { vi: 'Đăng nhập không gian làm việc', en: 'Workspace sign in' },
  'Enter the access token issued by your workspace administrator.': { vi: 'Nhập mã truy cập do quản trị viên cấp.', en: 'Enter the access token issued by your workspace administrator.' },
  'Access token': { vi: 'Mã truy cập', en: 'Access token' },
  'Observed a': { vi: 'Ghi nhận mức', en: 'Observed a' },
  'and healthy gross margin of': { vi: 'và biên lợi nhuận gộp ở mức', en: 'and healthy gross margin of' },
  'critical operational alerts': { vi: 'cảnh báo vận hành nghiêm trọng', en: 'critical operational alerts' },
  'compared to prior period. Active margin sits at': { vi: 'so với kỳ trước. Biên lợi nhuận hiện ở mức', en: 'compared to prior period. Active margin sits at' },
  'actual': { vi: 'thực tế', en: 'actual' },
  'arrival': { vi: 'nhận hàng', en: 'arrival' },
  'baseline': { vi: 'mốc hiện tại', en: 'baseline' },
  'scenario': { vi: 'kịch bản', en: 'scenario' },
  'profit': { vi: 'lợi nhuận', en: 'profit' },
  'revenue': { vi: 'doanh thu', en: 'revenue' },
  'demand': { vi: 'nhu cầu', en: 'demand' },
  'Accepted': { vi: 'Đã chấp nhận', en: 'Accepted' },
  'Rejected': { vi: 'Đã từ chối', en: 'Rejected' },
  'System Architecture': { vi: 'Kiến trúc hệ thống', en: 'System Architecture' },
  '5-Tier Design & Sequence Flows': { vi: 'Thiết kế 5 lớp và luồng xử lý', en: '5-Tier Design & Sequence Flows' },
  'Relational Data Model': { vi: 'Mô hình dữ liệu quan hệ', en: 'Relational Data Model' },
  '6 Normalized Tables & ERD': { vi: '6 bảng chuẩn hóa và sơ đồ ERD', en: '6 Normalized Tables & ERD' },
  'Machine Learning & Econometrics': { vi: 'Học máy và kinh tế lượng', en: 'Machine Learning & Econometrics' },
  'LightGBM, Isolation Forest & Elasticity': { vi: 'LightGBM, Isolation Forest và độ co giãn', en: 'LightGBM, Isolation Forest & Elasticity' },
  'REST API Reference': { vi: 'Tài liệu tham chiếu REST API', en: 'REST API Reference' },
  'Endpoint Schemas & Contracts': { vi: 'Lược đồ và quy ước của các điểm cuối', en: 'Endpoint Schemas & Contracts' },
  'Research Proposal': { vi: 'Đề xuất nghiên cứu', en: 'Research Proposal' },
  'Academic Framework & Impact': { vi: 'Cơ sở học thuật và tác động', en: 'Academic Framework & Impact' },
  'Operations & Deployment': { vi: 'Vận hành và triển khai', en: 'Operations & Deployment' },
  'Docker, Alembic & Launch Guide': { vi: 'Docker, Alembic và hướng dẫn khởi chạy', en: 'Docker, Alembic & Launch Guide' },
  '1. System Architecture & 5-Tier Overview': { vi: '1. Kiến trúc hệ thống và tổng quan 5 lớp', en: '1. System Architecture & 5-Tier Overview' },
  'Separation of concerns across Presentation, Gateway, Intelligence, Persistence, and Storage': { vi: 'Phân tách trách nhiệm giữa giao diện, cổng API, phân tích, quản lý dữ liệu và lưu trữ', en: 'Separation of concerns across Presentation, Gateway, Intelligence, Persistence, and Storage' },
  '1. Presentation Layer': { vi: '1. Lớp giao diện', en: '1. Presentation Layer' },
  '2. API Gateway': { vi: '2. Cổng API', en: '2. API Gateway' },
  '3. Intelligence Layer': { vi: '3. Lớp phân tích thông minh', en: '3. Intelligence Layer' },
  '4. Data Access': { vi: '4. Truy cập dữ liệu', en: '4. Data Access' },
  '5. Physical Storage': { vi: '5. Lưu trữ vật lý', en: '5. Physical Storage' },
  'Zero-Hallucination AI Grounding Policy': { vi: 'Nguyên tắc AI trả lời dựa trên dữ liệu', en: 'Zero-Hallucination AI Grounding Policy' },
  '2. Relational Data Model & 6 Normalized Tables': { vi: '2. Mô hình dữ liệu quan hệ và 6 bảng chuẩn hóa', en: '2. Relational Data Model & 6 Normalized Tables' },
  '3. Machine Learning & Microeconomic Formulation': { vi: '3. Mô hình học máy và công thức kinh tế', en: '3. Machine Learning & Microeconomic Formulation' },
  '4. REST API Reference Specification': { vi: '4. Đặc tả tham chiếu REST API', en: '4. REST API Reference Specification' },
  '5. Research & Business Innovation Proposal': { vi: '5. Đề xuất nghiên cứu và đổi mới kinh doanh', en: '5. Research & Business Innovation Proposal' },
  '6. Operations & Quickstart Guide': { vi: '6. Hướng dẫn vận hành và khởi chạy nhanh', en: '6. Operations & Quickstart Guide' },
  '50,000 Rows Validated': { vi: 'Đã kiểm tra 50.000 dòng dữ liệu', en: '50,000 Rows Validated' },
  'Swagger UI at /docs': { vi: 'Giao diện Swagger tại /docs', en: 'Swagger UI at /docs' },
  'Academic title: AI-Powered Business Data Analysis, Forecasting and Decision Support System for SMEs': { vi: 'Tên đề tài: Hệ thống AI phân tích dữ liệu kinh doanh, dự báo và hỗ trợ ra quyết định cho SME', en: 'Academic title: AI-Powered Business Data Analysis, Forecasting and Decision Support System for SMEs' },
  'Abstract:': { vi: 'Tóm tắt:', en: 'Abstract:' },
  'Quick Launch on Windows:': { vi: 'Khởi chạy nhanh trên Windows:', en: 'Quick Launch on Windows:' },
  'Docker Multi-Container Deployment:': { vi: 'Triển khai bằng nhiều container Docker:', en: 'Docker Multi-Container Deployment:' },
  'React 19, TypeScript, Three.js 3D WebGL Holographic Sphere, Recharts gradient charts, Tailwind CSS 4.': { vi: 'React 19, TypeScript, khối cầu WebGL 3D với Three.js, biểu đồ Recharts và Tailwind CSS 4.', en: 'React 19, TypeScript, Three.js 3D WebGL Holographic Sphere, Recharts gradient charts, Tailwind CSS 4.' },
  'FastAPI on Uvicorn, Pydantic v2 schemas, CORS middleware, sub-50ms latency SLA, read-only session pools.': { vi: 'FastAPI chạy trên Uvicorn, lược đồ Pydantic v2, CORS, thời gian phản hồi mục tiêu dưới 50 mili giây và các phiên chỉ đọc.', en: 'FastAPI on Uvicorn, Pydantic v2 schemas, CORS middleware, sub-50ms latency SLA, read-only session pools.' },
  'LightGBM time-series regressor, Isolation Forest anomaly detector, Microeconomic What-If simulator.': { vi: 'Mô hình chuỗi thời gian LightGBM, bộ phát hiện bất thường Isolation Forest và công cụ mô phỏng tình huống kinh tế.', en: 'LightGBM time-series regressor, Isolation Forest anomaly detector, Microeconomic What-If simulator.' },
  'SQLAlchemy 2.0 Core, Alembic schema migrations (head), snapshot hash validation and zero-leakage partitions.': { vi: 'SQLAlchemy 2.0 Core, migration lược đồ bằng Alembic, kiểm tra mã băm bộ dữ liệu và chia tập không rò rỉ dữ liệu tương lai.', en: 'SQLAlchemy 2.0 Core, Alembic schema migrations (head), snapshot hash validation and zero-leakage partitions.' },
  'SQLite 3.40+ (Local demo) / PostgreSQL 16+ (Production), versioned joblib model bundles in artifacts/.': { vi: 'SQLite 3.40+ cho demo cục bộ hoặc PostgreSQL 16+ khi triển khai; gói mô hình joblib có phiên bản nằm trong artifacts/.', en: 'SQLite 3.40+ (Local demo) / PostgreSQL 16+ (Production), versioned joblib model bundles in artifacts/.' },
  'Realized sales, discounts, landed COGS, contribution margin': { vi: 'Doanh số thực tế, giảm giá, giá vốn và biên lợi nhuận đóng góp', en: 'Realized sales, discounts, landed COGS, contribution margin' },
  'SKU master catalog, unit cost, lead time, reorder point, elasticity': { vi: 'Danh mục SKU, giá vốn, thời gian nhập hàng, điểm đặt hàng lại và độ co giãn giá', en: 'SKU master catalog, unit cost, lead time, reorder point, elasticity' },
  'Segments (Returning, Individual, Corporate, Price-sensitive), LTV, 4 regions': { vi: 'Phân khúc khách hàng (Quay lại, Cá nhân, Doanh nghiệp, Nhạy giá), LTV và 4 khu vực', en: 'Segments (Returning, Individual, Corporate, Price-sensitive), LTV, 4 regions' },
  'Channels (Facebook Ads, Google Ads, TikTok Ads, Email), spend & ROAS': { vi: 'Các kênh (Facebook Ads, Google Ads, TikTok Ads, Email), chi phí và ROAS', en: 'Channels (Facebook Ads, Google Ads, TikTok Ads, Email), spend & ROAS' },
  'Daily opening/closing stock, inbound deliveries, stockout flags': { vi: 'Tồn kho đầu/cuối ngày, hàng nhập và cờ báo thiếu hàng', en: 'Daily opening/closing stock, inbound deliveries, stockout flags' },
  'Day of week, month, holidays (Tet, Black Friday), promo flags': { vi: 'Thứ, tháng, ngày lễ và cờ khuyến mãi', en: 'Day of week, month, holidays (Tet, Black Friday), promo flags' },
  'Trained across 17 causal temporal features: lag 1, 7, 14, 28 days; 7d/14d/28d rolling mean and standard deviation; growth_7; calendar encodings; and log1p(scale). Chronological Train/Val/Test splits and a 2% validation MAE selection gate prevent data leakage.': { vi: 'Huấn luyện trên 17 đặc trưng nhân quả theo thời gian: độ trễ 1, 7, 14, 28 ngày; trung bình và độ lệch chuẩn trượt 7/14/28 ngày; growth_7; đặc trưng lịch; và log1p(scale). Chia tập theo thời gian Train/Val/Test và cổng kiểm định MAE > 2% giúp tránh rò rỉ dữ liệu.', en: 'Trained across 17 causal temporal features: lag 1, 7, 14, 28 days; 7d/14d/28d rolling mean and standard deviation; growth_7; calendar encodings; and log1p(scale). Chronological Train/Val/Test splits and a 2% validation MAE selection gate prevent data leakage.' },
  'Unlike static calculators, models consumer price elasticity (e in [-5, 0]) with warehouse inventory limits and diminishing marginal returns on ad spend:': { vi: 'Khác với máy tính tĩnh, mô hình tính độ co giãn giá của khách hàng (e trong khoảng [-5, 0]), giới hạn tồn kho và hiệu quả giảm dần của chi phí quảng cáo:', en: 'Unlike static calculators, models consumer price elasticity (e in [-5, 0]) with warehouse inventory limits and diminishing marginal returns on ad spend:' },
  'Multi-grain aggregated financial KPIs (Revenue, Profit, Orders, ROAS)': { vi: 'Các chỉ số tài chính tổng hợp theo ngày, tuần hoặc tháng (doanh thu, lợi nhuận, đơn hàng, ROAS)', en: 'Multi-grain aggregated financial KPIs (Revenue, Profit, Orders, ROAS)' },
  'What-If scenario simulation under microeconomic response functions': { vi: 'Mô phỏng tình huống theo các hàm phản ứng kinh tế', en: 'What-If scenario simulation under microeconomic response functions' },
  'SMEs represent over 97% of active businesses in Vietnam and South Korea. Despite collecting thousands of transactions, SMEs face a severe decision bottleneck: descriptive dashboards only report past numbers, while unconstrained LLMs hallucinate figures without mathematical foundations.': { vi: 'Doanh nghiệp vừa và nhỏ chiếm hơn 97% số doanh nghiệp đang hoạt động tại Việt Nam và Hàn Quốc. Dù có hàng nghìn giao dịch, SME vẫn khó ra quyết định: bảng điều khiển truyền thống chỉ báo cáo số liệu quá khứ, còn LLM không giới hạn có thể tạo ra con số thiếu căn cứ.', en: 'SMEs represent over 97% of active businesses in Vietnam and South Korea. Despite collecting thousands of transactions, SMEs face a severe decision bottleneck: descriptive dashboards only report past numbers, while unconstrained LLMs hallucinate figures without mathematical foundations.' },
  'Running on commodity CPU hardware with zero cloud GPU dependencies, the system delivers enterprise-grade forecasting and What-If simulation for under $10/month in operational overhead.': { vi: 'Hệ thống chạy trên CPU phổ thông, không cần GPU đám mây; chi phí vận hành ước tính dưới 10 USD/tháng cho chức năng dự báo và mô phỏng.', en: 'Running on commodity CPU hardware with zero cloud GPU dependencies, the system delivers enterprise-grade forecasting and What-If simulation for under $10/month in operational overhead.' },
  'Windows single-command launcher, Docker containerization, and migrations': { vi: 'Khởi chạy bằng một lệnh trên Windows, đóng gói Docker và migration cơ sở dữ liệu', en: 'Windows single-command launcher, Docker containerization, and migrations' },
  '# Double-click run.bat in project root, or execute in PowerShell:': { vi: '# Nhấp đúp run.bat ở thư mục dự án hoặc chạy lệnh sau trong PowerShell:', en: '# Double-click run.bat in project root, or execute in PowerShell:' },
  '# Services: Frontend (Nginx :80), Backend (FastAPI :8000), DB (Postgres :5432)': { vi: '# Dịch vụ: giao diện (Nginx :80), backend (FastAPI :8000), cơ sở dữ liệu (Postgres :5432)', en: '# Services: Frontend (Nginx :80), Backend (FastAPI :8000), DB (Postgres :5432)' },

  // Enterprise SaaS Shell & Redesigned Workspaces
  'OVERVIEW': { vi: 'TỔNG QUAN', en: 'OVERVIEW' },
  'INTELLIGENCE': { vi: 'PHÂN TÍCH THÔNG MINH', en: 'INTELLIGENCE' },
  'PLANNING': { vi: 'LẬP KẾ HOẠCH', en: 'PLANNING' },
  'GOVERNANCE': { vi: 'QUẢN TRỊ QUYẾT ĐỊNH', en: 'GOVERNANCE' },
  'ADMINISTRATION': { vi: 'QUẢN TRỊ HỆ THỐNG', en: 'ADMINISTRATION' },
  'Executive Dashboard': { vi: 'Bảng điều hành', en: 'Executive Dashboard' },
  'Recommendations & Audit': { vi: 'Khuyến nghị & Kiểm toán', en: 'Recommendations & Audit' },
  'Documentation': { vi: 'Tài liệu kỹ thuật', en: 'Documentation' },
  'Project Docs Portal': { vi: 'Cổng tài liệu dự án', en: 'Project Docs Portal' },
  'Quick jump or ask…': { vi: 'Tìm nhanh hoặc đặt câu hỏi…', en: 'Quick jump or ask…' },
  'Workspaces': { vi: 'Không gian làm việc', en: 'Workspaces' },
  'Suggested Analytical Questions': { vi: 'Câu hỏi phân tích gợi ý', en: 'Suggested Analytical Questions' },
  'Jump to workspace or type a business question for AI Copilot…': { vi: 'Chuyển nhanh tới trang hoặc nhập câu hỏi phân tích cho Trợ lý AI…', en: 'Jump to workspace or type a business question for AI Copilot…' },
  'Notifications': { vi: 'Thông báo', en: 'Notifications' },
  'Anomaly Alerts': { vi: 'Cảnh báo bất thường', en: 'Anomaly Alerts' },
  'View all': { vi: 'Xem tất cả', en: 'View all' },
  'No active anomalies detected.': { vi: 'Không phát hiện bất thường đang hoạt động.', en: 'No active anomalies detected.' },
  'EXECUTIVE OVERVIEW & DIAGNOSTICS': { vi: 'TỔNG QUAN ĐIỀU HÀNH & CHẨN ĐOÁN', en: 'EXECUTIVE OVERVIEW & DIAGNOSTICS' },
  'Reconciled financial performance, demand signals, and operational risk radar.': { vi: 'Hiệu quả tài chính đã đối soát, tín hiệu nhu cầu và radar rủi ro vận hành.', en: 'Reconciled financial performance, demand signals, and operational risk radar.' },
  'Open Anomaly Center': { vi: 'Mở Trung tâm bất thường', en: 'Open Anomaly Center' },
  'Reset': { vi: 'Đặt lại', en: 'Reset' },
  'Average Order Value': { vi: 'Giá trị đơn hàng trung bình', en: 'Average Order Value' },
  'Inventory Status': { vi: 'Tình trạng tồn kho', en: 'Inventory Status' },
  'Healthy Stock': { vi: 'Tồn kho ổn định', en: 'Healthy Stock' },
  'Low Buffer': { vi: 'Cần theo dõi tồn kho', en: 'Low Buffer' },
  'Stockout Risk': { vi: 'Nguy cơ hết hàng', en: 'Stockout Risk' },
  'Plan reorder': { vi: 'Lập kế hoạch nhập hàng', en: 'Plan reorder' },
  'All': { vi: 'Tất cả', en: 'All' },
  'Sales Performance (Order Volume)': { vi: 'Hiệu suất bán hàng (Số đơn hàng)', en: 'Sales Performance (Order Volume)' },
  'Orders fulfilled over time': { vi: 'Số lượng đơn hàng theo thời gian', en: 'Orders fulfilled over time' },
  'total': { vi: 'tổng', en: 'total' },
  'Sales Channel & Customer Breakdown': { vi: 'Phân bổ Kênh bán & Khách hàng', en: 'Sales Channel & Customer Breakdown' },
  'Channel order contribution and customer retention split': { vi: 'Đóng góp đơn hàng theo kênh và tỷ lệ khách hàng mới / quay lại', en: 'Channel order contribution and customer retention split' },
  'Planning Studio': { vi: 'Studio lập kế hoạch', en: 'Planning Studio' },
  '3D Scenario Studio View': { vi: 'Mô hình Studio Kịch bản 3D', en: '3D Scenario Studio View' },
  'Baseline vs. Simulation (2D)': { vi: 'Mốc cơ sở vs. Mô phỏng (2D)', en: 'Baseline vs. Simulation (2D)' },
  'Revenue and Contribution Profit comparison': { vi: 'So sánh Doanh thu và Lợi nhuận đóng góp', en: 'Revenue and Contribution Profit comparison' },
  'Clean Light UI is the default enterprise theme. Switch to Dark mode at any time.': { vi: 'Giao diện Sáng rõ là giao diện doanh nghiệp mặc định. Có thể chuyển sang chế độ Tối bất kỳ lúc nào.', en: 'Clean Light UI is the default enterprise theme. Switch to Dark mode at any time.' },
  'Crisp Light (Default)': { vi: 'Sáng rõ (Mặc định)', en: 'Crisp Light (Default)' },
  'High-contrast enterprise UI': { vi: 'Giao diện doanh nghiệp độ tương phản cao', en: 'High-contrast enterprise UI' },
  'Slate Dark': { vi: 'Tối Slate', en: 'Slate Dark' },
  'Low-light executive view': { vi: 'Giao diện dịu mắt cho môi trường thiếu sáng', en: 'Low-light executive view' },
  'Confirm Recommendation Approval': { vi: 'Xác nhận phê duyệt khuyến nghị', en: 'Confirm Recommendation Approval' },
  'Confirm Recommendation Rejection': { vi: 'Xác nhận từ chối khuyến nghị', en: 'Confirm Recommendation Rejection' },
  'Total Detected Anomalies': { vi: 'Tổng số bất thường phát hiện', en: 'Total Detected Anomalies' },
  'Anomaly Severity Timeline': { vi: 'Biểu đồ mức độ bất thường theo thời gian', en: 'Anomaly Severity Timeline' },
  'Anomaly Detection Log': { vi: 'Nhật ký phát hiện bất thường', en: 'Anomaly Detection Log' },

  // Executive Dashboard Donut & Pie Visualizations
  'Top Products by Revenue': { vi: 'Top Sản phẩm theo Doanh thu', en: 'Top Products by Revenue' },
  'Other Products': { vi: 'Sản phẩm khác', en: 'Other Products' },
  'Top 5 SKUs and remaining catalog revenue share': { vi: 'Tỷ trọng Top 5 SKU và nhóm sản phẩm còn lại', en: 'Top 5 SKUs and remaining catalog revenue share' },
  'Revenue share across active SKUs': { vi: 'Tỷ trọng doanh thu theo các SKU đang hoạt động', en: 'Revenue share across active SKUs' },
  'Top SKUs': { vi: 'SKU hàng đầu', en: 'Top SKUs' },
  'No product revenue recorded in this selection.': { vi: 'Không có doanh thu sản phẩm trong phạm vi đã chọn.', en: 'No product revenue recorded in this selection.' },
  'Marketing Channel Distribution': { vi: 'Phân bổ Kênh Tiếp thị', en: 'Marketing Channel Distribution' },
  'Total Ad Spend': { vi: 'Tổng chi tiêu QC', en: 'Total Ad Spend' },
  'Blended ROAS': { vi: 'ROAS tổng hợp', en: 'Blended ROAS' },
  'Ad spend share across channels · ROAS shown for efficiency context': { vi: 'Tỷ trọng chi tiêu theo kênh · ROAS hiển thị để tham chiếu hiệu quả', en: 'Ad spend share across channels · ROAS shown for efficiency context' },
  'Unavailable for filtered sales scope': { vi: 'Không khả dụng khi lọc theo chiều bán hàng', en: 'Unavailable for filtered sales scope' },
  'Marketing campaign spend is tracked business-wide and unavailable when filtered by sales dimensions.': { vi: 'Chi tiêu chiến dịch tiếp thị được ghi nhận trên toàn doanh nghiệp và không tách được theo bộ lọc bán hàng.', en: 'Marketing campaign spend is tracked business-wide and unavailable when filtered by sales dimensions.' },
  'No marketing spend recorded in this selection.': { vi: 'Không có chi tiêu tiếp thị trong khoảng thời gian đã chọn.', en: 'No marketing spend recorded in this selection.' },
  'Regional revenue contribution across Vietnam markets': { vi: 'Đóng góp doanh thu theo thị trường khu vực', en: 'Regional revenue contribution across Vietnam markets' },
  'Regions': { vi: 'Khu vực', en: 'Regions' },
  'No regional revenue recorded in this selection.': { vi: 'Không có doanh thu khu vực trong phạm vi đã chọn.', en: 'No regional revenue recorded in this selection.' },
  'Sales Channel Distribution': { vi: 'Phân bổ Kênh Bán hàng', en: 'Sales Channel Distribution' },
  'Channel metric toggle': { vi: 'Chuyển đổi chỉ số kênh bán', en: 'Channel metric toggle' },
  'Revenue share across Online, Retail and B2B': { vi: 'Tỷ trọng doanh thu giữa Online, Cửa hàng và B2B', en: 'Revenue share across Online, Retail and B2B' },
  'Order volume share across Online, Retail and B2B': { vi: 'Tỷ trọng đơn hàng giữa Online, Cửa hàng và B2B', en: 'Order volume share across Online, Retail and B2B' },
  'No sales channel activity recorded in this selection.': { vi: 'Không có giao dịch kênh bán hàng trong phạm vi đã chọn.', en: 'No sales channel activity recorded in this selection.' },
  'Customer Mix & Retention': { vi: 'Cơ cấu & Tỷ lệ Quay lại Khách hàng', en: 'Customer Mix & Retention' },
  'Active customer acquisition and repeat retention': { vi: 'Phân bổ khách hàng mới và khách hàng quay lại', en: 'Active customer acquisition and repeat retention' },
  'Retention Split': { vi: 'Tỷ lệ giữ chân', en: 'Retention Split' },
  'Share': { vi: 'Tỷ trọng', en: 'Share' },
  'Show all': { vi: 'Hiện tất cả', en: 'Show all' },
  'Toggle': { vi: 'Bật/tắt', en: 'Toggle' },
  'Keep at least one segment visible': { vi: 'Giữ ít nhất một nhóm hiển thị', en: 'Keep at least one segment visible' },
  'Close detail': { vi: 'Đóng chi tiết', en: 'Close detail' },
  'active': { vi: 'đang hiển thị', en: 'active' },

  // Enterprise Data Ingestion & Multi-Tenant Workspace
  'Company Workspace': { vi: 'Không gian Doanh nghiệp', en: 'Company Workspace' },
  'Switch Company Workspace': { vi: 'Chuyển không gian doanh nghiệp', en: 'Switch Company Workspace' },
  'New Company': { vi: 'Tạo doanh nghiệp mới', en: 'New Company' },
  'Create Company Workspace': { vi: 'Tạo không gian doanh nghiệp mới', en: 'Create Company Workspace' },
  'Enterprise Data Ingestion Pipeline': { vi: 'Quy trình Nhập dữ liệu Doanh nghiệp', en: 'Enterprise Data Ingestion Pipeline' },
  'Upload business files (CSV, XLSX, XLS, JSON, XML), preview rows, verify AI column mappings, inspect 5-axis data quality, and import after explicit confirmation.': {
    vi: 'Tải tệp dữ liệu kinh doanh (CSV, XLSX, XLS, JSON, XML), xem trước, kiểm tra ánh xạ cột bằng AI, đánh giá chất lượng 5 chiều và nhập sau khi xác nhận.',
    en: 'Upload business files (CSV, XLSX, XLS, JSON, XML), preview rows, verify AI column mappings, inspect 5-axis data quality, and import after explicit confirmation.',
  },
  'Upload File': { vi: '1. Tải tệp', en: '1. Upload File' },
  'Preview Data': { vi: '2. Xem trước', en: '2. Preview Data' },
  'Column Mapping': { vi: '3. Ánh xạ cột', en: '3. Column Mapping' },
  'Quality & Import': { vi: '4. Chất lượng & Nhập', en: '4. Quality & Import' },
  'Drag and drop CSV, XLSX, XLS, JSON, or XML here': { vi: 'Kéo thả tệp CSV, XLSX, XLS, JSON hoặc XML vào đây', en: 'Drag and drop CSV, XLSX, XLS, JSON, or XML here' },
  'Dataset Catalog & History': { vi: 'Danh mục & Lịch sử Bộ dữ liệu', en: 'Dataset Catalog & History' },
  'Connectors & External Integrations': { vi: 'Cổng kết nối & Tích hợp Dữ liệu', en: 'Connectors & External Integrations' },
  'Completeness': { vi: 'Độ đầy đủ', en: 'Completeness' },
  'Validity': { vi: 'Tính hợp lệ', en: 'Validity' },
  'Consistency': { vi: 'Tính nhất quán', en: 'Consistency' },
  'Uniqueness': { vi: 'Tính duy nhất', en: 'Uniqueness' },
  'Accuracy': { vi: 'Độ chính xác', en: 'Accuracy' },
  'Download Error Report (CSV)': { vi: 'Tải báo cáo lỗi (CSV)', en: 'Download Error Report (CSV)' },
  'Download Error Report (JSON)': { vi: 'Tải báo cáo lỗi (JSON)', en: 'Download Error Report (JSON)' },
  'Confirm & Import Dataset': { vi: 'Xác nhận & Nhập bộ dữ liệu', en: 'Confirm & Import Dataset' },
  'Save Mapping Template': { vi: 'Lưu mẫu ánh xạ', en: 'Save Mapping Template' },
  'Activate': { vi: 'Kích hoạt', en: 'Activate' },
  'Active': { vi: 'Đang hoạt động', en: 'Active' },
  'Resume': { vi: 'Tiếp tục', en: 'Resume' },
  'History': { vi: 'Lịch sử', en: 'History' },
  'Empty Company Workspace': { vi: 'Không gian Doanh nghiệp chưa có dữ liệu', en: 'Empty Company Workspace' },
  'Upload Your Business Data': { vi: 'Tải lên dữ liệu doanh nghiệp', en: 'Upload Your Business Data' },
  'Optional analytics module not mapped in this dataset': {
    vi: 'Trường dữ liệu tùy chọn chưa được ánh xạ trong bộ dữ liệu này',
    en: 'Optional analytics module not mapped in this dataset',
  },

  // Multimodal Data Ingestion & HITL Intelligence Studio
  'Structured Tabular Pipeline (CSV · Excel · JSON · XML)': {
    vi: 'Quy trình Dữ liệu Bảng (CSV · Excel · JSON · XML)',
    en: 'Structured Tabular Pipeline (CSV · Excel · JSON · XML)',
  },
  'Multimodal & Media Studio (PDF · DOCX · Image · Video · Audio)': {
    vi: 'Studio Đa phương thức & Media (PDF · DOCX · Ảnh · Video · Audio)',
    en: 'Multimodal & Media Studio (PDF · DOCX · Image · Video · Audio)',
  },
  'Human-in-the-Loop Verification Active': {
    vi: 'Xác minh có con người kiểm duyệt (HITL) đang bật',
    en: 'Human-in-the-Loop Verification Active',
  },
  'Multimodal Data & Intelligence Studio': {
    vi: 'Studio Dữ liệu & Trí tuệ Đa phương thức',
    en: 'Multimodal Data & Intelligence Studio',
  },
  'Async Ingestion Queue': { vi: 'Hàng đợi Xử lý Bất đồng bộ', en: 'Async Ingestion Queue' },
  'Multimodal File Catalog': { vi: 'Danh mục Tệp Đa phương thức', en: 'Multimodal File Catalog' },
  'Verified Multimodal Insights': { vi: 'Thông tin Đa phương thức Đã Xác nhận', en: 'Verified Multimodal Insights' },
  'Verified Multimodal Intelligence Signals': {
    vi: 'Tín hiệu Trí tuệ Đa phương thức Đã Xác nhận',
    en: 'Verified Multimodal Intelligence Signals',
  },
  'Human-approved document, image, audio, and video insights bound to the active dataset.': {
    vi: 'Các thông tin từ tài liệu, hình ảnh, âm thanh và video đã được con người phê duyệt cho bộ dữ liệu đang hoạt động.',
    en: 'Human-approved document, image, audio, and video insights bound to the active dataset.',
  },
  'Multimodal Studio': { vi: 'Studio Đa phương thức', en: 'Multimodal Studio' },
  'Approved by': { vi: 'Phê duyệt bởi', en: 'Approved by' },
  'Review & Approve': { vi: 'Kiểm tra & Phê duyệt', en: 'Review & Approve' },
  'Confirm & Import to BI': { vi: 'Xác nhận & Nhập vào BI', en: 'Confirm & Import to BI' },
  'Save Correction': { vi: 'Lưu chỉnh sửa', en: 'Save Correction' },
  'Source Media & Provenance': { vi: 'Nguồn Media & Truy xuất Nguồn gốc', en: 'Source Media & Provenance' },
  'Live Test': { vi: 'Kiểm tra kết nối thực', en: 'Live Test' },
  'Discover Schema': { vi: 'Khám phá Lược đồ', en: 'Discover Schema' },
  'Sync Now': { vi: 'Đồng bộ ngay', en: 'Sync Now' },
  'Sync Logs': { vi: 'Nhật ký đồng bộ', en: 'Sync Logs' },
  'ENTERPRISE RAG & TEXT-TO-SQL COPILOT': { vi: 'TRỢ LÝ RAG & SQL DOANH NGHIỆP', en: 'ENTERPRISE RAG & TEXT-TO-SQL COPILOT' },
  'DecisionPilot AI Copilot': { vi: 'DecisionPilot AI Copilot', en: 'DecisionPilot AI Copilot' },
  'New Conversation': { vi: 'Cuộc trò chuyện mới', en: 'New Conversation' },
  'Pinned': { vi: 'Đã ghim', en: 'Pinned' },
  'Recent Sessions': { vi: 'Gần đây', en: 'Recent Sessions' },
  'Citations': { vi: 'Trích dẫn', en: 'Citations' },
  'Knowledge': { vi: 'Kho tri thức', en: 'Knowledge' },
  'Memory & SQL': { vi: 'Bộ nhớ & SQL', en: 'Memory & SQL' },
  'Ingest RAG Doc': { vi: 'Nạp tài liệu RAG', en: 'Ingest RAG Doc' },
  'Executed SQL Trace': { vi: 'Truy vấn SQL đã chạy', en: 'Executed SQL Trace' },
  'Long-Term Company Memory (Layer 3)': { vi: 'Tri thức ghi nhớ Doanh nghiệp (Layer 3)', en: 'Long-Term Company Memory (Layer 3)' },
  'Safe SQL + Verified Citations': { vi: 'SQL Chỉ đọc & Trích dẫn', en: 'Safe SQL + Verified Citations' },
}

export function translate(text: string, language: Preferences['language']): string {
  if (!text) return text
  const entry = translations[text]
  if (entry) {
    return entry[language] || entry.en || text
  }
  // Existing JSX often contains already-translated Vietnamese literals. Map
  // those back to English when the user switches languages.
  const reverseEntry = reverseTranslations.get(text)
  if (reverseEntry) return language === 'vi' ? reverseEntry.vi : reverseEntry.en
  return text
}

const reverseTranslations = new Map<string, { vi: string; en: string }>()
for (const entry of Object.values(translations)) {
  if (!reverseTranslations.has(entry.vi)) reverseTranslations.set(entry.vi, entry)
  if (!reverseTranslations.has(entry.en)) reverseTranslations.set(entry.en, entry)
}

/**
 * Translate remaining literal UI text and common accessibility attributes,
 * including labels rendered by legacy pages that predate the shared `t()` hook.
 * Code samples and technical identifiers remain untouched.
 */
export function usePageTranslations(language: Preferences['language']) {
  const textState = useRef(new Map<Text, { source: string; applied: string }>())
  const attributeState = useRef(new Map<Element, Map<string, { source: string; applied: string }>>())

  useEffect(() => {
    let mutating = false
    const translateTextNode = (node: Text) => {
      const parent = node.parentElement
      if (!parent || parent.closest('pre, code, script, style, textarea')) return
      const current = node.data
      const previous = textState.current.get(node)
      const source = previous && current === previous.applied ? previous.source : current
      const trimmed = source.trim()
      if (!trimmed) return
      const leading = source.match(/^\s*/)?.[0] || ''
      const trailing = source.match(/\s*$/)?.[0] || ''
      const next = leading + translate(trimmed, language) + trailing
      textState.current.set(node, { source, applied: next })
      if (next !== current) {
        mutating = true
        node.data = next
        mutating = false
      }
    }

    const translatableAttributes = ['title', 'aria-label', 'placeholder', 'alt']
    const translateAttributes = (element: Element) => {
      let state = attributeState.current.get(element)
      if (!state) {
        state = new Map()
        attributeState.current.set(element, state)
      }
      for (const name of translatableAttributes) {
        const current = element.getAttribute(name)
        if (current == null) continue
        const previous = state.get(name)
        const source = previous && current === previous.applied ? previous.source : current
        const next = translate(source, language)
        state.set(name, { source, applied: next })
        if (next !== current) {
          mutating = true
          element.setAttribute(name, next)
          mutating = false
        }
      }
    }

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text)
      if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node as Element)
      node.childNodes.forEach(visit)
    }

    visit(document.body)
    const observer = new MutationObserver((mutations) => {
      if (mutating) return
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateTextNode(mutation.target as Text)
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(visit)
        } else if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          translateAttributes(mutation.target as Element)
        }
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatableAttributes,
    })

    // Keep the cache bounded as navigation creates and removes screen nodes.
    if (textState.current.size > 6000) {
      for (const node of textState.current.keys()) if (!node.isConnected) textState.current.delete(node)
    }
    if (attributeState.current.size > 2000) {
      for (const element of attributeState.current.keys()) if (!element.isConnected) attributeState.current.delete(element)
    }
    return () => observer.disconnect()
  }, [language])
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
