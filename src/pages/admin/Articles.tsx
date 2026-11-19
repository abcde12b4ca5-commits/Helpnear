import { useCallback, useEffect, useMemo, useState } from 'react'
import { callWorker, deleteArticle, EMPTY_ARTICLE, getArticleSettings, listArticles, saveArticle, saveArticleSettings, type Angle, type ArticleDoc, type ArticleSettings, type Photo, type RunNowResult } from '../../lib/articles'
import { checkArticle, makeSlug, MAX_PER_TITLE, MAX_QUEUE, parseQueue, renderMarkdown, type ArticleFields } from '../../shared/articles'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Field, Pill, btn, btnGhost, card, input } from '../../components/ui'

const when = (a?: { toDate(): Date }) => (a ? a.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function Articles() {
  const [items, setItems] = useState<ArticleDoc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; fields: ArticleFields; status: ArticleDoc['status'] } | null>(null)
  const reload = useCallback(() => { listArticles().then(setItems).catch((e) => setError(friendlyError(e))) }, [])
  useEffect(reload, [reload])

  if (editing) return <Editor key={editing.id ?? 'new'} start={editing} others={(items ?? []).filter((a) => a.id !== editing.id).map((a) => a.title)} onClose={() => { setEditing(null); reload() }} />
  return (
    <div className="space-y-6">
      <ErrorBox message={error} />
      <SettingsPanel />
      <GeneratePanel onDone={reload} />
      <section className={`${card} space-y-3`} aria-labelledby="art-list">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="art-list" className="text-xl">Articles ({items?.length ?? '…'})</h2>
          <button type="button" className={btn} onClick={() => setEditing({ id: null, fields: EMPTY_ARTICLE, status: 'draft' })}>Write an article</button>
        </div>
        {items?.length === 0 && <p className="text-sm text-mu">No articles yet. Generate some above or write your own.</p>}
        <ul className="divide-y divide-ln">
          {(items ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="text-xs text-mu">/blog/{a.slug} · {a.wordCount ?? 0} words · {a.source === 'ai' ? 'AI draft' : 'written by hand'} · {when(a.status === 'published' ? a.publishedAt : a.createdAt)}</p>
              </div>
              <Pill tone={a.status === 'published' ? 'g' : 'y'}>{a.status === 'published' ? 'Published' : 'Draft'}</Pill>
              {a.status === 'published' && <a className={btnGhost} href={`/blog/${a.slug}`} target="_blank" rel="noreferrer">View</a>}
              <button type="button" className={btnGhost} onClick={() => setEditing({ id: a.id, fields: { ...EMPTY_ARTICLE, ...a }, status: a.status })}>Edit</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const PERIODS: [number, string][] = [[1, 'day'], [2, '2 days'], [3, '3 days'], [7, 'week']]
function SettingsPanel() {
  const [s, setS] = useState<ArticleSettings | null>(null)
  const [saved, setSaved] = useState<{ settings: ArticleSettings; topics: string } | null>(null)
  const [topics, setTopics] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => getArticleSettings().then((x) => { setS(x); setTopics(x.topics.join('\n')); setSaved({ settings: x, topics: x.topics.join('\n') }) }).catch((e) => setErr(friendlyError(e))), [])
  useEffect(() => { void load() }, [load])
  const queue = useMemo(() => parseQueue(topics), [topics])
  if (!s || !saved) return <ErrorBox message={err} />
  const dirty = topics !== saved.topics || (['mode', 'everyDays', 'perDay', 'perTitle'] as const).some((k) => s[k] !== saved.settings[k])
  const total = queue.items.reduce((n, i) => n + (i.count ?? s.perTitle), 0)
  const perPeriod = s.perDay / s.everyDays
  const days = Math.ceil(total / perPeriod)
  const lines = topics.split('\n').map((t) => t.trim()).filter(Boolean)
  const save = async () => {
    setErr(null); setMsg(null)
    if (lines.length > MAX_QUEUE) { setErr(`The list can hold ${MAX_QUEUE} titles. Remove ${lines.length - MAX_QUEUE}.`); return }
    try {
      await saveArticleSettings({ ...s, topics: lines }, lines[0] !== saved.topics.split('\n').map((t) => t.trim()).filter(Boolean)[0])
      setMsg('Saved.'); await load()
    } catch (e) { setErr(friendlyError(e)) }
  }
  const runNow = async () => {
    setErr(null); setMsg(null); setBusy('Writing one article now… this takes up to a minute.')
    try {
      const r = await callWorker<RunNowResult>('/articles/run-now', {})
      setMsg(r.ran ? `Done: “${r.title}” was ${r.published ? 'published' : 'saved as a draft'}.` : r.reason === 'off' ? 'Choose a mode other than Off first.' : `Nothing was written: ${r.reason}`)
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : friendlyError(e)) } finally { setBusy(null) }
  }
  return (
    <section className={`${card} space-y-3`} aria-labelledby="art-auto">
      <h2 id="art-auto" className="text-xl">Automatic articles</h2>
      <p className="text-sm text-mu">The worker writes articles by itself with the free Cloudflare AI, one after the other, spread evenly over the day. Paste your titles below and it works through the list from the top. When the list is empty it picks fresh topics from your services.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What to do with each new article" htmlFor="art-mode">
          <select id="art-mode" className={input} value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as ArticleSettings['mode'] })}>
            <option value="off">Off (write nothing)</option>
            <option value="draft">Save as a draft for me to review (safest)</option>
            <option value="checked">Publish by itself only if the quality checks pass, otherwise a draft</option>
            <option value="publish">Publish everything by itself (no review)</option>
          </select>
        </Field>
        <Field label="Articles to write" htmlFor="art-per">
          <div className="flex items-center gap-2">
            <select id="art-per" aria-label="Number of articles" className={input} value={s.perDay} onChange={(e) => setS({ ...s, perDay: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <span className="text-sm">per</span>
            <select aria-label="Period" className={input} value={s.everyDays} onChange={(e) => setS({ ...s, everyDays: Number(e.target.value) })}>{PERIODS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
          </div>
        </Field>
        <Field label="Articles per title (default)" htmlFor="art-title-count" hint="2 or 3 means different articles on the same subject, each answering a different search question.">
          <select id="art-title-count" className={input} value={s.perTitle} onChange={(e) => setS({ ...s, perTitle: Number(e.target.value) })}>{Array.from({ length: MAX_PER_TITLE }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </Field>
      </div>
      {s.mode === 'publish' && <p className="text-sm" style={{ color: 'var(--warn-tx)' }} role="alert">This puts AI text on your site with nobody checking it. Search engines treat many unreviewed articles as low quality. “Publish only if the checks pass” is safer.</p>}
      {s.mode === 'checked' && <p className="text-xs text-mu">Needs: 900+ words, the search phrase in the title, first paragraph and a heading, 5+ different headings, 2+ links to your service pages, no stock AI phrases, no dollar amounts, and not too similar to an existing article. A missing photo or a title a few characters long does not stop it.</p>}
      <Field label="Titles to write (one per line, from the top)" htmlFor="art-topics" hint="English titles. Optional extras on a line: “Title | search phrase | x2” (x1 to x3 sets how many articles this title gets). Without a search phrase the AI picks one.">
        <textarea id="art-topics" rows={10} className={`${input} font-mono text-sm`} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={'How to choose a lawn mowing service\nGutter cleaning before winter | gutter cleaning | x2\nWhat to ask a handyman before hiring'} />
      </Field>
      <p className="text-sm" role="status">
        {queue.items.length} titles in the list{lines.length > 0 ? ` = ${total} articles` : ''}.
        {lines.length > 0 && s.mode !== 'off' ? ` At ${s.perDay} per ${s.everyDays === 1 ? 'day' : PERIODS.find(([d]) => d === s.everyDays)?.[1]} the list lasts about ${days} ${days === 1 ? 'day' : 'days'}.` : ''}
        {queue.skipped > 0 ? <span style={{ color: 'var(--warn-tx)' }}> {queue.skipped} lines cannot be used and will be dropped (an English title of at least 8 characters is needed).</span> : null}
      </p>
      {s.lastError && <p className="text-sm text-danger-tx" role="alert">Last automatic run failed: {s.lastError}</p>}
      <ErrorBox message={err} />
      {busy && <p className="text-sm text-mu" role="status">{busy}</p>}
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} onClick={save} disabled={Boolean(busy) || !dirty}>Save settings</button>
        <button type="button" className={btnGhost} onClick={runNow} disabled={Boolean(busy) || dirty || s.mode === 'off'} title={dirty ? 'Save first' : undefined}>Write one article now</button>
      </div>
    </section>
  )
}

function GeneratePanel({ onDone }: { onDone: () => void }) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(3)
  const [angles, setAngles] = useState<(Angle & { on: boolean })[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])
  const suggest = async () => {
    setErr(null); setBusy('Finding different angles…'); setDone([])
    try { setAngles((await callWorker<{ angles: Angle[] }>('/articles/angles', { topic, count })).angles.map((a) => ({ ...a, on: !a.similarTo?.length }))) } catch (e) { setErr(friendlyError(e)) } finally { setBusy(null) }
  }
  const write = async () => {
    setErr(null); setDone([])
    const chosen = angles.filter((a) => a.on)
    for (const [i, a] of chosen.entries()) {
      setBusy(`Writing article ${i + 1} of ${chosen.length}… this takes about half a minute each`)
      try { const r = await callWorker<{ title: string }>('/articles/generate', { title: a.title, keyword: a.keyword, intent: a.intent }); setDone((d) => [...d, r.title]) } catch (e) { setErr(friendlyError(e)); break }
    }
    setBusy(null); setAngles([]); onDone()
  }
  return (
    <section className={`${card} space-y-3`} aria-labelledby="art-gen">
      <h2 id="art-gen" className="text-xl">Write articles with AI</h2>
      <p className="text-sm text-mu">Give a topic. You get several different angles (different questions people search), never the same article reworded. Each one is saved as a draft for you to edit and publish.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Topic" htmlFor="gen-topic"><input id="gen-topic" className={`${input} min-w-[16rem]`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="for example: lawn mowing" /></Field>
        <Field label="How many" htmlFor="gen-count"><select id="gen-count" className={input} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></Field>
        <button type="button" className={btn} onClick={suggest} disabled={Boolean(busy) || topic.trim().length < 3}>Find angles</button>
      </div>
      {angles.length > 0 && (
        <div className="space-y-2">
          {angles.map((a, i) => (
            <div key={i} className="rounded-xl border border-ln p-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={a.on} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /><span className="flex-1"><input aria-label="Title" className={input} value={a.title} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></span></label>
              <p className="mt-1 text-xs text-mu">Search phrase: <input aria-label="Search phrase" className={`${input} inline w-56`} value={a.keyword} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, keyword: e.target.value.toLowerCase() } : x)))} /> {a.intent}</p>
              {a.similarTo?.length ? <p className="mt-1 text-xs" style={{ color: 'var(--warn-tx)' }}>Too close to: {a.similarTo.join(' | ')}</p> : null}
            </div>
          ))}
          <button type="button" className={btn} onClick={write} disabled={Boolean(busy) || !angles.some((a) => a.on)}>Write the selected articles</button>
        </div>
      )}
      {busy && <p className="text-sm text-mu" role="status">{busy}</p>}
      {done.length > 0 && !busy && <p className="text-sm text-ok" role="status">Saved as drafts: {done.join(' | ')}</p>}
      <ErrorBox message={err} />
    </section>
  )
}

function Editor({ start, others, onClose }: { start: { id: string | null; fields: ArticleFields; status: ArticleDoc['status'] }; others: string[]; onClose: () => void }) {
  const [id, setId] = useState(start.id)
  const [status, setStatus] = useState(start.status)
  const [f, setF] = useState<ArticleFields>(start.fields)
  const [slugTouched, setSlugTouched] = useState(Boolean(start.id))
  const [preview, setPreview] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: Partial<ArticleFields>) => setF((p) => {
    const next = { ...p, ...patch }
    if (!slugTouched && ('keyword' in patch || 'title' in patch)) next.slug = makeSlug(next.keyword, next.title)
    return next
  })
  const checks = useMemo(() => checkArticle(f, others), [f, others])
  const html = useMemo(() => (preview ? renderMarkdown(f.body) : ''), [preview, f.body])

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); setMsg(null); try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : friendlyError(e)) } finally { setBusy(false) } }
  const save = () => run(async () => {
    if (f.title.trim().length < 8) throw new Error('Write a title first (at least 8 characters).')
    if (!/^[a-z0-9-]{3,70}$/.test(f.slug)) throw new Error('The link may only use lowercase letters, numbers and dashes (3 to 70 characters).')
    setId(await saveArticle(id, f)); setMsg('Saved.')
  })
  const setPublished = (publish: boolean) => run(async () => {
    const savedId = await saveArticle(id, f); setId(savedId)
    await callWorker('/articles/publish', { id: savedId, publish })
    setStatus(publish ? 'published' : 'draft'); setMsg(publish ? 'Published. It is live in a few minutes and Bing was told about it.' : 'Moved back to drafts.')
  })
  const findPhotos = () => run(async () => { setPhotos((await callWorker<{ photos: Photo[] }>('/articles/images', { query: f.keyword || f.title })).photos) })
  const remove = () => run(async () => { if (id && window.confirm('Delete this article for good?')) { await deleteArticle(id); onClose() } })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnGhost} onClick={onClose}>← All articles</button>
        <Pill tone={status === 'published' ? 'g' : 'y'}>{status === 'published' ? 'Published' : 'Draft'}</Pill>
        {status === 'published' && <a className={btnGhost} href={`/blog/${f.slug}`} target="_blank" rel="noreferrer">View live page</a>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <Field label="Title" htmlFor="a-title" hint="Up to 62 characters. Make people want to click, without tricks."><input id="a-title" className={input} value={f.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Search phrase (what people type into Google)" htmlFor="a-kw"><input id="a-kw" className={input} value={f.keyword} onChange={(e) => set({ keyword: e.target.value.toLowerCase() })} /></Field>
          <Field label="Link" htmlFor="a-slug" hint="Built from the search phrase. Do not change it after it is published."><div className="flex items-center gap-1 text-sm"><span className="text-mu">/blog/</span><input id="a-slug" className={input} value={f.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }) }} /></div></Field>
          <Field label="Search result title (SEO)" htmlFor="a-seo"><input id="a-seo" className={input} value={f.seoTitle} maxLength={70} onChange={(e) => set({ seoTitle: e.target.value })} /></Field>
          <Field label="Search result description (120 to 160 characters)" htmlFor="a-desc"><textarea id="a-desc" rows={2} className={input} value={f.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Short excerpt (shown on the blog page)" htmlFor="a-exc"><input id="a-exc" className={input} value={f.excerpt} maxLength={200} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
          <div>
            <div className="mb-1 flex items-center justify-between"><label htmlFor="a-body" className="text-sm font-semibold">Article text</label><button type="button" className={btnGhost} onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button></div>
            {preview ? <div className="post rounded-xl border border-ln p-4" dangerouslySetInnerHTML={{ __html: html }} /> : <textarea id="a-body" rows={24} className={`${input} font-mono text-sm`} value={f.body} onChange={(e) => set({ body: e.target.value })} />}
            <p className="mt-1 text-xs text-mu">Use ## for headings, **bold**, - for lists, [text](/services/lawn-care/) for links, ![description](photo link) for pictures, and a line @video(YouTube link) for a video.</p>
          </div>
        </div>
        <aside className="space-y-4">
          <section className={`${card} space-y-2`} aria-labelledby="a-img">
            <h2 id="a-img" className="text-base">Picture</h2>
            {f.imageUrl && <img src={f.imageUrl} alt={f.imageAlt} className="w-full rounded-lg" />}
            <Field label="Picture link (Pexels)" htmlFor="a-imgurl"><input id="a-imgurl" className={input} value={f.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} /></Field>
            <Field label="Describe the picture" htmlFor="a-alt"><input id="a-alt" className={input} value={f.imageAlt} onChange={(e) => set({ imageAlt: e.target.value })} /></Field>
            <button type="button" className={btnGhost} onClick={findPhotos} disabled={busy}>Find free photos</button>
            {photos.length > 0 && <div className="grid grid-cols-3 gap-2">{photos.map((p) => <button type="button" key={p.imageUrl} onClick={() => set({ ...p })} aria-label={`Use photo: ${p.imageAlt}`}><img src={p.imageUrl} alt="" className="aspect-square w-full rounded object-cover" /></button>)}</div>}
            <p className="text-xs text-mu">Only Pexels pictures can be shown. The photographer credit is added under the picture.</p>
          </section>
          <section className={`${card} space-y-2`} aria-labelledby="a-vid">
            <h2 id="a-vid" className="text-base">Video (optional)</h2>
            <Field label="YouTube link" htmlFor="a-video"><input id="a-video" className={input} value={f.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></Field>
          </section>
          <section className={`${card} space-y-2`} aria-labelledby="a-chk">
            <h2 id="a-chk" className="text-base">Before you publish</h2>
            <ul className="space-y-1 text-sm">{checks.map((c) => <li key={c.label}><span aria-hidden="true">{c.pass ? '✅' : '⚠️'}</span> <span className="sr-only">{c.pass ? 'Passed: ' : 'Check: '}</span>{c.label}{c.detail ? <span className="text-xs text-mu"> ({c.detail})</span> : null}</li>)}</ul>
            <p className="text-xs text-mu">Read the whole article once. Fix anything that is not true of your business.</p>
          </section>
        </aside>
      </div>
      <ErrorBox message={err} />
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnGhost} onClick={save} disabled={busy}>Save</button>
        {status === 'published' ? <button type="button" className={btnGhost} onClick={() => setPublished(false)} disabled={busy}>Move back to drafts</button> : <button type="button" className={btn} onClick={() => setPublished(true)} disabled={busy}>Save and publish</button>}
        {id && <button type="button" className={btnGhost} onClick={remove} disabled={busy}>Delete</button>}
      </div>
    </div>
  )
}
