// THREE — extruded 3D text rendered with three.js, fed into hydra as a source
// re-running a block replaces the text with the same name (default "text")

three.out(s2)
three.text('PULSAR', { font: 'Arial Black', depth: 0.4, bevel: 0.03 })
  .spin(0.3, 0.8, 0)
src(s2).out()

// animate anything with functions, like hydra
three.text('HYDRA', { font: 'Impact', depth: 1 })
  .rotate(() => sin(time) * 0.5, () => time, 0)
  .position(0, () => sin(time * 2) * 0.3, 0)
  .scale(() => 1 + a.fft[0] * 0.5)
  .color('#ff2266')

// mangle it with hydra
src(s2).modulate(osc(8, 0.1), 0.05).kaleid(4).out()
src(s2).diff(osc(10, 0.1, 1.2)).out()
src(s2).layer(src(s2).colorama(0.2).scale(1.05)).out()

// several texts: give each a name
three.text('LIVE', { name: 'a' }).position(0, 0.8, 0).spin(0, 1, 0)
three.text('CODE', { name: 'b', material: 'wire' }).position(0, -0.8, 0).spin(1, 0, 0).color('#00ffcc')

// text that changes on its own: geometry is rebuilt when the value changes
three.text(() => new Date().toLocaleTimeString(), { name: 'clock' }).position(0, -1.8, 0).scale(0.5)
three.get('clock').set('BYE')   // change an existing text
three.remove('clock')

// options: font (name in Font Book or .ttf/.otf path), size, depth, bevel, curve, spacing, material
// material: 'normal' (rainbow) | 'standard' (lit, use .color) | 'basic' | 'wire'

// raw three.js: three.scene, three.camera, three.light, THREE
const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial())
three.scene.add(box)
three.update((dt) => { box.rotation.x += dt; box.rotation.y += dt * 0.5 })
three.update((dt) => { three.camera.position.z = 5 + sin(time) })
three.scene.remove(box)   // things you add yourself, you remove yourself

three.clear()   // remove all texts and update() hooks
