/* "Install the app" helper, loaded by every page (the React app and the static pages).
   - Chrome, Edge, Samsung Internet and friends give us a real one-tap install prompt: we use it.
   - Everything else (iPhone, iPad, Safari, Firefox, in-app browsers, or a browser that has not offered the prompt yet) gets a short written guide for THAT browser.
   - The "Install app" button in the page header always works (it opens the prompt or the guide) and disappears inside the installed app.
   - A small banner offers the install once; "Not now" hides it for 14 days.
   - It also registers the site's service worker (/firebase-messaging-sw.js), which makes the site installable and shows /offline.html when there is no connection.
     That worker never stores pages or data, so every page still loads fresh from the network. */
(function () {
  'use strict'
  var KEY = 'hn-install', HIDE_MS = 14 * 864e5, SW_URL = '/firebase-messaging-sw.js'
  var ua = navigator.userAgent || ''

  // ---- service worker (register only if there is none yet: the push button registers the same file with its Firebase settings, and we must not undo that)
  function registerSw() {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration('/')
      .then(function (r) { return r || navigator.serviceWorker.register(SW_URL, { scope: '/' }) })
      .catch(function () { /* unsupported or blocked (private mode): the site works exactly as before */ })
  }
  if (document.readyState === 'complete') registerSw(); else addEventListener('load', registerSw)

  // ---- where are we running?
  var isStandalone = function () {
    try {
      return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || matchMedia('(display-mode: window-controls-overlay)').matches
    } catch (e) { return false }
  }
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  var android = /android/i.test(ua)
  var mobile = ios || android
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|MicroMessenger|Twitter|LinkedInApp|Pinterest|Messenger/i.test(ua) || (android && /; wv\)/.test(ua))
  var browser = /SamsungBrowser/i.test(ua) ? 'samsung' : /EdgA|EdgiOS|Edg\//i.test(ua) ? 'edge' : /OPR\/|OPiOS|Opera/i.test(ua) ? 'opera'
    : /FxiOS|Firefox\//i.test(ua) ? 'firefox' : /CriOS|Chrome\/|Chromium\//i.test(ua) ? 'chrome' : /Safari\//i.test(ua) ? 'safari' : 'other'

  var deferred = null, banner = null, modal = null, bannerShown = false, justInstalled = false, lastFocus = null
  var state = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} } }
  var save = function (patch) { try { var s = state(); for (var k in patch) s[k] = patch[k]; localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) { /* storage blocked: the banner just returns next visit */ } }
  var snoozed = function () { var s = state(); return !!s.installed || (s.hidden && Date.now() - s.hidden < HIDE_MS) }
  var announce = function () { try { window.dispatchEvent(new Event('hn-install-ready')) } catch (e) { /* very old browser */ } }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n }
  function loadCss() {
    if (document.getElementById('hn-ib-css')) return
    var l = el('link'); l.id = 'hn-ib-css'; l.rel = 'stylesheet'; l.href = '/install.css'; document.head.appendChild(l)
  }

  // ---- the written guide, for the browser the person is actually using
  function guide() {
    var steps, note = '', other = 'Open this page in ' + (ios ? 'Safari' : 'Chrome') + ' first: tap the ⋯ or ⋮ menu, then “Open in browser”.'
    if (ios) {
      steps = ['Tap the Share button (a square with an arrow pointing up) at the bottom or top of the screen. If you can’t see it, tap ⋯ first.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add”. Helpnear now sits on your home screen like any other app.']
      note = 'Don’t see “Add to Home Screen”? Open this page in Safari and try again.'
    } else if (android) {
      if (browser === 'samsung') steps = ['Tap the ≡ menu at the bottom right.', 'Tap “Add page to”, then choose “Home screen”.', 'Tap “Add”.']
      else if (browser === 'firefox') steps = ['Tap the ⋮ menu.', 'Tap “Install”.', 'Tap “Add” to confirm.']
      else steps = ['Tap the ⋮ menu (top right corner).', 'Tap “Install app”. On some phones it is called “Add to Home screen”.', 'Tap “Install”. Helpnear appears with your other apps.']
    } else if (browser === 'firefox') {
      steps = ['Firefox on a computer can’t install web apps. Open this page in Chrome or Edge instead.', 'Then click the install icon at the right end of the address bar.']
    } else if (browser === 'safari') {
      steps = ['In the menu bar at the top of the screen, choose File, then “Add to Dock…”.', 'Click “Add”.']
      note = 'Needs macOS Sonoma or newer. On older versions, open this page in Chrome or Edge.'
    } else if (browser === 'edge') {
      steps = ['Click the ⋯ menu at the top right of the window.', 'Choose “Apps”, then “Install this site as an app”.', 'Click “Install”.']
    } else {
      steps = ['Look at the right end of the address bar for the install icon (a screen with a small arrow) and click it.', 'Can’t see it? Open the ⋮ menu, then “Cast, save, and share”, then “Install page as app…”.', 'Click “Install”.']
    }
    if (inApp) steps.unshift(other)
    return { steps: steps, note: note }
  }

  // ---- the guide window (also used for the one-tap install when the browser supports it)
  function closeModal() {
    if (!modal) return
    if (modal.parentNode) modal.parentNode.removeChild(modal)
    modal = null
    document.documentElement.classList.remove('hn-im-lock')
    try { if (lastFocus && lastFocus.focus) lastFocus.focus() } catch (e) { /* element gone */ }
  }
  function openGuide() {
    if (modal) return
    loadCss(); hideBanner()
    lastFocus = document.activeElement
    var g = guide()
    var ov = el('div', 'hn-im-ov')
    var box = el('div', 'hn-im'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'hn-im-t')
    var head = el('div', 'h')
    var img = el('img'); img.src = '/icon-192.png'; img.alt = ''; img.width = 56; img.height = 56
    var t = el('div', 't')
    var h = el('h2', '', mobile ? 'Add Helpnear to your home screen' : 'Install Helpnear on your computer'); h.id = 'hn-im-t'
    t.appendChild(h)
    t.appendChild(el('p', '', mobile ? 'Open it with one tap, full screen, like any other app. No app store needed.' : 'Open it in its own window, one click from your desktop or taskbar.'))
    head.appendChild(img); head.appendChild(t); box.appendChild(head)
    var row = el('div', 'b')
    if (deferred) {
      var go = el('button', 'p', 'Install now'); go.type = 'button'; go.addEventListener('click', function () { closeModal(); install() }); row.appendChild(go)
    } else {
      var ol = el('ol'); for (var i = 0; i < g.steps.length; i++) ol.appendChild(el('li', '', g.steps[i]))
      box.appendChild(ol)
      if (g.note) box.appendChild(el('p', 'n', g.note))
    }
    var close = el('button', deferred ? '' : 'p', deferred ? 'Not now' : 'Got it'); close.type = 'button'; close.addEventListener('click', closeModal); row.appendChild(close)
    box.appendChild(row); ov.appendChild(box)
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal() })
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return }
      if (e.key !== 'Tab') return
      var f = box.querySelectorAll('button'); if (!f.length) return
      var first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    })
    document.body.appendChild(ov); modal = ov
    document.documentElement.classList.add('hn-im-lock')
    var firstBtn = box.querySelector('button'); if (firstBtn) firstBtn.focus()
  }

  // ---- the small banner at the bottom of the page
  function hideBanner() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null }
  function showBanner() {
    if (banner || bannerShown || modal || isStandalone() || justInstalled) return
    bannerShown = true; loadCss()
    banner = el('div', 'hn-ib'); banner.setAttribute('role', 'dialog'); banner.setAttribute('aria-label', 'Install Helpnear')
    var img = el('img'); img.src = '/icon-192.png'; img.alt = ''; img.width = 48; img.height = 48
    var t = el('div', 't'); t.appendChild(el('b', '', 'Install Helpnear'))
    t.appendChild(el('span', '', mobile ? 'Add it to your home screen for one-tap access.' : 'Open it from your desktop like an app.'))
    banner.appendChild(img); banner.appendChild(t)
    var row = el('div', 'b')
    var go = el('button', '', deferred ? 'Install' : 'Show me how'); go.type = 'button'
    go.addEventListener('click', function () { hideBanner(); if (deferred) install(); else openGuide() }); row.appendChild(go)
    var x = el('button', 'x', 'Not now'); x.type = 'button'; x.setAttribute('aria-label', 'Hide the install message')
    x.addEventListener('click', function () { save({ hidden: Date.now() }); hideBanner() }); row.appendChild(x)
    banner.appendChild(row); document.body.appendChild(banner)
  }

  // ---- the browser's own install prompt
  function install() {
    if (!deferred) { openGuide(); return }
    var p = deferred; deferred = null
    try {
      p.prompt()
      p.userChoice.then(function (c) { if (c && c.outcome === 'accepted') save({ installed: Date.now() }) }).catch(function () { /* closed without choosing */ })
    } catch (e) { openGuide() }
    announce()
  }

  // Used by the React header button and footer link.
  window.hnInstall = {
    canInstall: function () { return !isStandalone() && !justInstalled },
    hasNativePrompt: function () { return !!deferred },
    prompt: function () { hideBanner(); if (deferred) install(); else openGuide() },
  }

  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; announce()
    if (!snoozed() && !isStandalone()) setTimeout(showBanner, 3500)
  })
  addEventListener('appinstalled', function () { save({ installed: Date.now() }); justInstalled = true; deferred = null; hideBanner(); closeModal(); announce() })
  // Phones that never send the install event (iPhone, iPad, some Android browsers): offer the written guide once, a few seconds in.
  if (mobile && !snoozed() && !isStandalone()) setTimeout(function () { if (!deferred) showBanner() }, 7000)
  announce()
})()
