import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted, not a Google Fonts CDN dependency -- this tool's whole
// premise is running locally with nothing phoning out (mail is caught by
// Mailpit, certs are local, etc.), so the dashboard shouldn't need a live
// connection to render its own UI.
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { initTheme } from './theme';
import App from './App.jsx'

initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
