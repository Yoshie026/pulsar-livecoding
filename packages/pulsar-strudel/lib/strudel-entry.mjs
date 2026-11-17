// Bundled by `npm run build` into lib/strudel.bundle.js (global `strudel`):
// the stock @strudel/web setup plus MIDI, sharing one copy of @strudel/core
// so .midi() lands on the same Pattern class the REPL evaluates.
export * from '@strudel/web/web.mjs';
export * from '@strudel/midi';
