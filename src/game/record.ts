// A run kept as frames of a sample the app defines, one per interval of model time, with a
// playhead that scrubs back over them; and a seeded generator so a run replays bit for bit
// (a run is its seed plus its input schedule).

export class Recorder<S> {
  frames: S[] = [];
  times: number[] = [];

  /** `lerp`, when given, interpolates between frames when scrubbing; otherwise the frame at or before is shown. */
  constructor(readonly interval: number, private lerp?: (a: S, b: S, w: number) => S) {}

  /** Call after every advance: keeps a frame each time `t` reaches the next multiple of the interval. */
  capture(t: number, sample: () => S): void {
    while (this.frames.length * this.interval <= t + 1e-9) {
      this.times.push(this.frames.length * this.interval);
      this.frames.push(sample());
    }
  }

  get duration(): number { return this.times.length ? this.times[this.times.length - 1] : 0; }

  /** Number of frames recorded at or before `t`. */
  framesUpTo(t: number): number { return Math.min(this.frames.length, Math.max(0, Math.floor(t / this.interval + 1e-9) + 1)); }

  at(t: number): S {
    const n = this.frames.length;
    if (n === 0) throw new Error('Recorder.at: nothing recorded');
    const u = Math.min(Math.max(t / this.interval, 0), n - 1), i = Math.floor(u + 1e-9);
    if (i >= n - 1 || !this.lerp) return this.frames[Math.min(i, n - 1)];
    return this.lerp(this.frames[i], this.frames[i + 1], u - i);
  }
}

/** mulberry32: a small, fast seeded generator in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
