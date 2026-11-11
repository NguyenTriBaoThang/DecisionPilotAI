import { useState } from 'react'
import { Layers } from 'lucide-react'
import { decimal, moneyCompact, percent, type Row, type Scenario } from '../../../api'
import { Button, Card, Empty, SectionTitle, StatusBadge, Table } from '../../../ui'
import { Scenario3DLandscape } from '../../../components/Scenario3DLandscape'

interface ComparisonModeViewProps {
  scenarioData?: Scenario | null
}

export function ComparisonModeView({ scenarioData }: ComparisonModeViewProps) {
  const [metricKey, setMetricKey] = useState<'profit' | 'revenue' | 'demand'>('profit')
  if (!scenarioData) {
    return (
      <Card>
        <Empty text="Run a scenario simulation in Planning Studio to compare baseline and alternative outcomes side-by-side." />
      </Card>
    )
  }
  const variants: Row[] = [scenarioData.baseline, ...scenarioData.alternatives]
  const recommendedName = String(scenarioData.recommended.name)

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
