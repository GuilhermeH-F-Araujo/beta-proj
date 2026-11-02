"""Original deterministic electronic score + mechanical sound design. No samples."""
import numpy as np
import wave, json
from pathlib import Path
SR=44100
D=60
rng=np.random.default_rng(3042)
audio=np.zeros((SR*D,2),np.float64)
def add(at,signal,level=1,pan=0):
    start=int(at*SR)
    if start<0:return
    end=min(len(audio),start+len(signal))
    if end<=start:return
    audio[start:end,0]+=signal[:end-start]*level*np.sqrt((1-pan)/2)
    audio[start:end,1]+=signal[:end-start]*level*np.sqrt((1+pan)/2)
def tone(freq,length,decay=4):
    t=np.arange(int(length*SR))/SR
    return (np.sin(2*np.pi*freq*t)+.22*np.sin(2*np.pi*freq*2*t))*np.exp(-decay*t)*np.minimum(t*100,1)
def impact(at,weight=1):
    t=np.arange(int(.75*SR))/SR
    s=np.sin(2*np.pi*(85*t+9*(1-np.exp(-18*t))))*np.exp(-9*t)
    s+=rng.normal(0,.16,len(t))*np.exp(-32*t)
    s+=.12*np.sin(2*np.pi*1783*t)*np.exp(-16*t)
    add(at,s,.42*weight)
def whoosh(at,length=.55,pan=0):
    t=np.arange(int(length*SR))/SR
    noise=rng.normal(0,1,len(t))
    noise=np.convolve(noise,np.ones(9)/9,mode='same')
    add(at,noise*np.sin(np.pi*t/length)**2,.28,pan)
beat=60/118
for n in range(112):
    at=n*beat
    if at>=56:break
    energy=.35 if at<6 else .6 if at<13 else .4 if at<21 else .62 if at<43 else .9
    t=np.arange(int(.35*SR))/SR
    kick=np.sin(2*np.pi*(48*t+4*(1-np.exp(-32*t))))*np.exp(-17*t)
    add(at,kick,.36*energy)
    if n%2:
        sn=rng.normal(0,.4,len(t))*np.exp(-25*t)+.12*np.sin(2*np.pi*185*t)*np.exp(-19*t)
        add(at,sn,.22*energy,.12)
    for sub in range(2):
        h=rng.normal(0,.16,int(.07*SR)); h[1:]-=.85*h[:-1]
        add(at+sub*beat/2,h*np.exp(-np.arange(len(h))/SR*60),.24*energy,(-.4 if sub else .4))
    bass=[55,55,65.406,49][(n//8)%4]
    add(at,tone(bass,.42,6),.19*energy)
    if at>=6:
        note=[220,329.628,440,261.626,392,293.665,329.628,196][n%8]
        add(at+beat/2,tone(note,.8,5),.085*energy,np.sin(n)*.4)
        add(at+beat/2+.18,tone(note,.8,5),.025*energy,-np.sin(n)*.4)
for at in [6,13,21,30,43,53]:
    for f in [110,164.814,220,261.626]:add(at,tone(f,3.5,1.5),.035)
for at in [.73,.94,2.4,4.2,6,7.5,9.5,13,15.2,18.1,21,23.2,25.1,30,34.333,38.667,43,44.1,45.2,46.4,48.2,50.6,53.4,54.1]:impact(at,.6 if at<6 else .85)
for i,at in enumerate([1.4,5.6,12.6,19.7,22.5,29.6,33.95,38.3,42.65,47.8,51.7,52.8]):whoosh(at,pan=(-.3 if i%2 else .3))
for at,f in [(54.1,220),(54.2,329.628),(54.3,440)]:add(at,tone(f,4.5,1.1),.13)
fade=np.minimum(np.arange(len(audio))/SR/.15,1)*np.minimum((D-np.arange(len(audio))/SR)/1.8,1)
audio*=fade[:,None]
peak=float(np.max(np.abs(audio)))
audio*=.89/max(peak,.89)
out=Path(__file__).resolve().parents[1]/'public'/'soundtrack.wav'
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((audio*32767).astype('<i2').tobytes())
print(json.dumps({'file':str(out),'duration':D,'sampleRate':SR,'peak':float(np.max(np.abs(audio))),'rms':float(np.sqrt(np.mean(audio**2)))}))
