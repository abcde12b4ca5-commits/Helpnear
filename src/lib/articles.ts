import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore'
import { auth, db, WORKER_URL } from './firebase'
import { wordCount, type ArticleFields, type ArticleStatus } from '../shared/articles'

export interface ArticleDoc extends ArticleFields { id: string; status: ArticleStatus; source: 'ai' | 'manual'; wordCount: number; createdAt?: Timestamp; updatedAt?: Timestamp; publishedAt?: Timestamp }
export type ArticleMode = 'off' | 'draft' | 'checked' | 'publish'
/** perDay articles every everyDays days; perTitle = default number of articles written for each title of the queue (topics). */
export interface ArticleSettings { mode: ArticleMode; everyDays: number; perDay: number; perTitle: number; topics: string[]; lastError?: string; lastRunAt?: { toDate(): Date } }
export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = { mode: 'off', everyDays: 1, perDay: 1, perTitle: 1, topics: [] }
export interface RunNowResult { ran: boolean; reason?: string; id?: string; title?: string; published?: boolean }
export const EMPTY_ARTICLE: ArticleFields = { title: '', slug: '', keyword: '', seoTitle: '', description: '', excerpt: '', body: '', imageUrl: '', imageAlt: '', imageCredit: '', imageCreditUrl: '', videoUrl: '', category: '' }
export interface Angle { title: string; keyword: string; intent: string; similarTo?: string[] }
export interface Photo { imageUrl: string; imageAlt: string; imageCredit: string; imageCreditUrl: string }

export async function listArticles(): Promise<ArticleDoc[]> {
  const snap = await getDocs(query(collection(db, 'articles'), orderBy('createdAt', 'desc'), limit(200)))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ArticleDoc, 'id'>), id: d.id }))
}
export async function saveArticle(id: string | null, f: ArticleFields): Promise<string> {
  const clean = { ...f, wordCount: wordCount(f.body), updatedAt: serverTimestamp() }
  if (id) { await updateDoc(doc(db, `articles/${id}`), clean); return id }
  const ref = await addDoc(collection(db, 'articles'), { ...clean, status: 'draft', source: 'manual', createdAt: serverTimestamp() })
  return ref.id
}
export const deleteArticle = (id: string) => deleteDoc(doc(db, `articles/${id}`))
export async function getArticleSettings(): Promise<ArticleSettings> {
  const s = await getDoc(doc(db, 'articleSettings/main'))
  return s.exists() ? { ...DEFAULT_ARTICLE_SETTINGS, ...(s.data() as Partial<ArticleSettings>) } : DEFAULT_ARTICLE_SETTINGS
}
/** `resetHead` restarts the progress counter of the first queue title (use it when the first line was changed). */
export const saveArticleSettings = (s: ArticleSettings, resetHead = false) => setDoc(doc(db, 'articleSettings/main'), { mode: s.mode, everyDays: s.everyDays, perDay: s.perDay, perTitle: s.perTitle, topics: s.topics, ...(resetHead ? { headProgress: 0, headFailures: 0 } : {}) }, { merge: true })

/** Calls an admin-only article endpoint (AI drafts, photo search, publish with the Bing ping). It is served by the site itself (functions/api/articles); VITE_WORKER_URL, when set, still points it at a separate worker. */
export async function callWorker<T>(path: string, body: unknown): Promise<T> {
  if (!auth.currentUser) throw new Error('Sign in again, then retry.')
  const res = await fetch(WORKER_URL ? `${WORKER_URL}${path}` : `/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? `The server answered ${res.status}.`)
  return data as T
}
