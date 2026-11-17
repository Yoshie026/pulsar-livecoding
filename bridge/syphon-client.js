// syphon-client.js
import {
  SyphonOpenGLClient,
  SyphonServerDirectory,
  SyphonServerDirectoryListenerChannel,
} from 'node-syphon'
import { spawn } from 'child_process'

let client
let ffmpeg

const directory = new SyphonServerDirectory()

directory.on(
  SyphonServerDirectoryListenerChannel.SyphonServerAnnounceNotification,
  (server) => {
    if (directory.servers.length > 0 && !client) {
      console.log('connecting to', server.name || server)

      client = new SyphonOpenGLClient(directory.servers[directory.servers.length - 1])

      client.on('frame', (frame) => {
        const { buffer, width, height } = frame

        // lazily start ffmpeg once we know the frame size
        if (!ffmpeg) {
          ffmpeg = spawn('ffmpeg', [
            '-f', 'rawvideo',
            '-pixel_format', 'rgba',
            '-video_size', `${width}x${height}`,
            '-i', '-',
            '-f', 'flv',
            'rtmp://your-rtmp-target/stream-key'
          ])
        }

        ffmpeg.stdin.write(buffer)
      })
    }
  }
)

directory.on(
  SyphonServerDirectoryListenerChannel.SyphonServerRetireNotification,
  (server) => console.log('server left', server)
)

directory.listen()
