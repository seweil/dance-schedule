import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initRum } from './lib/rum'
import { installStaleChunkReload } from './lib/staleChunkReload'
import './index.css'

initRum()
installStaleChunkReload()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
