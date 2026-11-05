import { useState } from 'react'
import { Check, Layers, SlidersHorizontal, Table as TableIcon } from 'lucide-react'
import { decimal, integer, moneyCompact, percent, type Row, type Scenario } from '../../../api'
import { Card, Pill, SectionTitle, Table } from '../../../ui'
import { Scenario3DLandscape } from '../../../components/Scenario3DLandscape'

interface ComparisonModeViewProps {
  scenarioData?: Scenario | null
}

export function ComparisonModeView({ scenarioData }: ComparisonModeViewProps) {
  const [metricKey, setMetricKey] = useState<'profit' | 'revenue' | 'demand'>('profit')
  const variants: Row[] = scenarioData
    ? [scenarioData.baseline, ...scenarioData.alternatives]
    : [
        {
          name: 'Baseline (0% Discount)',
          demand: 180,
          fulfilled: 180,
          revenue: 144000000,
          gross_profit: 64800000,
          profit: 64800000,
          margin: 0.45,
          risk: null,
        },
        {
          name: 'Scenario A (5% Discount)',
          demand: 228,
          fulfilled: 228,
          revenue: 173280000,
          gross_profit: 72960000,
          profit: 72960000,
          profit_delta: 8160000,
          margin: 0.421,
          risk: null,
        },
        {
          name: 'Scenario B (10% Discount)',
          demand: 276,
          fulfilled: 250,
          revenue: 180000000,
          gross_profit: 70000000,
          profit: 70000000,
          profit_delta: 5200000,
          margin: 0.388,
          risk: 26,
        },
      ]

  const recommendedName = scenarioData
    ? String(scenarioData.recommended.name)
    : 'Scenario A (5% Discount)'

  return (
    <div className="space-y-6">
      {/* 3D Comparative Landscape */}
      <div>
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Layers className="text-cyan-400" size={18} />
            <h3 className="text-base font-extrabold text-white">Interactive 3D Scenario Landscape</h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Height Metric:</span>
            <button
              onClick={() => setMetricKey('profit')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                metricKey === 'profit' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              Profit
            </button>
            <button
              onClick={() => setMetricKey('revenue')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                metricKey === 'revenue' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              Revenue
            </button>
            <button
              onClick={() => setMetricKey('demand')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                metricKey === 'demand' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              Demand
            </button>
          </div>
        </div>

        <Scenario3DLandscape
          variants={variants}
          recommendedName={recommendedName}
          metricKey={metricKey}
        />
      </div>

      {/* Side-by-Side 2D Matrix Table */}
      <Card>
        <SectionTitle
          title="Full Comparative Matrix (2D View)"
          detail="Direct evaluation across financial and operational dimensions"
          aside={<Pill tone="success">Validated Model Calculations</Pill>}
        />

        <Table
          rows={variants}
          columns={[
            { key: 'name', title: 'Scenario Candidate' },
            { key: 'demand', title: 'Simulated Demand', format: decimal },
            { key: 'fulfilled', title: 'Fulfillment Capacity', format: decimal },
            { key: 'revenue', title: 'Total Revenue', format: moneyCompact },
            { key: 'profit', title: 'Contribution Profit', format: moneyCompact },
            { key: 'margin', title: 'Gross Margin', format: percent },
            {
              key: 'risk',
              title: 'Stockout Risk Units',
              format: (v) => (v != null && v > 0 ? `${v} unfulfilled` : 'None'),
            },
          ]}
        />
      </Card>
    </div>
  )
}

