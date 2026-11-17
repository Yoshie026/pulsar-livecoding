const path = require('path')
const { CompositeDisposable } = require('atom')
const { MessagePanelView, PlainMessageView } = require('atom-message-panel')
const { setMenuChecked } = require('./menu-state')
// Pulsar's CSP blocks the data: URLs strudel loads its audio worklets from, so
// strudel runs in its own hidden window. That also keeps audio timing steady
// while the editor is busy. @electron/remote ships inside Pulsar's app.asar.
const remote = require(path.join(process.resourcesPath, 'app.asar/node_modules/@electron/remote'))

const REPORT = '[pulsar-strudel]'

module.exports = {
  subscriptions: null,
  engine: null,
  messages: null,

  activate() {
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'pulsar-strudel:toggle': () => this.toggle(),
      'pulsar-strudel:hush': () => this.hush(),
      'pulsar-strudel:listMidiOutputs': () => this.listMidiOutputs()
    }))
    this.subscriptions.add(atom.commands.add('atom-text-editor', {
      'pulsar-strudel:evalCode': () => this.evalCode(),
      'pulsar-strudel:evalBlock': () => this.evalBlock()
    }))
    // a reloaded Pulsar window can't receive the engine's callbacks anymore,
    // and the hidden window would otherwise keep playing
    this.onUnload = () => this.stop()
    window.addEventListener('beforeunload', this.onUnload)
  },

  deactivate() {
    window.removeEventListener('beforeunload', this.onUnload)
    this.subscriptions.dispose()
    this.stop()
  },

  toggle() {
    if (this.engine) this.stop()
    else this.start()
  },

  start() {
    if (this.engine) return this.ready
    this.messages = new MessagePanelView({ title: 'strudel >>' })
    this.messages.attach()
    this.log('starting strudel, loading samples...', 'text-muted')

    this.engine = new remote.BrowserWindow({
      show: false,
      webPreferences: {
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    this.engine.webContents.on('console-message', (event, level, message) => {
      if (!message.startsWith(REPORT)) return
      const { type, message: text } = JSON.parse(message.slice(REPORT.length))
      this.log(text, type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-muted')
    })
    this.ready = this.engine.loadFile(path.join(__dirname, 'engine.html'))
      .then(() => this.run('window.ready'))
    this.updateMenu()
    return this.ready
  },

  stop() {
    if (!this.engine) return
    try {
      this.engine.destroy()
    } catch (e) {
      console.error(e)
    }
    this.engine = null
    this.ready = null
    if (this.messages) this.messages.close()
    this.messages = null
    this.updateMenu()
  },

  updateMenu() {
    setMenuChecked('pulsar-strudel:toggle', !!this.engine)
  },


  run(js) {
    return this.engine.webContents.executeJavaScript(js)
  },

  hush() {
    if (this.engine) this.run('strudelHush()')
  },

  async listMidiOutputs() {
    try {
      await this.start()
      const outputs = await this.run('strudelMidiOutputs()')
      this.log(outputs.length ? 'MIDI outputs: ' + outputs.map((name) => `'${name}'`).join(', ') : 'no MIDI outputs found', 'text-info')
    } catch (e) {
      this.log('MIDI: ' + e.message, 'text-error')
    }
  },

  async evaluate(code, range) {
    const editor = atom.workspace.getActiveTextEditor()
    if (editor) this.flash(editor, range)
    try {
      await this.start()
      const error = await this.run(`strudelEval(${JSON.stringify(code)})`)
      if (error) this.log(error, 'text-error')
      else this.log(code, 'text-muted')
    } catch (e) {
      this.log(e.message, 'text-error')
    }
  },

  // strudel replaces the whole running pattern on every eval, so the whole
  // file is the default (use $: labels for several patterns at once)
  evalCode() {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) return
    this.evaluate(editor.getText(), editor.getBuffer().getRange())
  },

  evalBlock() {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) return
    const range = this.currentParagraph(editor)
    this.evaluate(editor.getTextInBufferRange(range), range)
  },

  currentParagraph(editor) {
    const row = editor.getLastCursor().getBufferRow()
    const lineCount = editor.getLineCount()
    const filled = (r) => /\S/.test(editor.lineTextForBufferRow(r) || '')
    let startRow = row
    let endRow = row
    while (startRow > 0 && filled(startRow - 1)) startRow--
    while (endRow < lineCount - 1 && filled(endRow + 1)) endRow++
    return [[startRow, 0], [endRow, editor.lineTextForBufferRow(endRow).length]]
  },

  flash(editor, range) {
    const marker = editor.markBufferRange(range, { invalidate: 'touch' })
    editor.decorateMarker(marker, { type: 'line', class: 'strudel-flash' })
    setTimeout(() => marker.destroy(), 200)
  },

  log(message, className) {
    if (!this.messages) return
    this.messages.clear()
    this.messages.add(new PlainMessageView({ message, className }))
  }
}
