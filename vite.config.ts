import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Replaces %BRAND_NAME% in index.html with the name from src/config/brand.json
function brandHtml(): Plugin {
  const { name, tagline } = JSON.parse(readFileSync(new URL('./src/config/brand.json', import.meta.url), 'utf8')) as { name: string; tagline: string }
  // The embedded logo; if that file is ever missing the build still works and the page falls back to the logo file.
  let logo = '/img/logo-mark.png'
  try { logo = (JSON.parse(readFileSync(new URL('./src/shared/logo-data.json', import.meta.url), 'utf8')) as { mark: string }).mark } catch { /* keep the file path */ }
  const site = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
  return { name: 'brand-html', transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', name).replaceAll('%BRAND_HEAD%', name.length > 4 && name.startsWith('Help') ? name.slice(0, 4) : name).replaceAll('%BRAND_TAIL%', name.length > 4 && name.startsWith('Help') ? name.slice(4) : '').replaceAll('%BRAND_TAGLINE%', tagline).replaceAll('%SITE_URL%', site).replaceAll('%LOGO_DATA%', logo) }
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

// Preloads the two fonts the first screen needs (body text and the Plus Jakarta Sans headline), so the browser fetches them in parallel with the script instead of after it.
function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(inter-latin-400-normal|plus-jakarta-sans-latin-800-normal)-[\w-]+\.woff2$/.test(f))
        const tags = files.map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${f}" />`).join('\n    ')
        return tags ? html.replace('</head>', `    ${tags}\n  </head>`) : html
      },
    },
  }
}

// The biggest picture on the first screen (the lawn tile) is requested right away with high priority (home page only), instead of waiting for the stylesheet and layout to reveal it.
function preloadHeroImage(): Plugin {
  return {
    name: 'preload-hero-image',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const f = Object.keys(ctx.bundle ?? {}).find((k) => /^assets\/lawn-s-[\w-]+\.webp$/.test(k))
        // Only the home page shows that picture: a tiny script adds the preload there and nowhere else (login, sign-up and the other app pages share this same file).
        const js = `if(location.pathname==="/"){var l=document.createElement("link");l.rel="preload";l.as="image";l.type="image/webp";l.setAttribute("fetchpriority","high");l.href="/${f}";document.head.appendChild(l)}`
        return f ? html.replace('</head>', `    <script>${js}</script>\n  </head>`) : html
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), brandHtml(), inlineCss(), preloadFonts(), preloadHeroImage()],
  build: { sourcemap: false }, // source maps would publish the original source to everyone
})
