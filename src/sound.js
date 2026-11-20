export function createSound() {
  let context;
  let volume;
  let lastKey = -Infinity;
  let muted = false;

  function unlock() {
    if (muted || !window.AudioContext) return;
    if (!context) {
      context = new AudioContext();
      volume = context.createGain();
      volume.connect(context.destination);
    }
    if (context.state === "suspended") context.resume().catch(() => {});
  }

  function tone(time, start, end, length, gain, type) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, time);
    oscillator.frequency.exponentialRampToValueAtTime(end, time + length);
    envelope.gain.setValueAtTime(.001, time);
    envelope.gain.linearRampToValueAtTime(gain, time + .006);
    envelope.gain.exponentialRampToValueAtTime(.001, time + length);
    oscillator.connect(envelope).connect(volume);
    oscillator.start(time);
    oscillator.stop(time + length);
  }

  return {
    unlock,
    mute(next) {
      muted = next;
      if (volume) volume.gain.value = muted ? 0 : 1;
      unlock();
    },
    play(name) {
      if (muted || !context) return;
      const now = context.currentTime;
      if (name === "caught") {
        tone(now, 392, 294, .14, .082, "triangle");
        tone(now + .14, 262, 148, .32, .10, "triangle");
      } else if (name === "wrong") {
        tone(now, 170, 106, .115, .075, "sawtooth");
      } else if (now - lastKey >= .032) {
        lastKey = now;
        tone(now, 790, 465, .053, .074, "triangle");
      }
    },
  };
}
