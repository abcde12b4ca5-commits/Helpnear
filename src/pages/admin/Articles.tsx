import { useCallback, useEffect, useMemo, useState } from 'react'
import { callWorker, deleteArticle, EMPTY_ARTICLE, getArticleSettings, listArticles, saveArticle, saveArticleSettings, type Angle, type ArticleDoc, type ArticleSettings, type Photo, type RunNowResult } from '../../lib/articles'
import { BLOG_CATEGORIES, checkArticle, guessCategory, makeSlug, MAX_PER_TITLE, MAX_QUEUE, parseQueue, renderMarkdown, type ArticleFields } from '../../shared/articles'
import { friendlyError } from '../../lib/errors'
import { ErrorBox, Field, Pill, btn, btnGhost, card, input } from '../../components/ui'

const when = (a?: { toDate(): Date }) => (a ? a.toDate().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

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
          <h2 id="art-list" className="text-xl">المقالات ({items?.length ?? '…'})</h2>
          <button type="button" className={btn} onClick={() => setEditing({ id: null, fields: EMPTY_ARTICLE, status: 'draft' })}>كتابة مقال</button>
        </div>
        {items?.length === 0 && <p className="text-sm text-mu">لا توجد مقالات بعد. أنشئ بعضها من الأعلى أو اكتب مقالك بنفسك.</p>}
        <ul className="divide-y divide-ln">
          {(items ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="text-xs text-mu"><bdi dir="ltr">/blog/{a.slug}</bdi> · {a.wordCount ?? 0} كلمة · {a.source === 'ai' ? 'مسودة بالذكاء الاصطناعي' : 'مكتوب يدويًا'} · {when(a.status === 'published' ? a.publishedAt : a.createdAt)}</p>
              </div>
              <Pill tone={a.status === 'published' ? 'g' : 'y'}>{a.status === 'published' ? 'منشور' : 'مسودة'}</Pill>
              {a.status === 'published' && <a className={btnGhost} href={`/blog/${a.slug}`} target="_blank" rel="noreferrer">عرض</a>}
              <button type="button" className={btnGhost} onClick={() => setEditing({ id: a.id, fields: { ...EMPTY_ARTICLE, ...a }, status: a.status })}>تعديل</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const PERIODS: [number, string][] = [[1, 'يوم'], [2, 'يومين'], [3, '3 أيام'], [7, 'أسبوع']]
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
    if (lines.length > MAX_QUEUE) { setErr(`القائمة تتسع لـ ${MAX_QUEUE} عنوانًا. احذف ${lines.length - MAX_QUEUE}.`); return }
    try {
      await saveArticleSettings({ ...s, topics: lines }, lines[0] !== saved.topics.split('\n').map((t) => t.trim()).filter(Boolean)[0])
      setMsg('تم الحفظ.'); await load()
    } catch (e) { setErr(friendlyError(e)) }
  }
  const runNow = async () => {
    setErr(null); setMsg(null); setBusy('جارٍ كتابة مقال الآن… قد يستغرق حتى دقيقة.')
    try {
      const r = await callWorker<RunNowResult>('/articles/run-now', {})
      setMsg(r.ran ? `تم: المقال “${r.title}” ${r.published ? 'نُشر' : 'حُفظ كمسودة'}.` : r.reason === 'off' ? 'اختر وضعًا غير "متوقف" أولًا.' : `لم يُكتب شيء: ${r.reason}`)
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : friendlyError(e)) } finally { setBusy(null) }
  }
  return (
    <section className={`${card} space-y-3`} aria-labelledby="art-auto">
      <h2 id="art-auto" className="text-xl">المقالات التلقائية</h2>
      <p className="text-sm text-mu">يكتب العامل (Worker) المقالات تلقائيًا بذكاء Cloudflare المجاني، واحدًا بعد الآخر على مدار اليوم. ضع عناوينك بالأسفل وسيمشي على القائمة من الأعلى. وعندما تفرغ القائمة يختار مواضيع جديدة من خدماتك.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ماذا نفعل بكل مقال جديد" htmlFor="art-mode">
          <select id="art-mode" className={input} value={s.mode} onChange={(e) => setS({ ...s, mode: e.target.value as ArticleSettings['mode'] })}>
            <option value="off">متوقف (لا يكتب شيئًا)</option>
            <option value="draft">حفظه كمسودة لأراجعها (الأكثر أمانًا)</option>
            <option value="checked">نشره تلقائيًا فقط إذا اجتاز فحوص الجودة، وإلا مسودة</option>
            <option value="publish">نشر كل شيء تلقائيًا (بدون مراجعة)</option>
          </select>
        </Field>
        <Field label="عدد المقالات" htmlFor="art-per">
          <div className="flex items-center gap-2">
            <select id="art-per" aria-label="عدد المقالات" className={input} value={s.perDay} onChange={(e) => setS({ ...s, perDay: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <span className="text-sm">كل</span>
            <select aria-label="الفترة" className={input} value={s.everyDays} onChange={(e) => setS({ ...s, everyDays: Number(e.target.value) })}>{PERIODS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select>
          </div>
        </Field>
        <Field label="عدد المقالات لكل عنوان (الافتراضي)" htmlFor="art-title-count" hint="2 أو 3 تعني مقالات مختلفة في نفس الموضوع، كل واحد يجيب عن سؤال بحث مختلف.">
          <select id="art-title-count" className={input} value={s.perTitle} onChange={(e) => setS({ ...s, perTitle: Number(e.target.value) })}>{Array.from({ length: MAX_PER_TITLE }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </Field>
      </div>
      {s.mode === 'publish' && <p className="text-sm" style={{ color: 'var(--warn-tx)' }} role="alert">هذا ينشر نصًا من الذكاء الاصطناعي على موقعك دون أن يراجعه أحد. محركات البحث تعتبر كثرة المقالات غير المراجعة ضعيفة الجودة. خيار “النشر فقط إذا اجتاز الفحوص” أكثر أمانًا.</p>}
      {s.mode === 'checked' && <p className="text-xs text-mu">الشروط: 900 كلمة فأكثر، وعبارة البحث في العنوان والفقرة الأولى وأحد العناوين الفرعية، و5 عناوين فرعية مختلفة فأكثر، ورابطان فأكثر لصفحات خدماتك، بدون عبارات الذكاء الاصطناعي الجاهزة، وبدون مبالغ بالدولار، وغير مشابه لمقال موجود. غياب الصورة أو قِصر العنوان قليلًا لا يمنع النشر.</p>}
      <Field label="العناوين المطلوب كتابتها (عنوان في كل سطر، من الأعلى)" htmlFor="art-topics" hint="عناوين بالإنجليزية. يمكن إضافة تفاصيل في السطر: “Title | search phrase | x2” (من x1 إلى x3 يحدد عدد مقالات هذا العنوان). بدون عبارة بحث يختارها الذكاء الاصطناعي.">
        <textarea id="art-topics" dir="ltr" rows={10} className={`${input} font-mono text-sm`} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={'How to choose a lawn mowing service\nGutter cleaning before winter | gutter cleaning | x2\nWhat to ask a handyman before hiring'} />
      </Field>
      <p className="text-sm" role="status">
        {queue.items.length} عنوانًا في القائمة{lines.length > 0 ? ` = ${total} مقالًا` : ''}.
        {lines.length > 0 && s.mode !== 'off' ? ` بمعدل ${s.perDay} كل ${PERIODS.find(([d]) => d === s.everyDays)?.[1]} تكفي القائمة نحو ${days} ${days === 1 ? 'يوم' : 'أيام'}.` : ''}
        {queue.skipped > 0 ? <span style={{ color: 'var(--warn-tx)' }}> {queue.skipped} أسطر غير صالحة وسيتم حذفها (المطلوب عنوان إنجليزي من 8 أحرف على الأقل).</span> : null}
      </p>
      {s.lastError && <p className="text-sm text-danger-tx ad-ltr" role="alert">فشل آخر تشغيل تلقائي: {s.lastError}</p>}
      <p className="text-xs text-mu" role="status">{s.lastRunAt ? `آخر محاولة من الجدول: ${s.lastRunAt.toDate().toLocaleString('ar-EG')}` : 'الجدول لم يعمل بعد. يعمل كل 15 دقيقة بعد نشر الـ worker من مجلد worker، وبعد حفظ الإعدادات ووضع غير «متوقف».'}</p>
      <ErrorBox message={err} />
      {busy && <p className="text-sm text-mu" role="status">{busy}</p>}
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btn} onClick={save} disabled={Boolean(busy) || !dirty}>حفظ الإعدادات</button>
        <button type="button" className={btnGhost} onClick={runNow} disabled={Boolean(busy) || dirty || s.mode === 'off'} title={dirty ? 'احفظ أولًا' : undefined}>كتابة مقال الآن</button>
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
    setErr(null); setBusy('جارٍ البحث عن زوايا مختلفة…'); setDone([])
    try { setAngles((await callWorker<{ angles: Angle[] }>('/articles/angles', { topic, count })).angles.map((a) => ({ ...a, on: !a.similarTo?.length }))) } catch (e) { setErr(friendlyError(e)) } finally { setBusy(null) }
  }
  const write = async () => {
    setErr(null); setDone([])
    const chosen = angles.filter((a) => a.on)
    for (const [i, a] of chosen.entries()) {
      setBusy(`جارٍ كتابة المقال ${i + 1} من ${chosen.length}… يستغرق كل مقال نحو نصف دقيقة`)
      try { const r = await callWorker<{ title: string }>('/articles/generate', { title: a.title, keyword: a.keyword, intent: a.intent }); setDone((d) => [...d, r.title]) } catch (e) { setErr(friendlyError(e)); break }
    }
    setBusy(null); setAngles([]); onDone()
  }
  return (
    <section className={`${card} space-y-3`} aria-labelledby="art-gen">
      <h2 id="art-gen" className="text-xl">كتابة مقالات بالذكاء الاصطناعي</h2>
      <p className="text-sm text-mu">اكتب موضوعًا. ستحصل على عدة زوايا مختلفة (أسئلة مختلفة يبحث عنها الناس)، وليس نفس المقال بصياغة أخرى. كل واحد يُحفظ كمسودة لتعدّله وتنشره.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="الموضوع" htmlFor="gen-topic"><input id="gen-topic" dir="ltr" className={`${input} min-w-[16rem]`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="مثال: lawn mowing" /></Field>
        <Field label="كم مقالًا" htmlFor="gen-count"><select id="gen-count" className={input} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></Field>
        <button type="button" className={btn} onClick={suggest} disabled={Boolean(busy) || topic.trim().length < 3}>البحث عن زوايا</button>
      </div>
      {angles.length > 0 && (
        <div className="space-y-2">
          {angles.map((a, i) => (
            <div key={i} className="rounded-xl border border-ln p-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={a.on} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /><span className="flex-1"><input aria-label="العنوان" dir="ltr" className={input} value={a.title} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></span></label>
              <p className="mt-1 text-xs text-mu">عبارة البحث: <input aria-label="عبارة البحث" dir="ltr" className={`${input} inline w-56`} value={a.keyword} onChange={(e) => setAngles(angles.map((x, j) => (j === i ? { ...x, keyword: e.target.value.toLowerCase() } : x)))} /> {a.intent}</p>
              {a.similarTo?.length ? <p className="mt-1 text-xs" style={{ color: 'var(--warn-tx)' }}>قريب جدًا من: {a.similarTo.join(' | ')}</p> : null}
            </div>
          ))}
          <button type="button" className={btn} onClick={write} disabled={Boolean(busy) || !angles.some((a) => a.on)}>كتابة المقالات المختارة</button>
        </div>
      )}
      {busy && <p className="text-sm text-mu" role="status">{busy}</p>}
      {done.length > 0 && !busy && <p className="text-sm text-ok" role="status">حُفظت كمسودات: {done.join(' | ')}</p>}
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
    if (f.title.trim().length < 8) throw new Error('اكتب عنوانًا أولًا (8 أحرف على الأقل).')
    if (!/^[a-z0-9-]{3,70}$/.test(f.slug)) throw new Error('الرابط يقبل حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط (من 3 إلى 70 حرفًا).')
    setId(await saveArticle(id, f)); setMsg('تم الحفظ.')
  })
  const setPublished = (publish: boolean) => run(async () => {
    const savedId = await saveArticle(id, f); setId(savedId)
    await callWorker('/articles/publish', { id: savedId, publish })
    setStatus(publish ? 'published' : 'draft'); setMsg(publish ? 'تم النشر. سيظهر خلال دقائق وتم إبلاغ Bing به.' : 'تمت إعادته إلى المسودات.')
  })
  const findPhotos = () => run(async () => { setPhotos((await callWorker<{ photos: Photo[] }>('/articles/images', { query: f.keyword || f.title })).photos) })
  const remove = () => run(async () => { if (id && window.confirm('حذف هذا المقال نهائيًا؟')) { await deleteArticle(id); onClose() } })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnGhost} onClick={onClose}>→ كل المقالات</button>
        <Pill tone={status === 'published' ? 'g' : 'y'}>{status === 'published' ? 'منشور' : 'مسودة'}</Pill>
        {status === 'published' && <a className={btnGhost} href={`/blog/${f.slug}`} target="_blank" rel="noreferrer">عرض الصفحة المنشورة</a>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <Field label="العنوان" htmlFor="a-title" hint="حتى 62 حرفًا. اجعل الناس يرغبون في الضغط عليه، بدون خداع."><input id="a-title" dir="ltr" className={input} value={f.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="عبارة البحث (ما يكتبه الناس في Google)" htmlFor="a-kw"><input id="a-kw" dir="ltr" className={input} value={f.keyword} onChange={(e) => set({ keyword: e.target.value.toLowerCase() })} /></Field>
          <Field label="الرابط" htmlFor="a-slug" hint="يُبنى من عبارة البحث. لا تغيّره بعد النشر."><div className="flex items-center gap-1 text-sm ad-ltr"><span className="text-mu">/blog/</span><input id="a-slug" dir="ltr" className={input} value={f.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }) }} /></div></Field>
          <Field label="عنوان نتيجة البحث (SEO)" htmlFor="a-seo"><input id="a-seo" dir="ltr" className={input} value={f.seoTitle} maxLength={70} onChange={(e) => set({ seoTitle: e.target.value })} /></Field>
          <Field label="وصف نتيجة البحث (من 120 إلى 160 حرفًا)" htmlFor="a-desc"><textarea id="a-desc" dir="ltr" rows={2} className={input} value={f.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="مقتطف قصير (يظهر في صفحة المدونة)" htmlFor="a-exc"><input id="a-exc" dir="ltr" className={input} value={f.excerpt} maxLength={200} onChange={(e) => set({ excerpt: e.target.value })} /></Field>
          <div>
            <div className="mb-1 flex items-center justify-between"><label htmlFor="a-body" className="text-sm font-semibold">نص المقال</label><button type="button" className={btnGhost} onClick={() => setPreview(!preview)}>{preview ? 'تعديل' : 'معاينة'}</button></div>
            {preview ? <div className="post rounded-xl border border-ln p-4" dangerouslySetInnerHTML={{ __html: html }} /> : <textarea id="a-body" dir="ltr" rows={24} className={`${input} font-mono text-sm`} value={f.body} onChange={(e) => set({ body: e.target.value })} />}
            <p className="mt-1 text-xs text-mu">استخدم ## للعناوين الفرعية، و**غامق**، و- للقوائم، و[نص](/services/lawn-care/) للروابط، و![وصف](رابط الصورة) للصور، وسطرًا @video(رابط YouTube) للفيديو.</p>
          </div>
        </div>
        <aside className="space-y-4">
          <section className={`${card} space-y-2`} aria-labelledby="a-img">
            <h2 id="a-img" className="text-base">الصورة</h2>
            {f.imageUrl && <img src={f.imageUrl} alt={f.imageAlt} className="w-full rounded-lg" />}
            <Field label="رابط الصورة (Pexels)" htmlFor="a-imgurl"><input id="a-imgurl" dir="ltr" className={input} value={f.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} /></Field>
            <Field label="وصف الصورة" htmlFor="a-alt"><input id="a-alt" dir="ltr" className={input} value={f.imageAlt} onChange={(e) => set({ imageAlt: e.target.value })} /></Field>
            <button type="button" className={btnGhost} onClick={findPhotos} disabled={busy}>البحث عن صور مجانية</button>
            {photos.length > 0 && <div className="grid grid-cols-3 gap-2">{photos.map((p) => <button type="button" key={p.imageUrl} onClick={() => set({ ...p })} aria-label={`استخدام الصورة: ${p.imageAlt}`}><img src={p.imageUrl} alt="" className="aspect-square w-full rounded object-cover" /></button>)}</div>}
            <p className="text-xs text-mu">يمكن عرض صور Pexels فقط. يُضاف اسم المصوّر تحت الصورة.</p>
          </section>
          <section className={`${card} space-y-2`} aria-labelledby="a-vid">
            <h2 id="a-vid" className="text-base">الفيديو (اختياري)</h2>
            <Field label="التصنيف" htmlFor="a-cat" hint="يجمع المقال في المدونة ويحدد الخدمة التي يشير إليها زر الدعوة للإجراء.">
              <select id="a-cat" className={input} value={f.category ?? ''} onChange={(e) => set({ category: e.target.value })}>
                <option value="">اختر تصنيفًا</option>
                {BLOG_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!f.category && (f.title || f.keyword) ? <button type="button" className="mt-1 text-xs underline" onClick={() => set({ category: guessCategory(`${f.title} ${f.keyword}`) })}>اقتراح تصنيف</button> : null}
            </Field>
            <Field label="رابط YouTube" htmlFor="a-video"><input id="a-video" dir="ltr" className={input} value={f.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></Field>
          </section>
          <section className={`${card} space-y-2`} aria-labelledby="a-chk">
            <h2 id="a-chk" className="text-base">قبل النشر</h2>
            <ul className="space-y-1 text-sm">{checks.map((c) => <li key={c.label}><span aria-hidden="true">{c.pass ? '✅' : '⚠️'}</span> <span className="sr-only">{c.pass ? 'نجح: ' : 'راجع: '}</span>{c.label}{c.detail ? <span className="text-xs text-mu"> ({c.detail})</span> : null}</li>)}</ul>
            <p className="text-xs text-mu">اقرأ المقال كاملًا مرة واحدة. صحّح أي شيء لا ينطبق على عملك.</p>
          </section>
        </aside>
      </div>
      <ErrorBox message={err} />
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnGhost} onClick={save} disabled={busy}>حفظ</button>
        {status === 'published' ? <button type="button" className={btnGhost} onClick={() => setPublished(false)} disabled={busy}>إعادته إلى المسودات</button> : <button type="button" className={btn} onClick={() => setPublished(true)} disabled={busy}>حفظ ونشر</button>}
        {id && <button type="button" className={btnGhost} onClick={remove} disabled={busy}>حذف</button>}
      </div>
    </div>
  )
}
