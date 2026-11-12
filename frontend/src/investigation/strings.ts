import type { CaseStatus } from './api'
export const REFUSAL_TEXT='Chưa đủ bằng chứng để kết luận'
export const STATUS:Record<CaseStatus,string>={new:'Mới phát hiện',investigating:'Đang điều tra',awaiting_decision:'Chờ quyết định',tracking:'Đang theo dõi',scored:'Đã chấm điểm',refused:'Thiếu bằng chứng'}
export const moneyVnd=(value:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(value/1e9)+' tỷ ₫'
