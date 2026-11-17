'use babel'

// three.js scene rendered to its own transparent canvas, fed into hydra as a
// source: three.out(s2) then src(s2). Main use is extruded 3D text set from code:
//
//   three.text('PULSAR', { font: 'Arial Black', depth: 0.4 })
//     .rotate(() => time * 0.3, () => time, 0)
//     .color('#ff2266')
//
// Any number argument can be a function, evaluated every frame (like hydra).

const THREE = require('three')
const opentype = require('opentype.js')
const fs = require('fs')
const os = require('os')
const path = require('path')

const FONT_DIRS = [
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
  '/Library/Fonts',
  path.join(os.homedir(), 'Library/Fonts')
]
const DEFAULT_FONT = 'Arial Black'

const val = (v) => (typeof v === 'function' ? v() : v)

// font name ("Arial Black") or path to a .ttf / .otf (.ttc collections aren't supported)
const fontCache = new Map()
function loadFont(name = DEFAULT_FONT) {
  if (fontCache.has(name)) return fontCache.get(name)
  let file = name
  if (!path.isAbsolute(file)) {
    const wanted = name.toLowerCase()
    for (const dir of FONT_DIRS) {
      if (!fs.existsSync(dir)) continue
      const match = fs.readdirSync(dir).find((f) =>
        /\.(ttf|otf)$/i.test(f) && f.replace(/\.(ttf|otf)$/i, '').toLowerCase() === wanted)
      if (match) { file = path.join(dir, match); break }
    }
  }
  if (!fs.existsSync(file)) throw new Error(`three: font "${name}" not found (use a .ttf/.otf name or path)`)
  const buffer = fs.readFileSync(file)
  const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  fontCache.set(name, font)
  return font
}

// outline of a string as THREE.Shapes, size = height of 1 em in scene units
function textShapes(font, str, size = 1, letterSpacing = 0) {
  const shapes = []
  let x = 0
  const glyphs = font.stringToGlyphs(str)
  glyphs.forEach((glyph, i) => {
    const shapePath = new THREE.ShapePath()
    for (const c of glyph.getPath(x, 0, size).commands) {
      // opentype paths are y-down
      if (c.type === 'M') shapePath.moveTo(c.x, -c.y)
      else if (c.type === 'L') shapePath.lineTo(c.x, -c.y)
      else if (c.type === 'Q') shapePath.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y)
      else if (c.type === 'C') shapePath.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y)
    }
    if (shapePath.subPaths.length) {
      // TrueType and CFF fonts wind their outlines in opposite directions:
      // the biggest contour is always solid, so take its winding as "solid"
      let biggest = 0
      for (const sub of shapePath.subPaths) {
        const area = THREE.ShapeUtils.area(sub.getPoints())
        if (Math.abs(area) > Math.abs(biggest)) biggest = area
      }
      shapes.push(...shapePath.toShapes(biggest > 0))
    }
    x += glyph.advanceWidth / font.unitsPerEm * size + letterSpacing
    if (i < glyphs.length - 1) x += font.getKerningValue(glyph, glyphs[i + 1]) / font.unitsPerEm * size
  })
  return shapes
}

function makeMaterial(type, color) {
  switch (type) {
    case 'normal': return new THREE.MeshNormalMaterial({ flatShading: true })
    case 'wire': return new THREE.MeshBasicMaterial({ color, wireframe: true })
    case 'basic': return new THREE.MeshBasicMaterial({ color })
    default: return new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.35 })
  }
}

class Text3D {
  constructor(three, str, opts) {
    this.three = three
    this.str = str
    this.opts = opts
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(opts.material || 'normal', '#ffffff'))
    this.materialType = opts.material || 'normal'
    this.colorValue = '#ffffff'
    this.rot = [0, 0, 0]
    this.spinRate = [0, 0, 0]
    this.spinAngle = [0, 0, 0]
    this.pos = [0, 0, 0]
    this.scl = 1
    this.built = null
    three.scene.add(this.mesh)
  }

  build(str) {
    const o = this.opts
    const font = loadFont(o.font)
    const bevel = o.bevel === undefined ? 0.02 : o.bevel
    const geometry = new THREE.ExtrudeGeometry(textShapes(font, str, o.size, o.spacing), {
      depth: o.depth === undefined ? 0.3 : o.depth,
      curveSegments: o.curve === undefined ? 8 : o.curve,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel * 0.6,
      bevelSegments: 3
    })
    geometry.center()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
    this.built = str
  }

  // change the string; can also be a function, rebuilt whenever its value changes
  set(str) { this.str = str; return this }
  rotate(x = 0, y = 0, z = 0) { this.rot = [x, y, z]; return this }
  // continuous rotation in radians per second, added on top of rotate()
  spin(x = 0, y = 0, z = 0) { this.spinRate = [x, y, z]; return this }
  position(x = 0, y = 0, z = 0) { this.pos = [x, y, z]; return this }
  scale(s = 1) { this.scl = s; return this }
  color(c = '#ffffff') {
    this.colorValue = c
    // a colour only shows on lit / basic materials
    if (this.materialType === 'normal') this.material('standard')
    return this
  }
  // 'normal' (rainbow, no lights needed) | 'standard' (lit) | 'basic' (flat) | 'wire'
  material(type = 'normal') {
    this.materialType = type
    this.mesh.material.dispose()
    this.mesh.material = makeMaterial(type, '#ffffff')
    return this
  }
  remove() { this.three.remove(this); return this }

  update(dt) {
    const str = String(val(this.str))
    if (str !== this.built) this.build(str)
    const m = this.mesh
    for (let i = 0; i < 3; i++) this.spinAngle[i] += val(this.spinRate[i]) * dt
    m.rotation.set(val(this.rot[0]) + this.spinAngle[0], val(this.rot[1]) + this.spinAngle[1], val(this.rot[2]) + this.spinAngle[2])
    m.position.set(val(this.pos[0]), val(this.pos[1]), val(this.pos[2]))
    m.scale.setScalar(val(this.scl))
    if (m.material.color) m.material.color.set(val(this.colorValue))
  }

  dispose() {
    this.three.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}

export default class Three {
  constructor({ log = console.log } = {}) {
    this.THREE = THREE
    this.log = log
    this.canvas = document.createElement('canvas')
    // hydra samples this canvas on its own loop, so keep the last frame around
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setClearColor(0x000000, 0)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    this.camera.position.set(0, 0, 5)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    this.light = new THREE.DirectionalLight(0xffffff, 2)
    this.light.position.set(2, 3, 4)
    this.scene.add(this.light)
    this.objects = new Map() // name -> Text3D
    this.callbacks = []

    this.resize = () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false)
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', this.resize)
    this.resize()

    this.clock = new THREE.Clock()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  tick() {
    const dt = this.clock.getDelta()
    for (const obj of this.objects.values()) {
      try {
        obj.update(dt)
      } catch (e) {
        // a bad font / function shouldn't spam every frame
        this.log(e.message, 'text-error')
        this.remove(obj)
      }
    }
    for (const fn of this.callbacks) {
      try { fn(dt) } catch (e) { this.log(e.message, 'text-error'); this.callbacks = [] }
    }
    this.renderer.render(this.scene, this.camera)
  }

  // feed the 3D canvas into a hydra source
  out(source = window.s2) {
    source.init({ src: this.canvas, dynamic: true })
    return this
  }

  // re-running the same line replaces the object with the same name
  // (default "text"), so give each one its own name to show several
  text(str = 'hello', opts = {}) {
    const name = opts.name || 'text'
    const old = this.objects.get(name)
    if (old) old.dispose()
    const obj = new Text3D(this, str, opts)
    obj.name = name
    this.objects.set(name, obj)
    return obj
  }

  get(name = 'text') { return this.objects.get(name) }

  remove(obj) {
    if (typeof obj === 'string') obj = this.objects.get(obj)
    if (!obj) return this
    obj.dispose()
    this.objects.delete(obj.name)
    return this
  }

  // per-frame hook for anything not covered here: three.update((dt) => mesh.rotation.x += dt)
  // three.update() with no argument removes the hooks
  update(fn) {
    if (fn) this.callbacks.push(fn)
    else this.callbacks = []
    return this
  }

  // removes every text and update() hook (camera / lights stay)
  clear() {
    for (const obj of this.objects.values()) obj.dispose()
    this.objects.clear()
    this.callbacks = []
    return this
  }

  destroy() {
    this.clear()
    this.renderer.setAnimationLoop(null)
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}

Three.THREE = THREE
