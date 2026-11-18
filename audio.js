'use strict';

const CesiumAudio = (() => {
  let context;
  let ambient;
  let settings;
  const voices = {
    generate: [523, 784], pickup: [255], move: [349, 440], merge: [392, 523, 659],
    discovery: [523, 659, 784, 1047], store: [440, 330], retrieve: [330, 494],
    delete: [222, 166], invalid: [185, 164], collection: [392, 587], ui: [380],
    achievement: [440, 554, 659], complete: [392, 523, 659, 784, 1047]
  };

  function unlock() {
    if (!settings?.sound || document.hidden) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    try {
      if (!context && AudioContext) context = new AudioContext();
      if (context?.state === 'suspended') context.resume().catch(() => {});
    } catch {
      return;
    }
    syncAmbience();
  }

  function syncAmbience() {
    if (!context) return;
    const enabled = settings.sound && settings.ambience && !document.hidden;
    if (enabled && !ambient) {
      const gain = context.createGain();
      const oscillators = [65.406, 98, 130.81].map(frequency => {
        const oscillator = context.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });
      gain.gain.value = 0;
      gain.connect(context.destination);
      ambient = { gain, oscillators };
    }
    if (enabled) {
      ambient.gain.gain.setTargetAtTime(settings.ambientVolume * 0.024, context.currentTime, 0.24);
    } else if (ambient) {
      const stop = context.currentTime + 0.3;
      ambient.gain.gain.setTargetAtTime(0, context.currentTime, 0.055);
      ambient.oscillators.forEach(oscillator => oscillator.stop(stop));
      const { gain } = ambient;
      ambient.oscillators[0].onended = () => gain.disconnect();
      ambient = null;
    }
  }

  let previousSound = -Infinity;
  function play(event, number = 0) {
    if (!context || !settings.sound || !settings.soundEffects || !settings.volume || document.hidden) return;
    const now = context.currentTime;
    if (now - previousSound < 0.042 && ['ui', 'pickup'].includes(event)) return;
    previousSound = now;
    const notes = voices[event] || voices.ui;
    const glass = ['generate', 'discovery', 'complete', 'merge', 'achievement'].includes(event);
    const pitch = 1 + (Math.random() - 0.5) * 0.018 + (event === 'merge' ? (number % 12) * 0.013 : 0);
    notes.forEach((note, index) => {
      const start = now + index * (glass ? 0.055 : 0.027);
      const length = glass ? 0.44 : 0.17;
      const volume = settings.volume * (glass ? 0.09 : 0.045) / Math.sqrt(notes.length);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.00015, volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = glass || index !== 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = note * pitch;
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
      oscillator.onended = () => gain.disconnect();
    });
  }

  function configure(value) {
    settings = value;
    syncAmbience();
  }

  document.addEventListener('visibilitychange', syncAmbience);
  return { unlock, configure, play };
})();
