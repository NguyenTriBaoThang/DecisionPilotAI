import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Highlight } from './Highlight'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard fallback
    }
  }

  return (
    <div className="code-box">
      <div className="code-header">
        <span>{label ?? 'snippet'}</span>
        <button type="button" className="btn-copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Check size={14} className="green" /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre tabIndex={0}>
        <code>
          <Highlight code={code} />
        </code>
      </pre>
    </div>
  )
}

