import type { CaseDetail } from './api'
const pct=(n:number)=>new Intl.NumberFormat('vi-VN',{style:'percent',maximumFractionDigits:1}).format(n)
export function TrackingPanel({data}:{data:CaseDetail}){const p=data.progress;return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Theo dõi & tự chấm</h2>{p&&<p>Ngày {p.day}/{p.horizon}: thực tế {pct(p.actual_delta_pct)} (dự đoán {pct(p.predicted_delta_pct)})</p>}{data.prediction?.status==='scored'&&<strong>AI đoán {data.prediction.verdict==='correct'?'đúng':'sai'}</strong>}</section>}
