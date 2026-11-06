import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPreconnectOrigin } from './src/config/apiBaseUrl'

// Adds <link rel="preconnect"> for the API to index.html, so the DNS/TCP/TLS
// handshake runs while the JS bundle downloads instead of after it.
// Skipped when the API is same-origin (VITE_API_BASE_URL=/api in docker).
// No `crossorigin`: apiRequest sends credentials: "include" and <img> loads
// are credentialed too, and an anonymous preconnect would open a socket
// neither of them can reuse.
function apiPreconnect(): Plugin {
  let origin: string | null = null
  return {
    name: 'api-preconnect',
    configResolved(config) {
      // config.env holds VITE_* from .env files and from the shell.
      origin = apiPreconnectOrigin(config.env.VITE_API_BASE_URL)
    },
    transformIndexHtml() {
      if (!origin) {
        return []
      }
      return [{ tag: 'link', attrs: { rel: 'preconnect', href: origin }, injectTo: 'head' }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiPreconnect()],
})
