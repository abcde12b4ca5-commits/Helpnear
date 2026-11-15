// Builds the site pointed at the Firebase EMULATORS (fake project "demo-helpnear") and serves it on :4173.
// Cross-platform (no shell env syntax), so it works the same on Windows, macOS and Linux.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const PORT = process.env.E2E_PORT || '4173'
const env = {
  ...process.env,
  SITE_URL: `http://localhost:${PORT}`,
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-helpnear.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-helpnear',
  VITE_FIREBASE_APP_ID: '1:1:web:demo',
  VITE_USE_EMULATORS: 'true',
  VITE_WORKER_URL: '', VITE_TURNSTILE_SITE_KEY: '', VITE_APPCHECK_SITE_KEY: '', VITE_FIREBASE_VAPID_KEY: '', VITE_FIREBASE_MESSAGING_SENDER_ID: '', // no real services in tests
}
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })

if (process.env.E2E_SKIP_BUILD !== '1' || !existsSync('dist/index.html')) {
  const b = run('npm', ['run', 'build'])
  if (b.status !== 0) process.exit(b.status ?? 1)
}
const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort', '--host', '127.0.0.1'], { stdio: 'inherit', env, shell: process.platform === 'win32' })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.kill(); process.exit(0) })
server.on('exit', (code) => process.exit(code ?? 0))
