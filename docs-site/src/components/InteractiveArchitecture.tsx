import { useState } from 'react'
import { ARCH_NODES, ARCH_TIERS } from '../data/architecture'
import { Layers, Terminal, ShieldCheck, Cpu, Database } from 'lucide-react'

export function InteractiveArchitecture() {
  const [selectedNode, setSelectedNode] = useState(ARCH_NODES[0])

  const getTierIcon = (tierId: string) => {
    switch (tierId) {
      case 'client':
        return <Layers size={16} className="cyan" />
      case 'gateway':
        return <ShieldCheck size={16} className="violet" />
      case 'orchestration':
        return <Terminal size={16} className="indigo" />
      case 'ml':
        return <Cpu size={16} className="green" />
      case 'data':
        return <Database size={16} className="amber" />
      default:
        return <Layers size={16} />
    }
  }

  return (
    <div style={{ margin: '24px 0' }}>
      <div className="grid-2">
        {/* Tier List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ARCH_TIERS.map((tier) => (
            <div
              key={tier.id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '12px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                {getTierIcon(tier.id)}
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#FFFFFF' }}>{tier.name}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {ARCH_NODES.filter((n) => n.tier.toLowerCase().includes(tier.id)).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNode(node)}
                    style={{
                      background: selectedNode.id === node.id ? 'var(--indigo)' : 'var(--panel)',
                      color: selectedNode.id === node.id ? '#FFFFFF' : 'var(--text-muted)',
                      border: `1px solid ${selectedNode.id === node.id ? 'var(--cyan)' : 'var(--line)'}`,
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      fontWeight: selectedNode.id === node.id ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {node.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Selected Component Details */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line-bright)',
            borderRadius: '10px',
            padding: '20px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span className="badge badge-cyan">{selectedNode.tier}</span>
            <span className="mono dim" style={{ fontSize: '0.75rem' }}>
              {selectedNode.location}
            </span>
          </div>

          <h3 style={{ marginTop: 0, marginBottom: '6px', color: '#FFFFFF', fontSize: '1.2rem' }}>
            {selectedNode.label}
          </h3>
          <p className="dim" style={{ fontSize: '0.88rem', marginBottom: '16px' }}>
            {selectedNode.sub}
          </p>

          <div style={{ marginBottom: '14px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--cyan)', fontWeight: 700, marginBottom: '4px' }}>
              Core Responsibility
            </span>
            <p style={{ fontSize: '0.92rem', color: '#CBD5E1', marginBottom: 0 }}>
              {selectedNode.responsibility}
            </p>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--green)', fontWeight: 700, marginBottom: '4px' }}>
              Technology Stack
            </span>
            <span className="mono" style={{ fontSize: '0.85rem', color: '#A5F3FC' }}>
              {selectedNode.technology}
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--violet)', fontWeight: 700, marginBottom: '4px' }}>
              Source Code Path
            </span>
            <code style={{ fontSize: '0.82rem' }}>{selectedNode.location}</code>
          </div>
        </div>
      </div>
    </div>
  )
}

