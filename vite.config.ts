import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Replaces %BRAND_NAME% in index.html with the name from src/config/brand.json
function brandHtml(): Plugin {
  const { name, tagline } = JSON.parse(readFileSync(new URL('./src/config/brand.json', import.meta.url), 'utf8')) as { name: string; tagline: string }
  const site = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
  return { name: 'brand-html', transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', name).replaceAll('%BRAND_TAGLINE%', tagline).replaceAll('%SITE_URL%', site) }
}

// Inlines the (small) built stylesheet into index.html so CSS no longer blocks the first paint.
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        return html.replace(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g, (match, href: string) => {
          const asset = bundle[href.replace(/^\//, '')]
          if (!asset || asset.type !== 'asset') return match
          delete bundle[asset.fileName]
          return `<style>${String(asset.source)}</style>`
        })
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), brandHtml(), inlineCss()],
  build: { sourcemap: true },
})
