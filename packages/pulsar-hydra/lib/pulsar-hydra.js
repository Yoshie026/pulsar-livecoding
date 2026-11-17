'use babel'

import Main from './main.js'
import SyphonBridge from './syphon-bridge'
import Mutator from './mutator'
import { setMenuChecked } from './menu-state'
import { CompositeDisposable } from 'atom'

export default {
  isActive: false,
  subscriptions: null,
  main: null,
  syphon: null,

  config: {
    syphonServer: {
      title: 'Syphon source',
      description: 'Part of the Syphon server or app name to pick up, e.g. UE5, TouchDesigner, OBS. Use * to take whichever is running. Applies the next time Syphon is switched on.',
      type: 'string',
      default: 'UE5'
    },
    audioInput: {
      title: 'Audio input (a.fft)',
      description: 'Device that a.fft listens to, e.g. BlackHole for audio from Strudel. Empty = the macOS default input. The list refreshes when devices are plugged in.',
      type: 'string',
      default: ''
    }
  },

  activate(state) {
    this.main = new Main()
    this.syphon = new SyphonBridge(() => this.updateMenu())
    this.mutator = new Mutator(this.main)
    // the UDP port has to be released before a reloaded window binds it again
    this.onUnload = () => this.main.osc.disable()
    window.addEventListener('beforeunload', this.onUnload)
    // // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
     this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'pulsar-hydra:toggle': () => this.toggle(),
      'pulsar-hydra:evalLine': () => this.main.evalLine(),
      'pulsar-hydra:evalBlock': () => this.main.evalBlock(),
      'pulsar-hydra:evalCode': () => this.main.evalCode(),
      'pulsar-hydra:toggleVisibility': () => this.main.toggleVisibility(),
      'pulsar-hydra:editInit': () => this.main.editInitFile(),
      'pulsar-hydra:toggleSyphon': () => this.syphon.toggle(),
      'pulsar-hydra:toggleUdp': () => this.toggleUdp(),
      'pulsar-hydra:randomChange': () => this.isActive && this.mutator.mutate(),
      'pulsar-hydra:rerollChange': () => this.isActive && this.mutator.mutate(true)
    }));

    this.refreshAudioInputs = () => this.updateAudioInputs()
    navigator.mediaDevices.addEventListener('devicechange', this.refreshAudioInputs)
    this.updateAudioInputs()
    this.subscriptions.add(atom.config.onDidChange('pulsar-hydra.audioInput', () => {
      if (this.isActive) this.main.rebuildAudio()
    }))
  },

  // fill the settings dropdown with the inputs macOS currently reports
  async updateAudioInputs() {
    const current = atom.config.get('pulsar-hydra.audioInput')
    const labels = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'audioinput' && device.label && device.deviceId !== 'default')
      .map((device) => device.label)
    if (current && !labels.includes(current)) labels.push(current)
    atom.config.setSchema('pulsar-hydra.audioInput', {
      ...this.config.audioInput,
      enum: [{ value: '', description: 'System default' }, ...labels.map((label) => ({ value: label, description: label }))]
    })
  },

  deactivate() {
  //  this.modalPanel.destroy();
    this.subscriptions.dispose()
    navigator.mediaDevices.removeEventListener('devicechange', this.refreshAudioInputs)
    window.removeEventListener('beforeunload', this.onUnload)
    this.syphon.destroy()
    this.main.osc.disable()
    if (this.isActive) this.main.stop()
    this.isActive = false
    this.updateMenu()
  //  this.atomHydraView.destroy();
  },

  serialize() {
    return {
    //  atomHydraViewState: this.atomHydraView.serialize()
    };
  },

  toggle() {
    this.isActive = !this.isActive
    if (this.isActive) this.main.start()
    else this.main.stop()
    this.updateMenu()
  },

  toggleUdp() {
    const osc = this.main.osc
    if (osc.enabled) osc.disable()
    else osc.enable()
    atom.notifications.addInfo(osc.enabled
      ? `udp on (receive :${osc.port}, send ${osc.sendHost}:${osc.sendPort})`
      : 'udp off')
    this.updateMenu()
  },

  updateMenu() {
    setMenuChecked('pulsar-hydra:toggle', this.isActive)
    setMenuChecked('pulsar-hydra:toggleUdp', this.main.osc.enabled)
    setMenuChecked('pulsar-hydra:toggleSyphon', this.syphon.isRunning())
  }

};
