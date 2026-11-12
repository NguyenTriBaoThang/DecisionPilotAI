import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../preferences'
import type { IllusName } from './illustrations'
import { Illus, PageHero } from './ui'

const CARDS: { to: string; illus: IllusName; title: string; body: string; color: string }[] = [
  { to: '/advanced/copilot', illus: 'robot', title: 'Document copilot', body: 'Ask questions across uploaded documents, with citations.', color: '#ede9fe' },
  { to: '/advanced/simulator-3d', illus: 'airplane', title: '3D view & digital twin', body: 'See stores, warehouses and channels as a 3D map.', color: '#ffedd5' },
  { to: '/knowledge-map', illus: 'chartup', title: 'Where a number came from', body: 'Trace any figure back to its file and model.', color: '#dbeafe' },
  { to: '/recommendations', illus: 'bulb', title: 'Explainable recommendations', body: 'Why the AI suggested something, factor by factor.', color: '#fef3c7' },
  { to: '/audit', illus: 'clipboard', title: 'Audit trail', body: 'Tamper-evident log of models and decisions.', color: '#dcfce7' },
  { to: '/anomalies', illus: 'warning', title: 'Warning details', body: 'Every unusual change with its evidence.', color: '#ffe4e6' },
  { to: '/forecast', illus: 'crystal', title: 'Forecast details', body: 'Daily forecast, accuracy and model choice.', color: '#e0f2fe' },
  { to: '/docs', illus: 'filebox', title: 'Technical documentation', body: 'Architecture, data model and API.', color: '#f1f5f9' },
]

export function AdvancedPage() {
  const { t } = useT()
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
      <PageHero tone="neutral" title={t('Advanced')} subtitle={t('Extra tools for analysts. The four main tabs are enough for daily use.')} illus="testtube" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group relative flex flex-col gap-2 overflow-hidden rounded-[18px] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span aria-hidden="true" className="absolute -right-8 -top-8 h-24 w-24 rounded-full" style={{ background: c.color }} />
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl" style={{ background: c.color }}>
              <Illus name={c.illus} size={30} />
            </span>
            <span className="relative font-extrabold text-slate-900">{t(c.title)}</span>
            <span className="relative text-[13px] text-slate-600">{t(c.body)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Dữ liệu: the existing data-sources workspace under the new header. */
export function DataPage({ children }: { children: ReactNode }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-5">
      <PageHero tone="neutral" title={t('Data')} subtitle={t('Bring in your sales, stock and ad files. Nothing reaches your numbers until you approve it.')} illus="filebox" />
      {children}
    </div>
  )
}
