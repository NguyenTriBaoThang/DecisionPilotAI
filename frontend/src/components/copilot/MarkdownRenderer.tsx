import { Fragment, type ReactNode } from 'react'

type Props = {
  content: string
  onCitationClick?: (citationId: string) => void
  validCitationIds?: Set<string>
}

function renderInline(
  text: string,
  onCitationClick?: (citationId: string) => void,
  validCitationIds?: Set<string>
): ReactNode[] {
  const tokenRx = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[C\d+\])/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let k = 0

  while ((match = tokenRx.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const tok = match[0]
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      nodes.push(
        <strong key={`b-${k++}`} className="font-semibold" style={{ color: 'var(--heading)' }}>
          {tok.slice(2, -2)}
        </strong>
      )
    } else if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      nodes.push(
        <code
          key={`c-${k++}`}
          className="rounded px-1.5 py-0.5 text-[12px] font-mono border"
          style={{
            background: 'var(--surface-muted)',
            borderColor: 'var(--border)',
            color: 'var(--primary-text)',
          }}
        >
          {tok.slice(1, -1)}
        </code>
      )
    } else if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
      nodes.push(
        <em key={`i-${k++}`} className="italic">
          {tok.slice(1, -1)}
        </em>
      )
    } else if (/^\[C\d+\]$/.test(tok)) {
      const cid = tok.slice(1, -1)
      const isValid = !validCitationIds || validCitationIds.has(cid)
      if (isValid && onCitationClick) {
        nodes.push(
          <button
            key={`cit-${k++}`}
            type="button"
            onClick={() => onCitationClick(cid)}
            className="mx-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold border transition-colors hover:brightness-95 align-baseline"
            style={{
              background: 'var(--primary-soft)',
              borderColor: 'var(--primary-border)',
              color: 'var(--primary-text)',
            }}
            aria-label={`Inspect citation ${cid}`}
            title={`Inspect citation ${cid}`}
          >
            {tok}
          </button>
        )
      } else {
        nodes.push(tok)
      }
    } else {
      nodes.push(tok)
    }
    lastIndex = match.index + tok.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim()
  return /^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)
}

function splitPipeRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim())
}

export function MarkdownRenderer({ content, onCitationClick, validCitationIds }: Props) {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let keyIdx = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push(
        <div
          key={`code-${keyIdx++}`}
          className="rounded-xl border overflow-hidden my-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
        >
          {lang && (
            <div
              className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider border-b"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {lang}
            </div>
          )}
          <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed" style={{ color: 'var(--heading)' }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    // Markdown table
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitPipeRow(line)
      i += 2
      const bodyRows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        bodyRows.push(splitPipeRow(lines[i]))
        i += 1
      }
      blocks.push(
        <div
          key={`tbl-${keyIdx++}`}
          className="my-2 overflow-x-auto rounded-xl border"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 font-semibold whitespace-nowrap"
                    style={{ color: 'var(--heading)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="border-t hover:bg-[var(--surface-muted)] transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {renderInline(row[cIdx] ?? '—', onCitationClick, validCitationIds)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      const sizeClass =
        level === 1
          ? 'text-base font-bold mt-2'
          : level === 2
          ? 'text-sm font-bold mt-2'
          : 'text-xs font-bold uppercase tracking-wide mt-2'
      blocks.push(
        <div
          key={`h-${keyIdx++}`}
          className={sizeClass}
          style={{ color: level === 3 ? 'var(--primary-text)' : 'var(--heading)' }}
        >
          {renderInline(text, onCitationClick, validCitationIds)}
        </div>
      )
      i += 1
      continue
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`ul-${keyIdx++}`} className="list-disc pl-5 space-y-1 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, onCitationClick, validCitationIds)}</li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`ol-${keyIdx++}`} className="list-decimal pl-5 space-y-1 text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, onCitationClick, validCitationIds)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Paragraph (gather contiguous non-special lines)
    const paraLines: string[] = [trimmed]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s+|[-*]\s+|\d+\.\s+|```)/.test(lines[i].trim()) &&
      !isTableRow(lines[i])
    ) {
      paraLines.push(lines[i].trim())
      i += 1
    }
    blocks.push(
      <p key={`p-${keyIdx++}`} className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
        {paraLines.map((pl, idx) => (
          <Fragment key={idx}>
            {idx > 0 && ' '}
            {renderInline(pl, onCitationClick, validCitationIds)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="space-y-2.5">{blocks}</div>
}

