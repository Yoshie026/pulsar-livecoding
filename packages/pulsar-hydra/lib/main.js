'use babel'

// Pulsar runs on a modern Electron: `remote` and renderer-side desktopCapturer
// were removed, so main-process modules have to come through @electron/remote.
// It ships inside Pulsar's app.asar, which package requires don't search.
const remote = require(require('path').join(process.resourcesPath, 'app.asar/node_modules/@electron/remote'))
const { desktopCapturer, systemPreferences } = remote
var MessagePanelView = require('atom-message-panel').MessagePanelView
var PlainMessageView = require('atom-message-panel').PlainMessageView

window.systemPreferences = systemPreferences

//import Audio from './audio'
import Hydra from 'hydra-synth'
//import Hydra from '../../hydra-synth'
import OscLoader from './osc-loader'
//import SourceClips from './source-clips'
const loop = require('raf-loop')
import P5 from './p5'
import Three from './three'
//import 'p5/lib/addons/p5.sound'
//import 'p5/lib/addons/p5.dom'
//{$} = require 'atom'

const fs = require('fs')
const path = require('path')

const PORT = 57101
const INIT_PATH = path.join(atom.getConfigDirPath(), 'hydra-init.js')
// outgoing OSC goes to the same UDP port as flok's bridge/server.js
const SEND_HOST = '127.0.0.1'
const SEND_PORT = 8000
// Syphon frames (e.g. from UE5) arrive through bridge/syphon-bridge.js
const SYPHON_URL = 'ws://localhost:8765'

// hydra-synth's a.fft always opens the default input with getUserMedia({audio: true}).
// Point that request at the input picked in Settings > Packages > pulsar-hydra.
const mediaDevices = navigator.mediaDevices
if (mediaDevices && !mediaDevices.hydraInputPatched) {
  const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices)
  mediaDevices.getUserMedia = async (constraints = {}) => {
    const label = atom.config.get('pulsar-hydra.audioInput')
    if (label && constraints.audio === true && !constraints.video) {
      const input = (await mediaDevices.enumerateDevices())
        .find((device) => device.kind === 'audioinput' && device.label === label)
      if (input) constraints = { ...constraints, audio: { deviceId: { exact: input.deviceId } } }
      else console.log(`[HYDRA] audio input "${label}" not found, using the system default`)
    }
    return getUserMedia(constraints)
  }
  mediaDevices.hydraInputPatched = true
}

export default class Main {

  constructor() {
    this.hydra = null
    // OSC over UDP, switched on/off from the menu independently of hydra
    this.osc = new OscLoader(PORT)
    this.osc.setSendTarget(SEND_HOST, SEND_PORT)
    window.msg = this.osc
    window.send = (address = '', args) => {
      if (!this.osc.enabled) return this.log('send: UDP is off (Packages > Livecoding > Hydra > UDP)', 'text-warning')
      this.osc.send(address, args)
    }
    this.audio = null
    this.messages = null
  
    window.P5 = P5
    window.log = this.log.bind(this)
  }

  _eval(code) {

    var success = true
    try {
      // like the hydra web editor: blocks using await (e.g. loadScript) run
      // inside an async function, so variables declared there with let/const
      // stay local to that block
      if (/\bawait\b/.test(code)) {
        eval('(async () => {\n' + code + '\n})()').catch((e) => this.log(e.message, 'text-error'))
      } else {
        eval(code)
      }
    } catch (e) {
      success = false
      console.log(e, e.name, e.lineNumber, e.columnNumber, e.stack)
      // this.messages.add(new PlainMessageView({
      //     message: e.message,
      //     className: 'text-error'
      // }))
      this.log(e.message, 'text-error')
    }
    if(success) {
      this.log(code, 'text-muted')
      // this.messages.add(new PlainMessageView({
      //     message: code,
      //     className: 'text-muted'
      // }))
    }
    return success
  }

  // hydra-synth's loadScript adds a <script src>, which Pulsar's content
  // security policy blocks for remote URLs; fetch the text and run it instead
  async loadScript(url = '') {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText)
      ;(0, eval)(await res.text())
      this.log('loaded ' + url, 'text-success')
    } catch (e) {
      this.log('loadScript ' + url + ': ' + e.message, 'text-error')
    }
  }

  log(msg, _class) {
    if (!this.messages) return
    this.messages.clear()
    this.messages.add(new PlainMessageView({
        message: msg,
        className: _class
    }))
  }

  evalBlock() {
    let editor
    if (editor = atom.workspace.getActiveTextEditor()) {
      var range = this.getCurrentParagraphIncludingComments(editor);
      this.evalFlash(range)
      var expression = editor.getTextInBufferRange(range);
      return this._eval(expression)
    }
  }

  evalCode() {
    let editor
    if (editor = atom.workspace.getActiveTextEditor()) {
      range = {
        start: { row: 0, column: 0 },
        end: { row: editor.getLastScreenRow() + 1, column: 0 }
      }
      this.evalFlash(range);
      this._eval(editor.getText());
    }
  }

  getCurrentParagraphIncludingComments(editor) {
          var cursor = editor.getLastCursor();
          var endRow = cursor.getBufferRow();
          var startRow = endRow;
          var lineCount = editor.getLineCount();

          // lines must include non-whitespace characters
          // and not be outside editor bounds
          while (/\S/.test(editor.lineTextForBufferRow(startRow)) && startRow >= 0) {
              startRow--;
          }
          while (/\S/.test(editor.lineTextForBufferRow(endRow)) && endRow < lineCount) {
              endRow++;
          }
          return {
              start: {
                  row: startRow + 1,
                  column: 0
              },
              end: {
                  row: endRow,
                  column: 0
              },
          };
      }

      evalFlash(range) {
        console.log('evalFlash', range)
        let editor
      //  console.log("eval", atom.workspace.getActiveTextEditor())
        if (editor = atom.workspace.getActiveTextEditor()) {
          //  var editor = this.getEditor();
            var marker = editor.markBufferRange(range, {
                invalidate: 'touch'
            });

            var decoration = editor.decorateMarker(
                marker, {
                    type: 'line',
                    class: 'hydra-flash'
                });

            setTimeout(() => {
                marker.destroy();
            }, 200)

          }
        }

  evalLine () {
    let editor
  //  console.log("eval", atom.workspace.getActiveTextEditor())
    if (editor = atom.workspace.getActiveTextEditor()) {
      var range
      let selection = editor.getSelectedText()
      range = editor.getSelectedBufferRange()
        // evaluate selection, if selection is less than 1, evaluate entire line
      if(selection.length < 1){
        let pt = editor.getCursorBufferPosition()
        selection = editor.lineTextForBufferRow(pt.row)
        range ={ start: pt, end: pt }
      //  editor.selectLinesContainingCursors()
      //  selection = editor.getSelectedText()

      }
  //    console.log("evalling", selection)
      this._eval(selection)
      this.evalFlash(range)
    }
  }

  start() {
    //this.clips = new SourceClips()
    this.messages = new MessagePanelView({ title: 'hydra >>'})
    this.messages.attach()
    this.messages.toggle()
    //  if (editor = atom.workspace.getActiveTextEditor()) {
    atom.workspace.element.oncontextmenu = function(event) {
      if(event.preventDefault != undefined) event.preventDefault()
      if(event.stopPropagation != undefined) event.stopPropagation()
    }
    //  }

    const editor = atom.workspace.getActiveTextEditor()
    this.element = document.createElement('div')
    this.element.classList.add('hydra')
    this.canvas = document.createElement('canvas')
    this.canvas.classList.add('hydra-canvas')
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight

    document.body.classList.add('hydra-enabled')
    this.element.appendChild(this.canvas)
    //this.element.appendChild(this.audioCanvas)
    console.log('Hydra was toggled!', atom.workspace.element)
    atom.workspace.element.appendChild(this.element)


    this.hydra = new Hydra ({
      canvas: this.canvas,
      autoLoop: false
    })
    this.initMic()

    // hijack source init screen event because doesn't work in Electron
    this.hydra.s.forEach((source) => {
      source.initScreen = (index = 0) =>  desktopCapturer.getSources({types: ['window', 'screen']}).then(async (sources) => {
      console.log(sources);
        try {
            if (sources.length > index) {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sources[index].id,
                  //  minWidth: 1280,
                    maxWidth: window.innerWidth,
                //    minHeight: 720,
                    maxHeight: window.innerHeight
                  }
                }
              })
              const video = document.createElement('video')
              video.srcObject = stream
              video.addEventListener('loadedmetadata', () => {
              video.play().then(() => {
                  source.src = video
                  source.tex = source.regl.texture(source.src)
                })
              })
            }
        } catch (error) {
          console.log('initScreen error: ', error);
          throw error
        }

      })

      // hijack initCam: macOS only shows the camera prompt when asked from the
      // main process, and hydra-synth's webcam helper swallows every error
      source.initCam = async (index = 0, params) => {
        // re-running a block that calls initCam keeps the open stream
        const live = source.src && source.src.srcObject &&
          source.src.srcObject.getVideoTracks().some((track) => track.readyState === 'live')
        if (live && source.camIndex === index) return
        if (live) source.src.srcObject.getTracks().forEach((track) => track.stop())
        try {
          this.log('initCam: camera permission = ' + systemPreferences.getMediaAccessStatus('camera'), 'text-muted')
          if (process.platform === 'darwin' &&
              !(await systemPreferences.askForMediaAccess('camera'))) {
            throw new Error('camera access denied (System Settings > Privacy & Security > Camera > Pulsar)')
          }
          const cameras = (await navigator.mediaDevices.enumerateDevices())
            .filter((device) => device.kind === 'videoinput')
          const video = document.createElement('video')
          video.muted = true
          video.playsInline = true
          video.srcObject = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: cameras[index] ? { deviceId: { exact: cameras[index].deviceId } } : true
          })
          await video.play()
          this.log('initCam: ' + (cameras[index] ? cameras[index].label : 'default camera') +
            ' ' + video.videoWidth + 'x' + video.videoHeight, 'text-success')
          source.src = video
          source.camIndex = index
          source.dynamic = true
          source.tex = source.regl.texture({ data: video, ...params })
        } catch (error) {
          console.log('initCam error: ', error)
          this.log('initCam: ' + error.message, 'text-error')
        }
      }
    })

    window.loadScript = (url) => this.loadScript(url)

    this.randomButton = document.createElement('button')
    this.randomButton.classList.add('hydra-random-button')
    this.randomButton.textContent = '⤮'
    this.randomButton.title = 'make random change (shift-click: change the same number again)'
    // keep focus (and the cursor) in the editor
    this.randomButton.addEventListener('mousedown', (e) => e.preventDefault())
    this.randomButton.addEventListener('click', (e) =>
      atom.commands.dispatch(atom.views.getView(atom.workspace), e.shiftKey ? 'pulsar-hydra:rerollChange' : 'pulsar-hydra:randomChange'))
    document.body.appendChild(this.randomButton)

    if (!this.syphonCanvas) this.initSyphon()
    window.syphon = (source = window.s0) => source.init({ src: this.syphonCanvas, dynamic: true })

    // three.js scene, created on first use so it costs nothing until a sketch touches `three`
    window.THREE = Three.THREE
    Object.defineProperty(window, 'three', {
      configurable: true,
      get: () => this.three || (this.three = new Three({ log: this.log.bind(this) }))
    })


    var self = this
    this.engine = loop(function(dt) {
        // delta time in milliseconds
        self.hydra.tick(dt)
    //    self.audio.tick()
    }).start()

    this.runInitFile()
  }

  // hydra-synth opens the mic for a.fft as soon as it starts and swallows the
  // error, but macOS only shows the mic prompt when asked from the main process.
  // Ask, then rebuild the analyser once access is granted.
  async initMic() {
    if (process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('microphone') === 'granted') return
    if (!(await systemPreferences.askForMediaAccess('microphone'))) {
      return this.log('a.fft: microphone access denied (System Settings > Privacy & Security > Microphone > Pulsar)', 'text-error')
    }
    this.rebuildAudio()
  }

  // reopen a.fft on the current input (after a permission grant or an input
  // change in settings), keeping the bins / smooth / cutoff / scale set from code
  rebuildAudio() {
    if (!this.hydra) return
    const old = this.hydra.synth.a
    if (old) {
      if (old.stream) old.stream.getTracks().forEach((track) => track.stop())
      if (old.context) old.context.close()
      if (old.canvas) old.canvas.remove()
    }
    this.hydra._initAudio()
    const a = this.hydra.synth.a
    if (old) {
      a.setBins(old.bins.length)
      a.settings = old.settings
      a.cutoff = old.cutoff
      a.smooth = old.smooth
      a.scale = old.scale
      if (old.isDrawing) a.show()
      else a.hide()
    }
    window.a = a
    this.log('a.fft: listening to ' + (atom.config.get('pulsar-hydra.audioInput') || 'system default input'), 'text-muted')
  }

  // sources and globals set up here survive every toggle / reload
  runInitFile() {
    if (!fs.existsSync(INIT_PATH)) return
    this._eval(fs.readFileSync(INIT_PATH, 'utf8'))
  }

  editInitFile() {
    if (!fs.existsSync(INIT_PATH)) {
      fs.writeFileSync(INIT_PATH, [
        '// runs every time hydra starts (toggle on, Pulsar reload)',
        '// sources set up here can be used from any sketch: src(s1), src(s0)',
        '',
        'syphon(s1)',
        '// s0.initCam()',
        ''
      ].join('\n'))
    }
    atom.workspace.open(INIT_PATH)
  }
    // osc().out()

  // keeps reconnecting so the bridge can be started before or after hydra
  initSyphon() {
    this.syphonCanvas = document.createElement('canvas')
    const ctx = this.syphonCanvas.getContext('2d')
    const connect = () => {
      if (!this.hydra) return
      this.syphonSocket = new WebSocket(SYPHON_URL)
      this.syphonSocket.binaryType = 'arraybuffer'
      this.syphonSocket.onopen = () => { console.log('syphon connected') }
      this.syphonSocket.onmessage = ({ data }) => {
        const [width, height] = new Uint32Array(data, 0, 2)
        if (this.syphonCanvas.width !== width || this.syphonCanvas.height !== height) {
          this.syphonCanvas.width = width
          this.syphonCanvas.height = height
        }
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data, 8), width, height), 0, 0)
      }
      this.syphonSocket.onclose = () => {
        this.syphonTimer = setTimeout(connect, 3000)
      }
    }
    connect()
  }

  onOsc(msg) {
  //  console.log("OSC", msg)

  }

  stop() {
  //  this.isActive = false
    this.toggleVisibility(false) // restore atom workspace view when package is disabled
    // release camera / screen streams so the camera light goes off
    this.hydra.s.forEach((source) => {
      if (source.src && source.src.srcObject) source.src.srcObject.getTracks().forEach((track) => track.stop())
    })
    const audio = this.hydra.synth.a
    if (audio && audio.stream) audio.stream.getTracks().forEach((track) => track.stop())
    if (audio && audio.context) audio.context.close()
    this.engine.stop()
    if (this.three) this.three.destroy()
    this.three = null
    delete window.three
    this.hydra.regl.destroy()
    this.hydra = null
    clearTimeout(this.syphonTimer)
    if (this.syphonSocket) {
      this.syphonSocket.onclose = null
      this.syphonSocket.close()
    }
    this.syphonCanvas = null
    document.body.classList.remove('hydra-enabled')
    this.randomButton.remove()
    atom.workspace.element.removeChild(this.element)
    this.messages.close()
    // if (this.osc) {
    //       this.osc.destroy();
    //   }

  }

  toggleVisibility(hide = true) {
    console.log('toggleVisibility() invoked')

    if (atom.packages.isPackageActive('pulsar-hydra')) {
      const panels = atom.workspace.element.getElementsByClassName('horizontal')[0]
      const footer = atom.workspace.element.getElementsByClassName('footer')[0]

      if (panels.style.visibility !== 'hidden' &&
          footer.style.visibility !== 'hidden' &&
          hide) {
        panels.style.visibility = 'hidden'
        footer.style.visibility = 'hidden'
      } else {
        panels.style.visibility = ''
        footer.style.visibility = ''
      }
    }

  }

}
