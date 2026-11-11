import { useState } from 'react'
import { Layers } from 'lucide-react'
import { decimal, moneyCompact, percent, type Row, type Scenario } from '../../../api'
import { Button, Card, SectionTitle, StatusBadge, Table } from '../../../ui'
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
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers size={17} style={{ color: 'var(--primary)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--heading)' }}>
              Interactive 3D Scenario Landscape
            </h3>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="mr-1" style={{ color: 'var(--text-secondary)' }}>
              Height Metric:
            </span>
            {(['profit', 'revenue', 'demand'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={metricKey === m ? 'primary' : 'outline'}
                onClick={() => setMetricKey(m)}
                className="capitalize"
              >
                {m}
              </Button>
            ))}
          </div>
        </div>

        <Scenario3DLandscape
          variants={variants}
          recommendedName={recommendedName}
          metricKey={metricKey}
        />
      </div>

      <Card>
        <SectionTitle
          title="Full Comparative Matrix (2D View)"
          detail="Direct evaluation across financial and operational dimensions"
          aside={<StatusBadge tone="success">Validated Model Calculations</StatusBadge>}
        />

        <Table
          rows={variants}
          columns={[
            { key: 'name', title: 'Scenario Candidate' },
            { key: 'demand', title: 'Simulated Demand', format: decimal, align: 'right' },
            { key: 'fulfilled', title: 'Fulfillment Capacity', format: decimal, align: 'right' },
            { key: 'revenue', title: 'Total Revenue', format: moneyCompact, align: 'right' },
            { key: 'profit', title: 'Contribution Profit', format: moneyCompact, align: 'right' },
            { key: 'margin', title: 'Gross Margin', format: percent, align: 'right' },
            {
              key: 'risk',
              title: 'Stockout Risk Units',
              format: (v) => (v != null && v > 0 ? `${v} unfulfilled` : 'None'),
              align: 'right',
            },
          ]}
        />
      </Card>
    </div>
  )
}
