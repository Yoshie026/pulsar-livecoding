// CAMERA — shift-enter runs a line, ctrl-enter runs a block
// first run asks macOS for camera access (Pulsar must be re-signed, see notes)

s0.initCam()          // default camera; s0.initCam(1) for the second one

// plain feed
src(s0).out()

// feedback smear
src(s0)
  .blend(src(o0).scale(1.01).rotate(0.002), 0.85)
  .out()

// edge-ish posterize + colour shift
src(s0).posterize(4, 0.6).diff(src(s0).scrollX(0.005)).hue(() => time * 0.05).out()
