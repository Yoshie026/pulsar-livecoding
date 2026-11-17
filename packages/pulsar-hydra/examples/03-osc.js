// OSC
//   receive: anything sending to 127.0.0.1:57101
//   send:    goes to 127.0.0.1:8000 (msg.setSendTarget(host, port) to change)

// --- receive: drive parameters from outside (TouchDesigner, Max, UE5...)
amt = 0.2
freq = 10
msg.on('/hydra/amt', ([v]) => amt = v)
msg.on('/hydra/freq', ([v]) => freq = v)

osc(() => freq, 0.1, 1).modulate(noise(3), () => amt).out()

// log everything that arrives (open View > Developer > Toggle Developer Tools)
msg.on('*', (m) => console.log(m.address, m.args))

// --- send
send('/hydra/hello', 'hi')
send('/hydra/xy', [0.25, 0.75])

// stream an LFO out at 20Hz — stop it with the clearInterval line below
sender = setInterval(() => send('/hydra/lfo', Math.sin(time) * 0.5 + 0.5), 50)
clearInterval(sender)
