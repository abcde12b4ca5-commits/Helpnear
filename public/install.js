/* "Install the app" prompt, used by every page (the React app and the static pages).
   Chrome, Edge and Samsung Internet give us a real install prompt; iPhone and iPad (and a few Android browsers) can only add the site from the browser menu,
   so there the banner explains the two taps. Nothing is shown inside the installed app, and "Not now" hides it for 14 days.
   No service worker is registered on purpose: the push worker already owns the site's scope and this keeps every page loading fresh from the network. */
(function () {
  'use strict'
  var KEY = 'hn-install', HIDE_MS = 14 * 864e5
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) return
  var ua = navigator.userAgent
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  var android = /android/i.test(ua)
  var deferred = null, banner = null, shown = false
  var state = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} } }
  var save = function (patch) { try { var s = state(); for (var k in patch) s[k] = patch[k]; localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) { /* storage blocked: banner just returns next visit */ } }
  var snoozed = function () { var s = state(); return !!s.installed || (s.hidden && Date.now() - s.hidden < HIDE_MS) }
  var help = function () { return ios ? 'Tap Share, then “Add to Home Screen”.' : 'Open the browser menu, then tap “Install app” or “Add to Home screen”.' }

  function hide() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n }
  function show() {
    if (banner || shown) return
    shown = true
    if (!document.getElementById('hn-ib-css')) { var l = el('link'); l.id = 'hn-ib-css'; l.rel = 'stylesheet'; l.href = '/install.css'; document.head.appendChild(l) }
    banner = el('div', 'hn-ib'); banner.setAttribute('role', 'dialog'); banner.setAttribute('aria-label', 'Install Helpnear')
    var img = el('img'); img.src = '/icon-192.png'; img.alt = ''; img.width = 48; img.height = 48
    var t = el('div', 't'); t.appendChild(el('b', '', 'Install Helpnear'))
    t.appendChild(el('span', '', deferred ? 'Open it from your home screen like an app.' : help()))
    banner.appendChild(img); banner.appendChild(t)
    var row = el('div', 'b')
    if (deferred) { var go = el('button', '', 'Install'); go.type = 'button'; go.addEventListener('click', install); row.appendChild(go) }
    var x = el('button', 'x', 'Not now'); x.type = 'button'; x.setAttribute('aria-label', 'Hide the install message'); x.addEventListener('click', function () { save({ hidden: Date.now() }); hide() })
    row.appendChild(x); banner.appendChild(row)
    document.body.appendChild(banner)
  }
  function install() {
    if (!deferred) { shown = false; show(); return }
    var p = deferred; deferred = null
    p.prompt(); p.userChoice.then(function (c) { if (c && c.outcome === 'accepted') save({ installed: Date.now() }); hide() }).catch(function () { hide() })
  }
  // The React header button asks us what to do: the real prompt when we have one, the written steps otherwise.
  window.hnInstall = { canInstall: function () { return !!deferred || ios || android }, prompt: function () { shown = false; hide(); deferred ? install() : show() } }
  var announce = function () { window.dispatchEvent(new Event('hn-install-ready')) }

  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; announce(); if (!snoozed()) setTimeout(show, 3500) })
  addEventListener('appinstalled', function () { save({ installed: Date.now() }); deferred = null; hide() })
  // No install event after a few seconds (iPhone, iPad, some Android browsers): show the written steps instead.
  if ((ios || android) && !snoozed()) setTimeout(function () { if (!deferred) { announce(); show() } }, 7000)
  else if (ios || android) announce()
})()
