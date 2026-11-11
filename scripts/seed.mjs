// Usage (emulator):  FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-helpnear node scripts/seed.mjs
// Usage (production): GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json GCLOUD_PROJECT=<id> node scripts/seed.mjs
// Never commit a service account. Existing documents are SKIPPED so admin edits are never overwritten.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { categories, appConfig, legal } from '../firebase/seed/data.mjs'

const projectId = process.env.GCLOUD_PROJECT
if (!projectId) throw new Error('Set GCLOUD_PROJECT')
initializeApp({ projectId })
const db = getFirestore()

async function putIfMissing(path, data) {
  const ref = db.doc(path)
  if ((await ref.get()).exists) { console.log('skip  ', path); return }
  await ref.set(data)
  console.log('create', path)
}

for (const c of categories) { const { id, ...rest } = c; await putIfMissing(`categories/${id}`, rest) }
await putIfMissing('config/app', appConfig)
for (const l of legal) { const { id, ...rest } = l; await putIfMissing(`legal/${id}`, { ...rest, publishedAt: FieldValue.serverTimestamp() }) }
console.log('done')
