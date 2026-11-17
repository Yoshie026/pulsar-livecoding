// Syphon -> WebSocket bridge. Watches for a Syphon server (default "UE5") and
// streams its frames to the browser, where hydra picks them up as a source.
const { WebSocketServer } = require('ws')
const {
  SyphonMetalClient,
  SyphonServerDirectory,
  SyphonServerDirectoryListenerChannel,
} = require('node-syphon')

// "*" matches any server
const wanted = (process.env.SYPHON_SERVER || 'UE5').toLowerCase()
const target = wanted === '*' ? '' : wanted
const port = Number(process.env.SYPHON_PORT || 8765)
const fps = Number(process.env.SYPHON_FPS || 30)
const flip = process.env.SYPHON_FLIP === '1'

const HEADER_BYTES = 8 // uint32 width, uint32 height, then raw RGBA

const wss = new WebSocketServer({ host: 'localhost', port, perMessageDeflate: false })
const directory = new SyphonServerDirectory()

let client = null
let current = null
let lastSent = 0

const uuid = (server) => server.SyphonServerDescriptionUUIDKey
const label = (server) =>
  `${server.SyphonServerDescriptionAppNameKey || '?'} / ${server.SyphonServerDescriptionNameKey || '?'}`
const matches = (server) =>
  [server.SyphonServerDescriptionNameKey, server.SyphonServerDescriptionAppNameKey]
    .some((key) => (key || '').toLowerCase().includes(target))

function pack({ buffer, width, height }) {
  const message = Buffer.allocUnsafe(HEADER_BYTES + buffer.length)
  message.writeUInt32LE(width, 0)
  message.writeUInt32LE(height, 4)
  if (flip) {
    const stride = width * 4
    for (let y = 0; y < height; y++) {
      buffer.copy(message, HEADER_BYTES + y * stride, (height - 1 - y) * stride, (height - y) * stride)
    }
  } else {
    buffer.copy(message, HEADER_BYTES)
  }
  return message
}

function onFrame(frame) {
  const now = Date.now()
  // small tolerance so a 60fps source lands on every 2nd frame, not every 3rd
  if (wss.clients.size === 0 || now - lastSent < 1000 / fps - 5) return
  lastSent = now

  let message
  for (const socket of wss.clients) {
    // drop the frame for clients that are still busy with the previous one
    if (socket.readyState !== socket.OPEN || socket.bufferedAmount > 0) continue
    message = message || pack(frame)
    socket.send(message, { binary: true })
  }
}

function connect(server) {
  console.log('syphon connecting to', label(server))
  current = server
  client = new SyphonMetalClient(server)
  client.on('data', onFrame)
}

function disconnect() {
  if (!client) return
  console.log('syphon disconnected from', label(current))
  client.dispose()
  client = null
  current = null
}

function sync() {
  if (current && !directory.servers.some((server) => uuid(server) === uuid(current))) disconnect()
  if (client) return
  const server = directory.servers.findLast(matches)
  if (server) connect(server)
}

// a server that crashed never retires, so a newly announced match always wins
function onAnnounce(server) {
  if (server && matches(server) && current && uuid(server) !== uuid(current)) disconnect()
  sync()
}

directory.on(SyphonServerDirectoryListenerChannel.SyphonServerAnnounceNotification, onAnnounce)
directory.on(SyphonServerDirectoryListenerChannel.SyphonServerUpdateNotification, sync)
directory.on(SyphonServerDirectoryListenerChannel.SyphonServerRetireNotification, sync)
directory.on(SyphonServerDirectoryListenerChannel.SyphonServerErrorNotification, (err) =>
  console.error('syphon directory error', err)
)
directory.listen()

// node-syphon traps these signals without exiting, so shut down explicitly
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    disconnect()
    directory.dispose()
    wss.close()
    process.exit(0)
  })
}

// when started from Pulsar, exit as soon as Pulsar is gone, even if it
// crashed or was force-quit and never got to stop the bridge
const parentPid = Number(process.env.PULSAR_PID)
if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0)
    } catch (e) {
      console.log('pulsar is gone, stopping')
      process.kill(process.pid, 'SIGTERM')
    }
  }, 2000)
}

wss.on('connection', () => console.log('syphon viewer connected'))

console.log(`syphon bridge waiting for ${target ? `"${target}"` : "any server"} on ws://localhost:${port}`)
