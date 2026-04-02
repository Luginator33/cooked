import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App, { AppErrorBoundary } from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Auto-refresh when a new version is deployed
// Only reloads when the app comes back from background (not mid-use)
let pendingUpdate = false
const updateSW = registerSW({
  onNeedRefresh() {
    pendingUpdate = true
    // If page is hidden (app in background), reload immediately
    if (document.hidden) window.location.reload()
    // Otherwise wait until user backgrounds the app or next visibility change
  },
  onOfflineReady() {
    console.log('[PWA] App ready for offline use')
  },
})
// When user returns to app after backgrounding, apply pending update
document.addEventListener('visibilitychange', () => {
  if (pendingUpdate && document.visibilityState === 'visible') {
    window.location.reload()
  }
})
// Check for updates every 10 minutes while the app is open
setInterval(() => { updateSW(true) }, 10 * 60 * 1000)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
