import { useState } from 'react'
import { RELATIONAL_TABLES, type TableDef } from '../data/schema'
import { Database, Key, Link2, FileSpreadsheet } from 'lucide-react'

export function Section04Schema() {
  const [activeTableIdx, setActiveTableIdx] = useState(3) // default sales_transactions
  const activeTable = RELATIONAL_TABLES[activeTableIdx]

  return (
    <section id="sec-data-schema">
      <h2>
        <span className="sec-badge">04</span>
        Data Architecture &amp; Relational Schema
      </h2>

      <p className="lead">
        The data model is engineered in Third Normal Form (3NF) to guarantee referential integrity across multi-branch retail transactions, marketing spend, and warehouse inventory movements.
      </p>

      {/* Stats summary bar */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-box">
          <div className="stat-value">6 Tables</div>
          <div className="stat-label">Normalized Relational Model</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">50,000+</div>
          <div className="stat-label">Sales Transactions Indexed</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">VND Integer</div>
          <div className="stat-label">Currency Precision (No Floats)</div>
        </div>
      </div>

      <h3>Interactive Table Schema Browser</h3>
      <p>
        Select a table below to inspect its column definitions, primary keys, foreign key constraints, and descriptions:
      </p>

      {/* Table selector buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {RELATIONAL_TABLES.map((t, idx) => (
          <button
            key={t.name}
            type="button"
            onClick={() => setActiveTableIdx(idx)}
            style={{
              background: activeTableIdx === idx ? 'var(--indigo)' : 'var(--surface)',
              color: activeTableIdx === idx ? '#FFFFFF' : 'var(--text-muted)',
              border: `1px solid ${activeTableIdx === idx ? 'var(--cyan)' : 'var(--line)'}`,
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <FileSpreadsheet size={15} className={activeTableIdx === idx ? 'cyan' : 'dim'} />
            <span className="mono">{t.name}</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>({t.rowCount})</span>
          </button>
        ))}
      </div>

      {/* Selected Table details */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line-bright)',
          borderRadius: '10px',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.2rem', textTransform: 'none' }}>
              <span className="mono cyan">table:</span> {activeTable.name}
            </h4>
            <p className="dim" style={{ fontSize: '0.88rem', margin: '4px 0 0 0' }}>{activeTable.description}</p>
          </div>
          <span className="badge badge-green">{activeTable.rowCount}</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Column Name</th>
                <th>SQL Type</th>
                <th>Key Constraint</th>
                <th>Nullable</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {activeTable.columns.map((col, cIdx) => (
                <tr key={cIdx}>
                  <td className="mono" style={{ color: '#FFFFFF', fontWeight: 600 }}>{col.name}</td>
                  <td className="mono" style={{ color: 'var(--cyan)' }}>{col.type}</td>
                  <td>
                    {col.pk && (
                      <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Key size={10} /> PRIMARY KEY
                      </span>
                    )}
                    {col.fk && (
                      <span className="badge badge-indigo" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Link2 size={10} /> FK &rarr; {col.fk}
                      </span>
                    )}
                    {!col.pk && !col.fk && <span className="dim mono">—</span>}
                  </td>
                  <td>
                    <span className={`badge ${col.nullable ? 'badge-amber' : 'badge-green'}`}>
                      {col.nullable ? 'NULLABLE' : 'NOT NULL'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{col.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

