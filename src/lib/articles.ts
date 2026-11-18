import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore'
import { auth, db, WORKER_URL } from './firebase'
import { wordCount, type ArticleFields, type ArticleStatus } from '../shared/articles'

export interface ArticleDoc extends ArticleFields { id: string; status: ArticleStatus; source: 'ai' | 'manual'; wordCount: number; createdAt?: Timestamp; updatedAt?: Timestamp; publishedAt?: Timestamp }
export interface ArticleSettings { mode: 'off' | 'draft' | 'publish'; everyDays: number; topics: string[]; lastError?: string }
export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = { mode: 'off', everyDays: 1, topics: [] }
export const EMPTY_ARTICLE: ArticleFields = { title: '', slug: '', keyword: '', seoTitle: '', description: '', excerpt: '', body: '', imageUrl: '', imageAlt: '', imageCredit: '', imageCreditUrl: '', videoUrl: '' }
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
export const saveArticleSettings = (s: ArticleSettings) => setDoc(doc(db, 'articleSettings/main'), { mode: s.mode, everyDays: s.everyDays, topics: s.topics }, { merge: true })

/** Calls an admin-only worker endpoint (AI drafts, photo search, publish with the Bing ping). */
export async function callWorker<T>(path: string, body: unknown): Promise<T> {
  if (!WORKER_URL || !auth.currentUser) throw new Error('The edge worker is not configured (VITE_WORKER_URL).')
  const res = await fetch(`${WORKER_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? `The worker answered ${res.status}.`)
  return data as T
}
