// Builds the Content-Security-Policy for the live site. Pure function (no file access), so tests can call it.
// Rules this policy follows on purpose:
//  - no wildcard hosts: every host is named (the Worker and the Firebase sign-in domain come from the same build variables the app uses);
//  - no 'unsafe-inline' and no 'unsafe-eval': the few inline <script>/<style> blocks in the built HTML are allowed by SHA-256 hash instead;
//  - every directive that does NOT fall back to default-src (frame-ancestors, form-action, base-uri) is set explicitly.
const origin = (u) => { try { return new URL(u).origin } catch { return '' } }

export function buildCsp({ workerUrl = '', authDomain = '', projectId = '', useEmulators = false, scriptHashes = [], styleHashes = [] } = {}) {
  const hash = (h) => `'sha256-${h}'`
  const worker = origin(workerUrl)
  const auth = authDomain ? origin(`https://${authDomain}`) : projectId ? `https://${projectId}.firebaseapp.com` : ''
  const connect = [
    "'self'",
    'https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com',
    'https://firebaseinstallations.googleapis.com', 'https://fcmregistrations.googleapis.com', 'https://firebaseappcheck.googleapis.com',
    'https://www.googleapis.com',
    worker,
    ...(useEmulators ? ['http://localhost:8080', 'http://localhost:9099', 'ws://localhost:8080'] : []),
  ].filter(Boolean)
  const frames = ['https://challenges.cloudflare.com', auth, 'https://accounts.google.com', 'https://www.google.com/recaptcha/'].filter(Boolean)
  const d = [
    ["default-src", "'self'"],
    ['script-src', ["'self'", ...scriptHashes.map(hash), 'https://challenges.cloudflare.com', 'https://apis.google.com', 'https://www.gstatic.com/firebasejs/', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'].join(' ')],
    ['style-src', ["'self'", ...styleHashes.map(hash)].join(' ')],
    ['img-src', "'self' data: https://www.google.com/images/cleardot.gif"],
    ['font-src', "'self'"],
    ['connect-src', connect.join(' ')],
    ['frame-src', frames.join(' ')],
    ['worker-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  return d.map(([k, v]) => `${k} ${v}`).join('; ')
}
