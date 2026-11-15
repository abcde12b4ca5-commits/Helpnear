import { spawnSync } from 'node:child_process'

/** When the Firebase emulators are running (npm run test:e2e), load the same seed data production uses: services, settings, legal pages. */
export default function globalSetup() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return
  const r = spawnSync(process.execPath, ['scripts/seed.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, GCLOUD_PROJECT: 'demo-helpnear' },
  })
  if (r.status !== 0) throw new Error('Seeding the Firestore emulator failed')
}
