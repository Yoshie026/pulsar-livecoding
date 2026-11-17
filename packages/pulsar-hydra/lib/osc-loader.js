'use babel'

import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as oscMin from 'osc-min';

// Receives OSC on a UDP socket inside Pulsar itself. This used to spawn
// `node osc-server.js`, which fails silently when Pulsar is launched from the
// Dock and can't find node on its PATH.
export default class OscLoader extends EventEmitter {

    // nothing touches the network until enable(); msg.on() handlers can be
    // registered either way and start firing once UDP is on
    constructor(port) {
      super()
      this.port = port
      this.enabled = false
    }

    enable() {
      if (this.enabled) return
      this.enabled = true
      this.listen(this.port)
    }

    disable() {
      if (!this.enabled) return
      this.enabled = false
      this.destroy()
    }

    listen(port) {
      this.port = port
      this.server = dgram.createSocket('udp4', this.onPacket)
      this.server.on('error', (e) => console.error('[HYDRA] OSC receive error', e))
      this.server.bind(port, () => console.log("listening on port", port))
    }

    setPort(port) {
      console.log("setting port to " + port)
      this.closeServer()
      if (this.enabled) this.listen(port)
      else this.port = port
    }

    closeServer() {
      try {
          if (this.server) this.server.close()
      } catch (e) {
          console.error(e)
      }
      this.server = null
    }

    destroy() {
        this.closeServer()
        if (this.sendSocket) this.sendSocket.close()
        this.sendSocket = null
    }

    setSendTarget(host, port) {
      this.sendHost = host
      this.sendPort = port
    }

    // send(address, args) -- args can be a single value or an array,
    // same as flok's send(); osc-min infers int/float/string types
    send(address, args = []) {
      if (!this.enabled) return
      if (!this.sendSocket) this.sendSocket = dgram.createSocket('udp4')
      const buf = oscMin.toBuffer({
        address,
        args: (Array.isArray(args) ? args : [args]).map((value) =>
          Number.isInteger(value) ? { type: 'integer', value } : value)
      })
      this.sendSocket.send(buf, 0, buf.length, this.sendPort, this.sendHost)
    }

    // for live coding, when new event listener is added, remove
    // previous listeners at the same address
    on(addr, callback){
      this.removeAllListeners(addr)
      super.on(addr, callback)
    }

    onPacket = (buf) => {
      try {
        this.dispatch(oscMin.fromBuffer(buf))
      } catch (e) {
        console.log("[HYDRA] bad OSC packet", e)
      }
    };

    dispatch(msg) {
      if (msg.oscType === 'bundle') return msg.elements.forEach((el) => this.dispatch(el))
      msg.args = msg.args.map((a) => a.value)
      this.emit('*', msg)
      this.emit(msg.address, msg.args)
    }
}
