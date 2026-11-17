const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { CompositeDisposable, Disposable } = require('atom')

const CONFIG_PATH = path.join(atom.getConfigDirPath(), 'launcher.json')
const LOG_URI = 'atom://launcher/log'
const MAX_LOG_LINES = 5000

const expandHome = (p) => (p || '').replace(/^~(?=$|\/)/, os.homedir())

module.exports = {
  subscriptions: null,
  processes: null, // name -> { spec, child, state }
  statusTile: null,
  logEditor: null,

  activate() {
    this.processes = new Map()
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'launcher:start-all': () => this.each((name) => this.start(name)),
      'launcher:stop-all': () => this.each((name) => this.stop(name)),
      'launcher:restart-all': () => this.each((name) => this.restart(name)),
      'launcher:show-log': () => this.showLog(),
      'launcher:edit-config': () => atom.workspace.open(CONFIG_PATH)
    }))
    this.subscriptions.add(atom.workspace.addOpener((uri) => {
      if (uri === LOG_URI) return this.getLogEditor()
    }))
    // pick up config edits as soon as they are saved
    // (compared by real path: launcher.json may be a symlink into the repo)
    const realPath = (p) => { try { return fs.realpathSync(p) } catch (e) { return p } }
    this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {
      if (!editor.getPath() || realPath(editor.getPath()) !== realPath(CONFIG_PATH)) return
      this.subscriptions.add(editor.onDidSave(() => this.loadConfig()))
    }))

    // child processes must not outlive the window (or a reload of it)
    this.onUnload = () => this.stopAll()
    window.addEventListener('beforeunload', this.onUnload)

    this.loadConfig()
    this.each((name, entry) => { if (entry.spec.autostart) this.start(name) })
  },

  deactivate() {
    window.removeEventListener('beforeunload', this.onUnload)
    this.stopAll()
    this.subscriptions.dispose()
    if (this.toggleCommands) this.toggleCommands.dispose()
    if (this.statusTile) this.statusTile.destroy()
  },

  consumeStatusBar(statusBar) {
    this.statusElement = document.createElement('div')
    this.statusElement.classList.add('launcher-status', 'inline-block')
    this.statusTile = statusBar.addRightTile({ item: this.statusElement, priority: 200 })
    this.render()
    return new Disposable(() => this.statusTile.destroy())
  },

  readConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(path.join(__dirname, 'default-config.json'), CONFIG_PATH)
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  },

  loadConfig() {
    let config
    try {
      config = this.readConfig()
    } catch (e) {
      atom.notifications.addError('launcher: could not read ' + CONFIG_PATH, { detail: e.message })
      return
    }
    const specs = new Map(config.processes.map((spec) => [spec.name, spec]))
    if (this.toggleCommands) this.toggleCommands.dispose()
    this.toggleCommands = new CompositeDisposable()
    // drop processes that left the config, keep running ones that stayed
    for (const name of [...this.processes.keys()]) {
      if (!specs.has(name)) {
        this.stop(name)
        this.processes.delete(name)
      }
    }
    for (const [name, spec] of specs) {
      const entry = this.processes.get(name)
      if (entry) entry.spec = spec
      else this.processes.set(name, { spec, child: null, state: 'stopped' })
      this.toggleCommands.add(atom.commands.add('atom-workspace', `launcher:toggle-${name}`, () => this.toggle(name)))
    }
    this.render()
  },

  each(fn) {
    for (const [name, entry] of this.processes) fn(name, entry)
  },

  toggle(name) {
    const entry = this.processes.get(name)
    if (entry && entry.child) this.stop(name)
    else this.start(name)
  },

  start(name) {
    const entry = this.processes.get(name)
    if (!entry || entry.child) return
    const { command, cwd, env } = entry.spec
    this.log(name, `$ ${command}`)
    // run through a login shell so commands resolve the same way as in a terminal;
    // detached puts it in its own process group so stop() also reaches
    // grandchildren (npm -> vite)
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', command], {
      cwd: expandHome(cwd) || os.homedir(),
      env: { ...process.env, ...env },
      detached: true
    })
    entry.child = child
    entry.state = 'running'
    child.stdout.on('data', (data) => this.log(name, data))
    child.stderr.on('data', (data) => this.log(name, data))
    child.on('error', (e) => this.log(name, 'error: ' + e.message))
    child.on('exit', (code, signal) => {
      if (entry.child !== child) return
      entry.child = null
      entry.state = entry.stopping || code === 0 ? 'stopped' : 'crashed'
      entry.stopping = false
      this.log(name, `exited (${signal || code})`)
      if (entry.state === 'crashed') {
        atom.notifications.addWarning(`launcher: ${name} exited with ${signal || code}`, {
          buttons: [{ text: 'Show Log', onDidClick: () => this.showLog() }]
        })
      }
      this.render()
    })
    this.render()
  },

  stop(name) {
    const entry = this.processes.get(name)
    if (!entry || !entry.child) return
    const child = entry.child
    entry.stopping = true
    this.signal(child, 'SIGTERM')
    // node-syphon traps signals, so make sure it really goes away
    setTimeout(() => { if (child.exitCode === null) this.signal(child, 'SIGKILL') }, 2000)
  },

  restart(name) {
    const entry = this.processes.get(name)
    if (!entry) return
    if (!entry.child) return this.start(name)
    entry.child.once('exit', () => this.start(name))
    this.stop(name)
  },

  stopAll() {
    if (!this.processes) return
    // synchronous: beforeunload won't wait for timers
    this.each((name, entry) => {
      if (!entry.child) return
      entry.stopping = true
      this.signal(entry.child, 'SIGKILL')
    })
  },

  signal(child, sig) {
    try {
      process.kill(-child.pid, sig)
    } catch (e) {
      try { child.kill(sig) } catch (e2) {}
    }
  },

  render() {
    if (!this.statusElement) return
    this.statusElement.innerHTML = ''
    this.each((name, entry) => {
      const item = document.createElement('a')
      item.classList.add('launcher-item', entry.state)
      item.textContent = name
      item.addEventListener('click', () => this.toggle(name))
      item.title = `${name}: ${entry.state} (click to ${entry.child ? 'stop' : 'start'})`
      this.statusElement.appendChild(item)
    })
  },

  getLogEditor() {
    if (this.logEditor && !this.logEditor.isDestroyed()) return this.logEditor
    const editor = atom.workspace.buildTextEditor({ readOnly: true, autoHeight: false })
    editor.getTitle = () => 'Launcher Log'
    editor.getURI = () => LOG_URI
    editor.shouldPromptToSave = () => false
    editor.getAllowedLocations = () => ['bottom', 'center']
    editor.getDefaultLocation = () => 'bottom'
    this.logEditor = editor
    return editor
  },

  showLog() {
    atom.workspace.open(LOG_URI, { location: 'bottom' })
  },

  log(name, data) {
    const editor = this.getLogEditor()
    const buffer = editor.getBuffer()
    const lines = String(data).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    buffer.append(lines.map((line) => `[${name}] ${line}\n`).join(''))
    if (buffer.getLineCount() > MAX_LOG_LINES) {
      buffer.deleteRows(0, buffer.getLineCount() - MAX_LOG_LINES)
    }
    editor.scrollToBottom()
  }
}
