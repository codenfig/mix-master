import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './styles/mixmaster-theme.css'
import './styles/mockup-layout.css'
import './styles/legacy-pages-theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

/**
 * Vite development should never be controlled by a stale PWA service worker.
 * Old registrations can intercept large /api/stem-splitter ZIP responses and fail.
 * Unregister only in development; do not change production offline behavior.
 */
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      const origin = window.location.origin
      const stale = registrations.filter(reg => reg.scope.startsWith(origin + '/'))
      if (!stale.length) return
      await Promise.all(stale.map(reg => reg.unregister()))
      // Unregistration doesn't release the controller of the current document.
      // Reload once so API requests use the normal Vite proxy.
      if (navigator.serviceWorker.controller && !sessionStorage.getItem('mixmaster-sw-cleanup-reloaded')) {
        sessionStorage.setItem('mixmaster-sw-cleanup-reloaded', '1')
        window.location.reload()
      }
    } catch (error) {
      console.warn('Could not clean up stale development service workers:', error)
    }
  })()
}
