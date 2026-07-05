/**
 * Sound synthesis engine using the Web Audio API.
 * This synthesizes:
 * - Engine hum & track clank-clack (proportional to speed)
 * - Brake squeal (high-pitched resonance when braking at speed)
 * - Train horn (multi-frequency dual-tone majestic horn)
 * - Station success chime (melodic beep sequence)
 * - Error/Emergency buzz (low harsh warning beep)
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Horn nodes
  private hornOscs: OscillatorNode[] = [];
  private hornGain: GainNode | null = null;

  // Track rumble
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private clickTimer: any = null;
  private lastSpeed: number = 0;

  // Brake squeal
  private brakeOsc: OscillatorNode | null = null;
  private brakeGain: GainNode | null = null;

  // Wind noise nodes
  private windNode: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  // Traction motor nodes
  private tractionOsc: OscillatorNode | null = null;
  private tractionGain: GainNode | null = null;

  constructor() {
    // Audio context is created lazily on first user interaction
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.15, this.ctx.currentTime); // Low master volume
      this.masterGain.connect(this.ctx.destination);

      // Setup continuous rumble
      this.setupRumble();

      // Setup continuous traction motor whine
      this.setupTractionMotor();

      // Setup wind noise
      this.setupWindNoise();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private setupRumble() {
    if (!this.ctx || !this.masterGain) return;

    // Create a low frequency engine rumble osc
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(30, this.ctx.currentTime); // very low rumble

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(80, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime); // Start silent

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();

    this.rumbleOsc = osc;
    this.rumbleGain = gain;

    // Start periodic "clack-clack" wheel click sound loop
    this.runTrackClickLoop();
  }

  private runTrackClickLoop() {
    const tick = () => {
      if (!this.ctx || this.lastSpeed < 0.2) {
        this.clickTimer = setTimeout(tick, 1000);
        return;
      }

      // Play a double "clack-clack"
      this.playSingleClick(0.04);
      setTimeout(() => {
        this.playSingleClick(0.03);
      }, 120);

      // The delay decreases as speed increases
      // At max speed (15 m/s), click every 400ms. At low speed (2 m/s), click every 2000ms.
      const interval = Math.max(300, Math.min(3000, 6000 / (this.lastSpeed + 1)));
      this.clickTimer = setTimeout(tick, interval);
    };

    tick();
  }

  private playSingleClick(vol: number) {
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, this.ctx.currentTime);

    // Speed up or slow down speed click volume
    const actualVol = vol * Math.min(1.2, this.lastSpeed / 6);
    gain.gain.setValueAtTime(actualVol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  private setupWindNoise() {
    if (!this.ctx || !this.masterGain) return;

    try {
      // Create a 2-second buffer of white noise
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, this.ctx.currentTime);
      filter.Q.setValueAtTime(1, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, this.ctx.currentTime); // Start silent

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      source.start();

      this.windNode = source;
      this.windFilter = filter;
      this.windGain = gain;
    } catch (e) {
      console.warn("Failed to set up wind noise", e);
    }
  }

  private setupTractionMotor() {
    if (!this.ctx || !this.masterGain) return;

    try {
      // Create a beautiful modern electric AC traction motor sound (sine + gentle triangle)
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle'; // triangle gives that nice gentle hum/buzz
      osc.frequency.setValueAtTime(90, this.ctx.currentTime); // start base frequency

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, this.ctx.currentTime); // smooth out high frequencies

      gain.gain.setValueAtTime(0, this.ctx.currentTime); // start silent

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();

      this.tractionOsc = osc;
      this.tractionGain = gain;
    } catch (e) {
      console.warn("Failed to set up traction motor synthesizer", e);
    }
  }

  updateEngineSound(speed: number, isAccelerating: boolean) {
    this.lastSpeed = speed;
    this.init();
    if (!this.ctx) return;

    this.resume();

    // Update continuous engine rumble
    if (this.rumbleOsc && this.rumbleGain) {
      if (speed < 0.1) {
        // Idle
        this.rumbleOsc.frequency.setTargetAtTime(25, this.ctx.currentTime, 0.2);
        this.rumbleGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.2);
      } else {
        // Moving: speed scales the hum
        const targetFreq = 25 + speed * 3.5 + (isAccelerating ? 15 : 0);
        const targetVol = 0.2 + (speed / 15) * 0.5 + (isAccelerating ? 0.3 : 0);
        
        this.rumbleOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.25);
        this.rumbleGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.25);
      }
    }

    // Update continuous traction motor (electric AC whine/inverter hum)
    if (this.tractionOsc && this.tractionGain) {
      if (speed < 0.1) {
        if (isAccelerating) {
          // Pre-movement electric hum on starting the train!
          this.tractionOsc.frequency.setTargetAtTime(160, this.ctx.currentTime, 0.15);
          this.tractionGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.15);
        } else {
          // Stationary silent or minimal idle hum
          this.tractionOsc.frequency.setTargetAtTime(80, this.ctx.currentTime, 0.3);
          this.tractionGain.gain.setTargetAtTime(0.01, this.ctx.currentTime, 0.3);
        }
      } else {
        // Variable Frequency AC Drive Simulation (Iconic train sound!)
        // Segment 1 (Low speed gear-like sweep)
        let targetFreq = 120;
        let targetVol = 0.05;

        if (speed < 6) {
          // 120Hz to 520Hz sweep
          targetFreq = 120 + (speed / 6) * 400;
          targetVol = isAccelerating ? (0.12 + (speed / 6) * 0.15) : 0.03;
        } else if (speed < 14) {
          // Inverter shift down, then sweep back up: 260Hz to 680Hz
          const progress = (speed - 6) / 8;
          targetFreq = 260 + progress * 420;
          targetVol = isAccelerating ? (0.18 + progress * 0.1) : 0.04;
        } else {
          // Final super high pitch cruise whine: 580Hz to 850Hz
          const progress = Math.min(1, (speed - 14) / 8);
          targetFreq = 580 + progress * 270;
          targetVol = isAccelerating ? (0.22 + progress * 0.05) : 0.05;
        }

        this.tractionOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.18);
        this.tractionGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.18);
      }
    }

    // Update continuous aerodynamic wind noise
    if (this.windGain && this.windFilter) {
      const targetVol = Math.min(0.12, (speed / 22) * 0.12);
      const targetFreq = 150 + (speed / 22) * 350; // 150Hz to 500Hz
      
      this.windGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.3);
      this.windFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.3);
    }
  }

  startHorn() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    if (this.hornOscs.length > 0) return; // Already playing

    // Dual chime majestic train horn (e.g., 311Hz and 370Hz / 440Hz)
    const frequencies = [311, 370, 470]; // Classic diesel chords
    const hornGain = this.ctx.createGain();
    hornGain.gain.setValueAtTime(0, this.ctx.currentTime);
    hornGain.gain.linearRampToValueAtTime(0.4, this.ctx.currentTime + 0.1);
    hornGain.connect(this.masterGain);
    this.hornGain = hornGain;

    this.hornOscs = frequencies.map(freq => {
      const osc = this.ctx!.createOscillator();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, this.ctx!.currentTime); // smooth out the saw

      osc.connect(filter);
      filter.connect(hornGain);
      osc.start();
      return osc;
    });
  }

  stopHorn() {
    if (!this.ctx || this.hornOscs.length === 0 || !this.hornGain) return;

    const fadeTime = 0.15;
    const stopTime = this.ctx.currentTime + fadeTime;
    
    this.hornGain.gain.setValueAtTime(this.hornGain.gain.value, this.ctx.currentTime);
    this.hornGain.gain.exponentialRampToValueAtTime(0.001, stopTime);

    const oldOscs = this.hornOscs;
    this.hornOscs = [];

    setTimeout(() => {
      oldOscs.forEach(osc => {
        try {
          osc.stop();
        } catch (e) {}
      });
    }, fadeTime * 1000 + 50);
  }

  startBrakeSqueal(speed: number) {
    if (!this.ctx || !this.masterGain) return;
    this.resume();

    // Only play above certain speeds
    if (speed < 1.5) {
      this.stopBrakeSqueal();
      return;
    }

    if (this.brakeOsc) {
      // Already running, just adjust pitch/volume based on speed
      const targetFreq = 2000 + speed * 150;
      const targetVol = Math.min(0.2, (speed - 1) / 10);
      this.brakeOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      this.brakeGain?.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000 + speed * 150, this.ctx.currentTime);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, this.ctx.currentTime);
    filter.Q.setValueAtTime(3, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(Math.min(0.2, (speed - 1) / 10), this.ctx.currentTime + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();

    this.brakeOsc = osc;
    this.brakeGain = gain;
  }

  stopBrakeSqueal() {
    if (!this.ctx || !this.brakeOsc || !this.brakeGain) return;

    const gain = this.brakeGain;
    const osc = this.brakeOsc;

    this.brakeOsc = null;
    this.brakeGain = null;

    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    setTimeout(() => {
      try {
        osc.stop();
      } catch (e) {}
    }, 200);
  }

  playSuccessChime() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    const playTone = (freq: number, delay: number, dur: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + delay);

      gain.gain.setValueAtTime(0, this.ctx!.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.2, this.ctx!.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + delay + dur);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(this.ctx!.currentTime + delay);
      osc.stop(this.ctx!.currentTime + delay + dur + 0.05);
    };

    // Upbeat major triad arpeggio
    playTone(523.25, 0, 0.2);     // C5
    playTone(659.25, 0.1, 0.2);   // E5
    playTone(783.99, 0.2, 0.2);   // G5
    playTone(1046.50, 0.3, 0.4);  // C6
  }

  playDoorChime() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    const playTone = (freq: number, delay: number, dur: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + delay);

      gain.gain.setValueAtTime(0, this.ctx!.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.18, this.ctx!.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + delay + dur);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(this.ctx!.currentTime + delay);
      osc.stop(this.ctx!.currentTime + delay + dur + 0.05);
    };

    // Elegant dual bell beep-beep door chime
    playTone(987.77, 0, 0.15);     // B5
    playTone(987.77, 0.22, 0.15);  // B5
    playTone(987.77, 0.44, 0.15);  // B5
  }

  playEmergencyHiss() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    try {
      const bufferSize = this.ctx.sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 1.2);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.4);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      source.start();
      source.stop(this.ctx.currentTime + 1.5);
    } catch (e) {
      console.warn("Failed to play emergency hiss", e);
    }
  }

  playErrorBuzz() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(130, this.ctx.currentTime); // Low detuned buzz
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(135, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start();
    osc2.start();

    osc1.stop(this.ctx.currentTime + 0.45);
    osc2.stop(this.ctx.currentTime + 0.45);
  }

  playScoreUp() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain || this.ctx.state === 'suspended') return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  cleanup() {
    if (this.clickTimer) clearTimeout(this.clickTimer);
    try {
      this.stopHorn();
      this.stopBrakeSqueal();
      if (this.tractionOsc) {
        try {
          this.tractionOsc.stop();
        } catch (e) {}
      }
      if (this.windNode) {
        try {
          this.windNode.stop();
        } catch (e) {}
      }
      if (this.ctx) {
        this.ctx.close();
      }
    } catch (e) {}
  }
}

export const audio = new AudioEngine();
