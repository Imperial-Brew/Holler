import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// The browser only checks for a new service worker on navigation, and an
// installed PWA rarely navigates — so deploys never reached devices. Check
// hourly and whenever the app comes back to the foreground; registerType
// autoUpdate then activates the new worker and reloads.
registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
