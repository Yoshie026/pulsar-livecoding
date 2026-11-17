# pulsar-livecoding

My live-coding setup for [Pulsar](https://pulsar-edit.dev): hydra visuals, Strudel patterns,
three.js 3D text, Syphon and OSC bridges, all driven from the editor.

| folder | what |
| --- | --- |
| `packages/pulsar-hydra` | hydra in Pulsar: camera, Syphon input, OSC send/receive, a.fft input picker, random mutator, three.js 3D text (`three.text(...)`). Forked from [atom-hydra](https://github.com/hydra-synth/atom-hydra) (MIT). |
| `packages/pulsar-strudel` | live code [Strudel](https://strudel.cc) patterns from Pulsar (AGPL-3.0, like Strudel). |
| `packages/launcher` | status-bar buttons to start/stop helper processes (syphon bridge, osc bridge, flok). |
| `bridge` | node processes: `syphon-bridge.js` (Syphon -> websocket for hydra) and `server.js` (OSC). Based on [hydra-osc](https://github.com/ojack/hydra-osc). |
| `config` | files that live in `~/.pulsar`: `hydra-init.js` (runs on hydra start), `launcher.json` (launcher processes). |

## Install

Needs Pulsar, node and git (macOS; Syphon is macOS only).

```sh
git clone https://github.com/Yoshie026/pulsar-livecoding.git ~/Developments/pulsar-livecoding
~/Developments/pulsar-livecoding/install.sh
```

`install.sh` runs `npm install` everywhere, builds the Strudel bundle, and symlinks the packages
into `~/.pulsar/packages` and the config files into `~/.pulsar` (old files are kept as `*.bak`).
Because everything is a symlink, editing in Pulsar edits the repo: just commit and push.

`config/launcher.json` points at `~/Developments/pulsar-livecoding/bridge`; change the `cwd`
paths if you clone somewhere else.

## Use

- hydra: Packages > Livecoding > Hydra, then `ctrl-enter` to run a block. See `packages/pulsar-hydra/examples`.
- 3D text: `packages/pulsar-hydra/examples/04-three-text.js`.
- Strudel: see `packages/pulsar-strudel/examples`.
