import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/500.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/noto-serif-jp/400.css'
import '@fontsource/noto-serif-jp/500.css'
import './design/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from './auth/AuthContext.tsx'
import { storedLanguage } from './auth/authStorage.ts'
import { LanguageProvider } from './lang/LanguageContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* A signed-in member reloads in their own language; everyone else starts in Japanese. */}
    <LanguageProvider initialLanguage={storedLanguage()}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
)
