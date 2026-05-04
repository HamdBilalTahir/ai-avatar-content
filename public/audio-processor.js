class PitchShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pitchRatio = 1.0;

    this.port.onmessage = (event) => {
      if (event.data.pitchRatio !== undefined) {
        this.pitchRatio = event.data.pitchRatio;
      }
    };

    // Granular synthesis parameters
    // Reduce buffer size to minimize delay/echo artifacts
    // 2048 samples at 44.1kHz is ~46ms, which provides a tight enough window
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;

    // We use two grains for overlap-add
    this.grain1ReadPos = 0;
    this.grain2ReadPos = this.bufferSize / 2;
    this.grainSize = this.bufferSize / 2;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    for (let i = 0; i < inputChannel.length; i++) {
      // Write to circular buffer
      this.buffer[this.writePos] = inputChannel[i];

      // Calculate grain windows (Hanning-like triangle for simplicity, or real Hanning)
      let phase1 = (this.grain1ReadPos % this.grainSize) / this.grainSize;
      let phase2 = (this.grain2ReadPos % this.grainSize) / this.grainSize;

      // Hanning window: 0.5 * (1 - cos(2 * PI * phase))
      let window1 = 0.5 * (1 - Math.cos(2 * Math.PI * phase1));
      let window2 = 0.5 * (1 - Math.cos(2 * Math.PI * phase2));

      // Read from buffer
      let out1 =
        this.buffer[Math.floor(this.grain1ReadPos) % this.bufferSize] * window1;
      let out2 =
        this.buffer[Math.floor(this.grain2ReadPos) % this.bufferSize] * window2;

      outputChannel[i] = out1 + out2;

      // Advance read pointers
      this.grain1ReadPos += this.pitchRatio;
      this.grain2ReadPos += this.pitchRatio;

      // Wrap read pointers and keep them within the written past
      if (this.grain1ReadPos >= this.bufferSize)
        this.grain1ReadPos -= this.bufferSize;
      if (this.grain2ReadPos >= this.bufferSize)
        this.grain2ReadPos -= this.bufferSize;

      this.writePos = (this.writePos + 1) % this.bufferSize;
    }

    // Copy to other channels if stereo
    for (let c = 1; c < output.length; c++) {
      output[c].set(output[0]);
    }

    return true;
  }
}

registerProcessor('pitch-shift-processor', PitchShiftProcessor);
