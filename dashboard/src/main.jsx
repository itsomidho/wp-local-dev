import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted, not a Google Fonts CDN dependency -- this tool's whole
// premise is running locally with nothing phoning out (mail is caught by
// Mailpit, certs are local, etc.), so the dashboard shouldn't need a live
// connection to render its own UI.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import '@fontsource/fira-code/600.css'
import './index.css'
import { initTheme } from './theme';
import App from './App.jsx'
import { ToastProvider } from './components/ui'

initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
