import { AUDIO_MANIFEST, SOUND_IDS, type SoundId } from "./manifest.ts";

export type AudioState = "inactive" | "active" | "unsupported";
/** buffer = Web Audio sample, element = HTMLAudio fallback, synth = oscillator beep, missing = not loaded */
export type AssetState = "unloaded" | "buffer" | "element" | "missing";

export interface AudioSnapshot {
  state: AudioState;
  volume: number;
  muted: boolean;
  assets: Record<SoundId, AssetState>;
  playing: SoundId | null;
  /** Count of plays that could not make sound (context not running, decode/play error). */
  failures: number;
  lastError: string | null;
}

export interface SoundPlayer {
  play(id: SoundId): Promise<void>;
  stop(): void;
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Sequential, non-overlapping sound player.
 * Must be activated from a user gesture (iOS Safari requirement).
 * Missing/undecodable assets never throw: they fall back to HTMLAudio, then to a short oscillator tone.
 */
export class AudioEngine implements SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Partial<Record<SoundId, AudioBuffer>> = {};
  private elements: Partial<Record<SoundId, HTMLAudioElement>> = {};
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private stopCurrent: (() => void) | null = null;
  private snapshot: AudioSnapshot = {
    state: "inactive",
    volume: 0.8,
    muted: false,
    assets: { processing: "unloaded", cash_dispense: "unloaded", gift_processing: "unloaded", premium_dispense: "unloaded", success: "unloaded" },
    playing: null,
    failures: 0,
    lastError: null,
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): AudioSnapshot => this.snapshot;

  private set(patch: Partial<AudioSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
  private setAsset(id: SoundId, s: AssetState): void {
    this.set({ assets: { ...this.snapshot.assets, [id]: s } });
  }

  private ensureContext(): boolean {
    if (typeof window === "undefined") return false;
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) {
      this.set({ state: "unsupported" });
      return false;
    }
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.effectiveGain();
    this.master.connect(this.ctx.destination);
    return true;
  }

  private effectiveGain(): number {
    return this.snapshot.muted ? 0 : this.snapshot.volume;
  }

  /**
   * Try to start audio without a user gesture (works in some embedded web views, not in Safari tabs).
   * Returns true when audio is running. Never throws.
   */
  async autoActivate(): Promise<boolean> {
    if (this.snapshot.state === "active") return true;
    if (!this.ensureContext() || !this.ctx) return false;
    try {
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
    } catch {
      /* stays suspended */
    }
    if (this.ctx.state === "running") {
      this.set({ state: "active" });
      void this.loadAll();
      return true;
    }
    return false;
  }

  /** Call from a click/tap handler. Safe to call repeatedly. */
  async activate(): Promise<void> {
    if (!this.ensureContext() || !this.ctx) return;
    try {
      await this.ctx.resume();
      // silent 1-sample buffer fully unlocks iOS output
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (err) {
      this.set({ lastError: `activate: ${(err as Error)?.message ?? "failed"}` });
    }
    if (this.ctx.state === "running") {
      this.set({ state: "active" });
      void this.loadAll();
    }
  }

  setMuted(muted: boolean): void {
    if (this.master) this.master.gain.value = muted ? 0 : this.snapshot.volume;
    this.set({ muted });
  }

  setVolume(v: number): void {
    const volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.snapshot.muted ? 0 : volume;
    Object.values(this.elements).forEach((el) => {
      if (el) el.volume = this.snapshot.muted ? 0 : volume;
    });
    this.set({ volume });
  }

  private async loadAll(): Promise<void> {
    await Promise.all(SOUND_IDS.map((id) => this.load(id)));
  }

  private async load(id: SoundId): Promise<void> {
    if (this.snapshot.assets[id] !== "unloaded" && this.snapshot.assets[id] !== "missing") return;
    let data: ArrayBuffer;
    try {
      const res = await fetch(AUDIO_MANIFEST[id].file);
      if (!res.ok) throw new Error(String(res.status));
      data = await res.arrayBuffer();
    } catch {
      this.setAsset(id, "missing");
      return;
    }
    try {
      if (!this.ctx) throw new Error("no ctx");
      // callback form: older Safari has no promise-based decodeAudioData
      const buf = await new Promise<AudioBuffer>((resolve, reject) => {
        // modern browsers also return a promise: swallow it, the callbacks above already handle both outcomes
        const ret = this.ctx!.decodeAudioData(data.slice(0), resolve, reject) as Promise<AudioBuffer> | undefined;
        ret?.catch?.(() => undefined);
      });
      this.buffers[id] = buf;
      this.setAsset(id, "buffer");
    } catch {
      // HTML Audio API fallback
      const el = new Audio(AUDIO_MANIFEST[id].file);
      el.preload = "auto";
      el.volume = this.snapshot.muted ? 0 : this.snapshot.volume;
      this.elements[id] = el;
      this.setAsset(id, "element");
    }
  }

  /** Queued: resolves when this sound has ended. Never rejects. Resolves immediately when inactive. */
  play(id: SoundId): Promise<void> {
    const gen = this.generation;
    const run = this.tail.then(() => (gen === this.generation ? this.playNow(id) : undefined));
    this.tail = run.catch(() => undefined);
    return run.catch(() => undefined);
  }

  /** Stop current sound and drop everything queued. */
  stop(): void {
    this.generation += 1;
    this.stopCurrent?.();
  }

  private fail(msg: string): void {
    this.set({ failures: this.snapshot.failures + 1, lastError: msg });
  }

  private async playNow(id: SoundId): Promise<void> {
    if (this.snapshot.state !== "active" || !this.ctx || !this.master) return;
    if (this.ctx.state !== "running") {
      // iOS suspends/interrupts audio (calls, Siri, backgrounding): try to recover quietly
      try {
        await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
      } catch {
        /* handled below */
      }
      if ((this.ctx.state as string) !== "running") {
        this.fail(`audio context ${this.ctx.state}`);
        return;
      }
    }
    return this.playRunning(id, this.ctx, this.master);
  }

  private playRunning(id: SoundId, ctx: AudioContext, master: GainNode): Promise<void> {
    const timeoutMs = AUDIO_MANIFEST[id].nominalMs + 1500;

    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed inside the hoisted finish() declaration
    const self = this;
    return new Promise<void>((resolve) => {
      let done = false;
      const timer = setTimeout(() => finish(), timeoutMs);
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        self.stopCurrent = null;
        self.set({ playing: null });
        resolve();
      }
      this.set({ playing: id });

      const buf = this.buffers[id];
      const el = this.elements[id];
      try {
        if (buf) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(master);
          src.onended = finish;
          this.stopCurrent = () => {
            try { src.stop(); } catch { /* already stopped */ }
            finish();
          };
          src.start();
        } else if (el) {
          el.currentTime = 0;
          el.volume = this.snapshot.muted ? 0 : this.snapshot.volume;
          el.onended = finish;
          this.stopCurrent = () => {
            el.pause();
            finish();
          };
          void el.play().catch((e: Error) => {
            this.fail(`html audio: ${e?.message ?? "play failed"}`);
            finish();
          });
        } else {
          this.fail(`${id}: asset missing, fallback tone`);
          this.playFallbackTone(ctx, master, finish);
        }
      } catch (err) {
        this.fail(`${id}: ${(err as Error)?.message ?? "play error"}`);
        finish();
      }
    });
  }

  /** Last resort when the asset is missing. Not a realistic ATM sound. */
  private playFallbackTone(ctx: AudioContext, master: GainNode, done: () => void): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1800;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g).connect(master);
    osc.onended = done;
    this.stopCurrent = () => {
      try { osc.stop(); } catch { /* already stopped */ }
      done();
    };
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Plays every sound once, in order. */
  async test(): Promise<void> {
    for (const id of SOUND_IDS) await this.play(id);
  }
}
