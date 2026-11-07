import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Replaces %BRAND_NAME% in index.html with the name from src/config/brand.json
function brandHtml(): Plugin {
  const { name } = JSON.parse(readFileSync(new URL('./src/config/brand.json', import.meta.url), 'utf8')) as { name: string }
  return { name: 'brand-html', transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', name) }
}

export default defineConfig({
  plugins: [react(), brandHtml()],
})
