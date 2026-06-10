export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private track: GainNode | null = null;
  private whoosh: GainNode | null = null;
  private started = false;

  async start() {
    if (this.started) return;
    this.context = new AudioContext();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.context.destination);

    this.createNoiseLayer(0.03, 600);
    this.track = this.createNoiseLayer(0.02, 1200);
    this.whoosh = this.createNoiseLayer(0.0, 300);

    this.started = true;
  }

  setVolume(value: number) {
    if (this.master) this.master.gain.value = value;
  }

  update(trackIntensity: number, whooshIntensity: number) {
    if (!this.started || !this.track || !this.whoosh) return;
    this.track.gain.value = 0.02 + trackIntensity * 0.08;
    this.whoosh.gain.value = whooshIntensity * 0.12;
  }

  private createNoiseLayer(baseGain: number, lowpass: number) {
    if (!this.context || !this.master) {
      throw new Error("Audio context not started");
    }
    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;

    const gain = this.context.createGain();
    gain.gain.value = baseGain;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    return gain;
  }

  isStarted() {
    return this.started;
  }
}
