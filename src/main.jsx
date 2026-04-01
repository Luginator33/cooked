import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App, { AppErrorBoundary } from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Auto-refresh when a new version is deployed — no user action needed
// Checks every 5 minutes for updates; reloads silently when found
const updateSW = registerSW({
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {
    console.log('[PWA] App ready for offline use')
  },
})
// Check for updates every 5 minutes while the app is open
setInterval(() => { updateSW(true) }, 5 * 60 * 1000)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
