// runs every time hydra starts (toggle on, Pulsar reload)
// sources set up here can be used from any sketch: src(s1), src(s0)

syphon(s1)
// s0.initCam()

// Math shortcuts so sketches can write sin(time) instead of Math.sin(time)
// e.g. osc(10, 0.1, () => sin(time)).rotate(() => 0.5 + 0.5 * cos(time * 0.3)).out()
sin = Math.sin
cos = Math.cos
tan = Math.tan
abs = Math.abs
floor = Math.floor
ceil = Math.ceil
round = Math.round
min = Math.min
max = Math.max
pow = Math.pow
sqrt = Math.sqrt
PI = Math.PI
random = Math.random

// TEMP audio diagnostic (remove after debugging): samples a.fft for 5s into /tmp/hydra-audio.json
;(() => {
  const out = { samples: [] }
  const t = setInterval(() => out.samples.push({ vol: a.vol, fft: a.fft.slice() }), 500)
  setTimeout(() => {
    clearInterval(t)
    out.perm = systemPreferences.getMediaAccessStatus('microphone')
    out.track = a.stream ? a.stream.getAudioTracks().map((tr) => tr.label + ' ' + tr.readyState + ' muted=' + tr.muted) : null
    out.context = a.context ? a.context.state : null
    out.meyda = !!a.meyda
    out.hasInput = !!(a.meyda && a.meyda._m.inputData)
    require('fs').writeFileSync('/tmp/hydra-audio.json', JSON.stringify(out, null, 1))
  }, 5000)
})()
