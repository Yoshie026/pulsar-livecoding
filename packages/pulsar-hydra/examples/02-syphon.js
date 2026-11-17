// SYPHON — frames from UE5 / TouchDesigner / OBS
// turn it on: Packages > Livecoding > Hydra > Toggle Syphon
// source name: Settings > Packages > pulsar-hydra > Syphon source (default "UE5")

syphon(s1)

src(s1).out()

// mix syphon with the camera
s0.initCam()
src(s1).blend(src(s0).saturate(0), () => 0.5 + 0.5 * Math.sin(time)).out()

// use the syphon image to displace a pattern
osc(20, 0.05, 1.2).modulate(src(s1), 0.3).out()
