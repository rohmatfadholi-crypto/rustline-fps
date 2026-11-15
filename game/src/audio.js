// Procedural sound: every effect is synthesised with WebAudio, no audio files
// and no network. The context starts on the first user gesture (a browser
// rule); before that every call is a no-op. One shared noise buffer feeds
// the percussive sounds; tones are plain oscillators.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(when, duration, filterType, frequency, gainValue) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }

  function tone(when, duration, type, from, to, gainValue) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  function now() {
    return context.currentTime;
  }

  const api = {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot(kind) {
      if (!ensure() || muted) return;
      const t = now();
      if (kind === 'shotgun') {
        noise(t, 0.28, 'lowpass', 900, 0.9);
        tone(t, 0.16, 'sine', 140, 45, 0.7);
      } else if (kind === 'dmr') {
        noise(t, 0.32, 'bandpass', 1400, 0.9);
        tone(t, 0.2, 'sine', 120, 40, 0.8);
      } else if (kind === 'smg') {
        noise(t, 0.09, 'bandpass', 2400, 0.55);
        tone(t, 0.07, 'sine', 190, 70, 0.4);
      } else if (kind === 'pistol') {
        noise(t, 0.12, 'bandpass', 1800, 0.6);
        tone(t, 0.08, 'sine', 170, 60, 0.45);
      } else {
        noise(t, 0.14, 'bandpass', 2000, 0.7);
        tone(t, 0.1, 'sine', 160, 55, 0.55);
      }
    },
    dryFire() {
      if (!ensure() || muted) return;
      tone(now(), 0.05, 'square', 1200, 900, 0.12);
    },
    reload() {
      if (!ensure() || muted) return;
      const t = now();
      tone(t, 0.04, 'square', 700, 500, 0.15);
      tone(t + 0.28, 0.04, 'square', 900, 650, 0.15);
      tone(t + 0.55, 0.05, 'square', 1100, 800, 0.18);
    },
    hit(head) {
      if (!ensure() || muted) return;
      tone(now(), 0.06, 'square', head ? 1500 : 1100, 900, 0.2);
    },
    kill() {
      if (!ensure() || muted) return;
      const t = now();
      tone(t, 0.09, 'sine', 660, 660, 0.25);
      tone(t + 0.09, 0.14, 'sine', 990, 990, 0.25);
    },
    hurt() {
      if (!ensure() || muted) return;
      tone(now(), 0.18, 'sine', 110, 45, 0.5);
    },
    step() {
      if (!ensure() || muted) return;
      noise(now(), 0.05, 'lowpass', 420, 0.1);
    },
    bounce() {
      if (!ensure() || muted) return;
      tone(now(), 0.05, 'square', 320, 240, 0.12);
    },
    beep() {
      if (!ensure() || muted) return;
      tone(now(), 0.09, 'sine', 1250, 1250, 0.2);
    },
    plant() {
      if (!ensure() || muted) return;
      const t = now();
      for (let i = 0; i < 4; i += 1) tone(t + i * 0.16, 0.07, 'sine', 950, 950, 0.2);
    },
    explosion() {
      if (!ensure() || muted) return;
      const t = now();
      noise(t, 1.4, 'lowpass', 500, 1.0);
      tone(t, 1.1, 'sine', 90, 28, 0.9);
    },
    roundWin() {
      if (!ensure() || muted) return;
      const t = now();
      tone(t, 0.14, 'sine', 523, 523, 0.25);
      tone(t + 0.13, 0.14, 'sine', 659, 659, 0.25);
      tone(t + 0.26, 0.24, 'sine', 784, 784, 0.28);
    },
    roundLose() {
      if (!ensure() || muted) return;
      const t = now();
      tone(t, 0.18, 'sine', 392, 392, 0.25);
      tone(t + 0.17, 0.3, 'sine', 311, 311, 0.25);
    },
  };
  return api;
}
