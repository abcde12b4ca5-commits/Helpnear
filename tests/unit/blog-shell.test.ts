import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../scripts/prerender.mjs', import.meta.url), 'utf8')

describe('page shell used by the blog and the static pages', () => {
  it('only the top menu is sticky: the table of contents, breadcrumbs and filters are <nav> too and must scroll away with the article', () => {
    expect(src).toContain('body>nav{position:sticky')
    expect(src).not.toMatch(/(^|[;}\s])nav\{position:sticky/m)
  })
  it('the logo is embedded in the page, never requested as a separate file that could fail to load', () => {
    expect(src).toContain('logo-data.json')
    expect(src).not.toContain('src="/img/logo-mark.png"')
  })
})
