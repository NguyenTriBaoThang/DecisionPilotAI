import { useState } from 'react'
import { TabAskData } from './TabAskData'
import { TabRevenueAnalysis } from './TabRevenueAnalysis'
import { TabDemandForecasting } from './TabDemandForecasting'
import { TabScenarioSimulation } from './TabScenarioSimulation'
import { FromDataToDecisionStory } from './FromDataToDecisionStory'
import { CompetitionAlignmentTable } from './CompetitionAlignmentTable'
import { MessageSquareText, AlertCircle, TrendingUp, Sliders } from 'lucide-react'
import type { IntelTabId } from '../../routes'

interface DataDecisionIntelligenceSectionProps {
  activeTab?: IntelTabId
  onTabChange?: (tab: IntelTabId) => void
}

export function DataDecisionIntelligenceSection({
  activeTab: controlledTab,
  onTabChange,
}: DataDecisionIntelligenceSectionProps = {}) {
  const [internalTab, setInternalTab] = useState<IntelTabId>('ask')
  const activeTab = controlledTab ?? internalTab
  const setActiveTab = (next: IntelTabId) => {
    setInternalTab(next)
    onTabChange?.(next)
  }

  const tabs = [
    {
      id: 'ask' as const,
      num: '01',
      title: 'Ask Data',
      subtitle: 'Natural Language Analytics',
      icon: MessageSquareText,
      color: 'var(--cyan)',
      badge: 'Read-Only Tools',
    },
    {
      id: 'analyze' as const,
      num: '02',
      title: 'Analyze',
      subtitle: 'Revenue Diagnostics & Anomalies',
      icon: AlertCircle,
      color: '#F87171',
      badge: 'Isolation Forest & Z-Score',
    },
    {
      id: 'forecast' as const,
      num: '03',
      title: 'Forecast',
      subtitle: 'AI Demand Forecasting',
      icon: TrendingUp,
      color: 'var(--indigo)',
      badge: 'LightGBM 90% Bounds',
    },
    {
      id: 'simulate' as const,
      num: '04',
      title: 'Simulate',
      subtitle: 'Scenario Simulation Sandbox',
      icon: Sliders,
      color: '#A78BFA',
      badge: 'Elasticity & Saturation',
    },
  ]

  return (
    <section id="sec-data-decision-intelligence">
      {/* Flagship Section Header */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span className="badge badge-indigo">FLAGSHIP PILLAR · SECTION 05</span>
          <span className="badge badge-cyan">LIKELION 2026 TOPIC SHOWCASE</span>
          <span className="badge badge-green">4 / 4 CAPABILITIES IMPLEMENTED</span>
        </div>

        <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', margin: 0 }}>
          Data &amp; Decision Intelligence
        </h2>

        <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--cyan)', margin: '8px 0 16px 0' }}>
          From Data to Decision &mdash; Ask. Understand. Predict. Decide.
        </p>

        <p style={{ fontSize: '0.9rem', color: 'var(--amber)', maxWidth: '920px', lineHeight: 1.6, margin: '0 0 12px 0' }}>
          <strong>Illustrative walkthrough.</strong> The interactive tabs below use built-in sample data to explain the ideas. Measured results are in the Benchmarks chapter; they come from a synthetic dataset and do not establish accuracy on a real business.
        </p>

        <p style={{ fontSize: '1rem', color: '#CBD5E1', maxWidth: '920px', lineHeight: 1.7, margin: 0 }}>
          The core objective of DecisionPilot AI is bridging the gap between complex raw transactional records and executive business decision making. Instead of disjointed dashboard charts, the platform operates as an integrated intelligence loop: converting natural language inquiries into audited data reports, flagging high-impact anomalies with root cause explanations, forecasting future demand curves with calibrated confidence intervals, and stress-testing strategy trade-offs prior to capital commitment.
        </p>
      </div>

      {/* 4 Interactive Feature Tabs Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: isActive ? 'var(--surface)' : 'rgba(12, 18, 36, 0.6)',
                border: `1px solid ${isActive ? tab.color : 'var(--line)'}`,
                boxShadow: isActive ? `0 0 20px ${tab.color}25` : 'none',
                borderRadius: '12px',
                padding: '16px 18px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'all 0.25s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', color: isActive ? tab.color : '#64748B', fontWeight: 800 }}>
                  CAPABILITY {tab.num}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#94A3B8',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {tab.badge}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: isActive ? `${tab.color}20` : 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={18} color={isActive ? tab.color : '#94A3B8'} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: isActive ? '#FFFFFF' : '#CBD5E1' }}>
                    {tab.title}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '1px' }}>
                    {tab.subtitle}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active Tab Content Panel */}
      <div style={{ marginBottom: '48px' }}>
        {activeTab === 'ask' && <TabAskData />}
        {activeTab === 'analyze' && <TabRevenueAnalysis />}
        {activeTab === 'forecast' && <TabDemandForecasting />}
        {activeTab === 'simulate' && <TabScenarioSimulation />}
      </div>

      {/* End-to-End Enterprise Case Study: The September-October Turnaround */}
      <div style={{ marginBottom: '48px' }}>
        <FromDataToDecisionStory />
      </div>

      {/* Competition Alignment & Traceability Matrix */}
      <div>
        <CompetitionAlignmentTable />
      </div>
    </section>
  )
}
