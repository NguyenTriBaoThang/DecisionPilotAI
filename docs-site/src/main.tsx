import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { restoreDocsRedirectIfNeeded } from './routes'
import './styles.css'

restoreDocsRedirectIfNeeded()

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
