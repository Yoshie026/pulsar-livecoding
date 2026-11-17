
// Pulsar drops `checked` when a package adds menu items, but sends the stored
// template to the native menu as-is, so setting it in place afterwards gives
// a real macOS checkmark.
function setMenuChecked(command, checked) {
  const walk = (items = []) => items.forEach((item) => {
    if (item.command === command) {
      item.type = 'checkbox'
      item.checked = checked
    }
    walk(item.submenu)
  })
  walk(atom.menu.template)
  atom.menu.update()
}

module.exports = { setMenuChecked }
