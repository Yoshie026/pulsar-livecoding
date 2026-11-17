'use babel'

// "make random change", like the button in the hydra web editor: pick one
// number in the block under the cursor, set it to something between 0 and twice
// its original value, and run the block. Edits go into the buffer, so cmd-z
// steps back through them.

// numbers inside these calls are left alone (OSC, camera index, audio setup...)
const SKIP_CALLS = new Set([
  'send', 'on', 'initCam', 'initScreen', 'initVideo', 'initImage', 'setBins', 'setSmooth',
  'setScale', 'setCutoff', 'setInterval', 'setTimeout', 'render', 'loadScript', 'setResolution'
])

// finds number literals outside strings/comments, with the call they sit in
export function findNumbers(text) {
  const numbers = []
  const calls = [] // stack of the function names for each open paren
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1
      i++
    } else if (c === '(') {
      const name = /([\w$]+)\s*$/.exec(text.slice(Math.max(0, i - 40), i))
      calls.push(name ? name[1] : '')
      i++
    } else if (c === ')') {
      calls.pop()
      i++
    } else if (/[\w$]/.test(c)) {
      const match = /^(?:\d+\.?\d*(?:e-?\d+)?|[\w$]+)/.exec(text.slice(i))
      const word = match[0]
      const prev = text.slice(0, i).trimEnd()
      // not part of a.b.c, and not an index like a.fft[3]
      const isIndex = /[\w$\]]\[$/.test(prev)
      if (/^\d/.test(word) && !prev.endsWith('.') && !isIndex && !calls.some((call) => SKIP_CALLS.has(call))) {
        numbers.push({ start: i, end: i + word.length, value: parseFloat(word) })
      }
      i += word.length
    } else if (c === '.' && /\d/.test(next) && !/[\w$)\]]$/.test(text.slice(0, i))) {
      const word = /^\.\d+/.exec(text.slice(i))[0]
      if (!calls.some((call) => SKIP_CALLS.has(call))) {
        numbers.push({ start: i, end: i + word.length, value: parseFloat(word) })
      }
      i += word.length
    } else {
      i++
    }
  }
  return numbers
}

export default class Mutator {

  constructor(main) {
    this.main = main
    this.initial = null // original values, so repeated changes don't drift to 0
    this.lastIndex = null
  }

  // reroll: change the same number again instead of picking a new one
  mutate(reroll = false) {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) return
    const block = this.main.getCurrentParagraphIncludingComments(editor)
    const range = editor.getBuffer().clipRange([[block.start.row, 0], [block.end.row, 0]])
    const text = editor.getTextInBufferRange(range)
    const numbers = findNumbers(text)
    if (!numbers.length) return this.main.log('random change: no numbers in this block', 'text-warning')

    // a different block (or numbers added/removed) starts a fresh baseline
    const key = editor.id + ':' + block.start.row + ':' + numbers.length
    if (this.key !== key) {
      this.key = key
      this.initial = numbers.map((n) => n.value)
      this.lastIndex = null
    }
    const index = reroll && this.lastIndex !== null ? this.lastIndex : Math.floor(Math.random() * numbers.length)
    this.lastIndex = index

    const number = numbers[index]
    const base = this.initial[index] || 0.5
    const value = String(Math.round(Math.random() * base * 2 * 1000) / 1000)

    const offset = editor.getBuffer().characterIndexForPosition(range.start)
    const buffer = editor.getBuffer()
    const target = [buffer.positionForCharacterIndex(offset + number.start), buffer.positionForCharacterIndex(offset + number.end)]
    editor.setTextInBufferRange(target, value)

    if (this.main.evalBlock()) this.main.log(`random change: ${text.slice(number.start, number.end)} -> ${value}`, 'text-info')
  }
}
