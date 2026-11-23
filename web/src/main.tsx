import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void (async () => {
    try {
      const registrations=await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.filter(reg=>reg.scope.startsWith(window.location.origin+'/')).map(reg=>reg.unregister()))
    } catch(error) { console.warn('Unable to clear legacy service-worker registrations',error) }
  })()
}
