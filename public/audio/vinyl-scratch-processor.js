class VinylScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.sourceSampleRate = sampleRate;
    this.position = 0;
    this.rate = 0;
    this.targetRate = 0;
    this.rateSmoothing = 1 - Math.exp(-1 / (sampleRate * 0.055));
    this.active = false;
    this.framesUntilPositionUpdate = 0;

    this.port.onmessage = ({ data }) => {
      if (data.type === "load") {
        this.channels = data.channels;
        this.sourceSampleRate = data.sampleRate;
        return;
      }

      if (data.type === "start") {
        this.position = data.positionSeconds * this.sourceSampleRate;
        this.rate = 0;
        this.targetRate = 0;
        this.active = true;
        return;
      }

      if (data.type === "rate") {
        this.targetRate = data.rate;
        return;
      }

      if (data.type === "stop") {
        this.active = false;
        this.rate = 0;
        this.targetRate = 0;
        this.reportPosition();
      }
    };
  }

  reportPosition() {
    this.port.postMessage({
      type: "position",
      positionSeconds: this.position / this.sourceSampleRate,
    });
  }

  readSample(channel, position) {
    const data = this.channels[channel] ?? this.channels[0];
    if (!data?.length) return 0;

    const index = Math.floor(position);
    const fraction = position - index;
    const first = data[Math.max(0, Math.min(data.length - 1, index))];
    const second = data[Math.max(0, Math.min(data.length - 1, index + 1))];
    return first + (second - first) * fraction;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!this.active || !output?.length || !this.channels.length) return true;

    const frameCount = output[0].length;
    const sourceLength = this.channels[0].length;
    const sampleStep = this.sourceSampleRate / sampleRate;

    for (let frame = 0; frame < frameCount; frame += 1) {
      // A real platter cannot reverse instantly. Moving through zero produces
      // the same speed-dependent pitch drop as the pause/resume transport,
      // then applies it to the source samples in the opposite direction.
      this.rate +=
        (this.targetRate - this.rate) * this.rateSmoothing;
      if (Math.abs(this.rate) < 0.0001 && this.targetRate === 0) {
        this.rate = 0;
      }

      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = this.readSample(channel, this.position);
      }

      this.position += this.rate * sampleStep;
      if (this.position <= 0) {
        this.position = 0;
        this.rate = 0;
      } else if (this.position >= sourceLength - 1) {
        this.position = sourceLength - 1;
        this.rate = 0;
      }
    }

    this.framesUntilPositionUpdate -= frameCount;
    if (this.framesUntilPositionUpdate <= 0) {
      this.framesUntilPositionUpdate = Math.floor(sampleRate / 30);
      this.reportPosition();
    }

    return true;
  }
}

registerProcessor("vinyl-scratch-processor", VinylScratchProcessor);
