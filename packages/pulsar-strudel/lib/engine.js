// Runs inside the hidden strudel window. The editor talks to it through
// webContents.executeJavaScript, and reads messages back from console lines
// prefixed with REPORT.
const REPORT = '[pulsar-strudel]'
const report = (type, message) => console.log(REPORT + JSON.stringify({ type, message: String(message) }))

// same sample banks as flok
const ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/'
const prebake = () => Promise.all([
  // midin, midikeys etc. aren't in @strudel/web's default scope
  strudel.evalScope(strudel),
  strudel.samples(`${ds}/tidal-drum-machines.json`),
  strudel.samples(`${ds}/piano.json`),
  strudel.samples(`${ds}/Dirt-Samples.json`),
  strudel.samples(`${ds}/EmuSP12.json`),
  strudel.samples(`${ds}/vcsl.json`),
]).catch((err) => report('warning', 'could not load samples: ' + err.message))

let evalError = null

// strudel's own logger: scheduler errors, missing samples, etc.
document.addEventListener('strudel.log', ({ detail }) => {
  // scheduler and midi problems are logged untyped, e.g. "[cyclist] error: ..."
  // or "[midi] midiport ... not found!"
  const message = String(detail.message)
  if (detail.type === 'warning') report('warning', message)
  else if (detail.type === 'error' || /error|not found|disconnected/i.test(message)) report('error', message)
})

window.ready = strudel.initStrudel({
  prebake,
  onEvalError: (err) => { evalError = err },
}).then(() => {
  report('info', 'strudel ready')
  return true
})

// returns an error message, or null when the pattern is playing
window.strudelEval = async (code) => {
  await window.ready
  await strudel.getAudioContext().resume()
  evalError = null
  await strudel.evaluate(code)
  return evalError ? (evalError.message || String(evalError)) : null
}

window.strudelHush = () => strudel.hush()

// names to pass to .midi('...')
window.strudelMidiOutputs = async () => {
  if (!strudel.WebMidi.enabled) await strudel.enableWebMidi()
  return strudel.WebMidi.outputs.map((output) => output.name)
}
