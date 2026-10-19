// Procedural ambient space audio — pure WebAudio synthesis (no assets).
// Deep drone + shimmering pad + slow-filtered noise.

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private started = false;
  private muted = false;
  private nodes: AudioNode[] = [];

  start() {
    if (this.started) return;
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.master = master;

      // --- deep drone: two detuned oscillators ---
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.32;
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.value = 220;
      droneFilter.Q.value = 0.8;
      droneGain.connect(droneFilter).connect(master);

      const mkOsc = (freq: number, type: OscillatorType, g: number) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(droneGain);
        o.start();
        this.nodes.push(o, og);
        return o;
      };
      mkOsc(41.2, "sine", 0.55);
      mkOsc(55, "triangle", 0.3);
      const shimmer = mkOsc(824.3, "sine", 0.012);

      // slow LFO on shimmer
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain);
      const shimGainNode = (this.nodes[this.nodes.length - 1] as GainNode);
      lfoGain.connect(shimGainNode.gain);
      lfo.start();
      this.nodes.push(lfo, lfoGain);
      void shimmer;

      // --- pink-ish noise through wandering bandpass ---
      const bufferSize = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099;
        b1 = 0.963 * b1 + white * 0.2965;
        b2 = 0.57 * b2 + white * 1.0526;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 320;
      bp.Q.value = 0.6;
      const ng = ctx.createGain();
      ng.gain.value = 0.14;
      noise.connect(bp).connect(ng).connect(master);
      noise.start();

      // bandpass wander
      const bpLfo = ctx.createOscillator();
      bpLfo.frequency.value = 0.045;
      const bpLfoGain = ctx.createGain();
      bpLfoGain.gain.value = 180;
      bpLfo.connect(bpLfoGain).connect(bp.frequency);
      bpLfo.start();

      this.nodes.push(noise, bp, ng, bpLfo, bpLfoGain, droneGain, droneFilter);

      // gentle fade-in
      master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.16, ctx.currentTime + 4);
      this.started = true;
    } catch {
      // audio unsupported — fail silent
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.16, this.ctx.currentTime + 0.4);
    }
  }

  dispose() {
    try { this.ctx?.close(); } catch { /* noop */ }
    this.ctx = null; this.master = null; this.started = false; this.nodes = [];
  }
}
