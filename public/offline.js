/* Offline page: reload when the person taps the button, and automatically the moment the connection comes back. */
(function () {
  var go = function () { location.reload() }
  var b = document.getElementById('retry')
  if (b) b.addEventListener('click', go)
  addEventListener('online', go)
})()
