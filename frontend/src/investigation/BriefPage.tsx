import { Link } from 'react-router-dom'
import { PageHero } from '../redesign/ui'
import { useBrief } from './api'
import { moneyVnd, REFUSAL_TEXT, STATUS } from './strings'

export function BriefPage(){const {data,isLoading,error}=useBrief();if(isLoading)return <p>Đang tải bản tin sáng…</p>;if(error)return <p role="alert">{String(error)}</p>
  const cases=[...(data?.cases??[])].sort((a,b)=>b.impact_vnd-a.impact_vnd);const hero=cases[0]
  return <div className="space-y-5"><PageHero tone="today" title="Bản tin sáng" subtitle="Từ tín hiệu bất thường đến quyết định có bằng chứng." />
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]"><section className="rounded-3xl bg-white p-6 shadow-sm border border-indigo-100">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Vụ nổi bật</p>{hero?<><h2 className="mt-3 text-2xl font-bold">{hero.title}</h2>
      <p className="mt-2 text-lg text-rose-700">~ −{moneyVnd(hero.impact_vnd)}/tháng</p>
      <p>{hero.status==='refused'?REFUSAL_TEXT:STATUS[hero.status]}</p>
      {hero.summary?.causes.map(c=><p key={c.key}>{c.label_vi}: {new Intl.NumberFormat('vi-VN',{style:'percent',maximumFractionDigits:0}).format(c.share)}</p>)}
      <Link className="mt-5 inline-block rounded-xl bg-indigo-700 px-5 py-3 font-bold text-white" to={`/cases/${hero.id}`}>Xem AI điều tra →</Link></>:<p>Chưa có vụ cần điều tra.</p>}</section>
      <aside className="rounded-3xl bg-indigo-50 p-6"><p className="text-sm text-indigo-600">Tự chấm & học</p><strong className="mt-3 block text-xl">AI đúng {data?.scorecard.correct??0}/{data?.scorecard.scored??0} vụ</strong>
      {data?.scorecard.lessons.map((lesson,i)=><p key={i}>{lesson}</p>)}</aside></div>
    <section><h2 className="text-xl font-bold">Các vụ việc</h2><div className="mt-3 grid gap-3">{cases.slice(1).map(c=><Link className="rounded-xl border bg-white p-4" to={`/cases/${c.id}`} key={c.id}>{c.title} · {STATUS[c.status]}</Link>)}</div></section>
  </div>}
