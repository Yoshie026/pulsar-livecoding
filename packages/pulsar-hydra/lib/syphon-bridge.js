'use babel'

// Starts/stops bridge/syphon-bridge.js, which streams a Syphon server's
// frames to hydra's syphon() source over ws://localhost:8765.
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

// the bridge lives in the same repo (packages/pulsar-hydra/lib -> bridge)
const BRIDGE_DIR = path.join(__dirname, '..', '..', '..', 'bridge')

export default class SyphonBridge {

  constructor(onChange = () => {}) {
    this.child = null
    this.onChange = onChange
    // the bridge must not outlive the window (or a reload of it)
    this.onUnload = () => this.stop('SIGKILL')
    window.addEventListener('beforeunload', this.onUnload)
  }

  isRunning() {
    return !!this.child
  }

  toggle() {
    if (this.child) this.stop()
    else this.start()
  }

  start() {
    if (this.child) return
    const server = atom.config.get('pulsar-hydra.syphonServer')
    // login shell so `node` resolves even when Pulsar is opened from the Dock;
    // detached puts it in its own process group so stop() reaches node too
    const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', 'node syphon-bridge.js'], {
      cwd: BRIDGE_DIR,
      env: { ...process.env, SYPHON_SERVER: server, PULSAR_PID: String(process.pid) },
      detached: true
    })
    this.child = child
    child.stdout.on('data', (data) => console.log('[syphon]', String(data).trim()))
    child.stderr.on('data', (data) => console.error('[syphon]', String(data).trim()))
    child.on('error', (e) => atom.notifications.addError('syphon bridge: ' + e.message))
    child.on('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = null
      if (!this.stopping && code !== 0) {
        atom.notifications.addWarning(`syphon bridge exited (${signal || code})`, {
          detail: 'View > Developer > Toggle Developer Tools for the log'
        })
      }
      this.stopping = false
      this.onChange()
    })
    this.onChange()
    atom.notifications.addSuccess(`syphon on (waiting for "${server}")`)
  }

  stop(sig = 'SIGTERM') {
    const child = this.child
    if (!child) return
    this.stopping = true
    this.signal(child, sig)
    // node-syphon traps signals, so make sure it really goes away
    if (sig !== 'SIGKILL') {
      setTimeout(() => { if (child.exitCode === null) this.signal(child, 'SIGKILL') }, 2000)
      atom.notifications.addInfo('syphon off')
    }
  }

  signal(child, sig) {
    try {
      process.kill(-child.pid, sig)
    } catch (e) {
      try { child.kill(sig) } catch (e2) {}
    }
  }

  destroy() {
    window.removeEventListener('beforeunload', this.onUnload)
    this.stop('SIGKILL')
  }
}
