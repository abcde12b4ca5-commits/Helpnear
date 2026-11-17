// Usage: GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json GCLOUD_PROJECT=<id> node scripts/enable-services.mjs
// seed.mjs skips documents that already exist, so use this once to create/update the newly added services in Firestore.
// Only touches the ids listed below. Never commit a service account.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { categories } from '../firebase/seed/data.mjs'

const IDS = ['move-out-cleaning', 'garage-cleanout', 'home-organizing', 'pet-sitting', 'dog-walking', 'car-detailing', 'holiday-lights', 'landscaping-mulching', 'snow-removal', 'errand-running', 'laundry-help', 'trash-bin-cleaning', 'event-setup-help', 'photography', 'home-tech-help', 'furniture-refinishing', 'bike-help', 'house-sitting', 'gardening-planting', 'sewing-alterations', 'blinds-curtains']
const projectId = process.env.GCLOUD_PROJECT
if (!projectId) throw new Error('Set GCLOUD_PROJECT')
initializeApp({ projectId })
const db = getFirestore()
for (const c of categories.filter((x) => IDS.includes(x.id))) {
  const { id, ...rest } = c
  await db.doc(`categories/${id}`).set(rest, { merge: true })
  console.log('upserted', id)
}
console.log('done')
