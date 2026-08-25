import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { migrateLegacyFf2Data } from './emulator/migrations'
import './styles.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Service worker registration failed:', error)
    })
  })
}

async function renderApp() {
  try {
    await migrateLegacyFf2Data()
  } catch (error) {
    console.error('无法迁移《宇宙战将》的旧数据：', error)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void renderApp()
