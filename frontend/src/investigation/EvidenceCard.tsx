import { BarChart,Bar,LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer } from 'recharts'
import type { Evidence } from './api'
export function EvidenceCard({evidence}:{evidence:Evidence}){const chart=evidence.chart;const data=chart?.rows??[]
  return <section className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm"><h4 className="font-bold">{evidence.claim}</h4>
    {chart&&data.length>0&&<div className="h-40"><ResponsiveContainer width="100%" height="100%">{chart.type==='line'?<LineChart data={data}><XAxis dataKey={chart.x}/><YAxis/><Tooltip/><Line dataKey={chart.y} stroke="#4f46e5"/></LineChart>:<BarChart data={data}><XAxis dataKey={chart.x}/><YAxis/><Tooltip/><Bar dataKey={chart.y} fill="#4f46e5"/></BarChart>}</ResponsiveContainer></div>}
    <details><summary className="cursor-pointer font-medium">Số này lấy từ đâu?</summary><p>Bảng: {evidence.lineage.tables.join(', ')}</p><p>Khoảng ngày: {evidence.lineage.start} – {evidence.lineage.end}</p><p>Số dòng: {evidence.lineage.rows}</p></details>
    {evidence.method==='exact'?<p className="mt-2 text-emerald-700">Phép tính chính xác, không phải dự đoán</p>:<p className="mt-2">Dự báo mô hình · SHAP {evidence.shap?'có sẵn':'chưa có'}</p>}</section>}
