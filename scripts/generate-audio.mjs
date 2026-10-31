// Generates ORIGINAL placeholder ATM sound effects (CC0). These are synthesized,
// NOT field recordings of a real ATM. Replace the files in public/audio with
// licensed recordings for higher realism (see docs/AUDIO_ASSETS.md).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let SR = 44100;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
mkdirSync(outDir, { recursive: true });

let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

const make = (sec) => new Float32Array(Math.floor(sec * SR));
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-Math.max(0, t - a) / d);

function addSine(buf, start, dur, freq, amp, decay = dur / 3) {
  const s = Math.floor(start * SR);
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    buf[s + i] += Math.sin(2 * Math.PI * freq * t) * amp * env(t, 0.004, decay);
  }
}

// RBJ biquad band-pass
function bandpass(freq, q) {
  const w0 = (2 * Math.PI * freq) / SR, alpha = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
  const b0 = alpha, b1 = 0, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// roller motor: low drive tone + gear-tooth pulsing + mid whir (band-passed noise)
function addMotor(buf, start, dur, amp) {
  const s = Math.floor(start * SR);
  const whir = bandpass(700, 1.2);
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.2) * Math.min(1, (dur - t) / 0.3);
    const f = 58 + 14 * Math.min(1, t / 0.5);
    const tooth = 0.65 + 0.35 * Math.sin(2 * Math.PI * 24 * t); // roller rhythm
    const drive = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.25;
    buf[s + i] += (drive * tooth + whir(rnd()) * 0.9) * amp * fade;
  }
}

// paper sliding: sustained band-passed rustle (smooth, not clicky -> no printer/dot-matrix feel)
function addRustle(buf, start, end, amp) {
  const s = Math.floor(start * SR), n = Math.floor((end - start) * SR);
  const hi = bandpass(3200, 0.9), lo = bandpass(1100, 1.1);
  for (let i = 0; i < n && s + i < buf.length; i++) {
    const t = i / SR, d = end - start;
    const edge = Math.min(1, t / 0.12) * Math.min(1, (d - t) / 0.25);
    const flutter = 0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 9 * t + 1.3 * Math.sin(2 * Math.PI * 2.3 * t)));
    buf[s + i] += (hi(rnd()) * 0.7 + lo(rnd()) * 0.5) * amp * edge * flutter;
  }
}

// single note swish: short smooth noise sweep
function addSwish(buf, start, dur, amp) {
  const s = Math.floor(start * SR), bp = bandpass(2600, 0.8);
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    buf[s + i] += bp(rnd()) * amp * Math.sin((Math.PI * t) / dur) ** 2;
  }
}

// cash shutter / tray: low thunk + brief metallic tick
function addShutter(buf, start, amp) {
  addSine(buf, start, 0.14, 95, amp, 0.045);
  addSine(buf, start + 0.01, 0.05, 1400, amp * 0.25, 0.012);
  addSwish(buf, start, 0.03, amp * 0.6);
}

// soft electronic hum (relay/power supply feel)
function addHum(buf, start, dur, amp) {
  const s = Math.floor(start * SR);
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.1) * Math.min(1, (dur - t) / 0.15);
    buf[s + i] += (Math.sin(2 * Math.PI * 120 * t) * 0.6 + Math.sin(2 * Math.PI * 240 * t) * 0.25) * amp * fade;
  }
}

function write(name, buf, target = 0.8) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? target / peak : 1;
  const data = Buffer.alloc(44 + buf.length * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + buf.length * 2, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(buf.length * 2, 40);
  buf.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * g * 32767))), 44 + i * 2));
  writeFileSync(join(outDir, name), data);
  console.log(name, (buf.length / SR).toFixed(2) + "s", data.length + " bytes");
}

// processing: keypad-style beeps + electronic hum + relay tick
{
  const b = make(1.4);
  [0.06, 0.22, 0.38].forEach((t) => addSine(b, t, 0.07, 2000, 0.33, 0.03));
  addHum(b, 0.0, 1.3, 0.1);
  addShutter(b, 0.95, 0.12);
  addSine(b, 1.1, 0.1, 1500, 0.28, 0.05);
  write("processing.wav", b);
}

// cash dispense: motor + rollers, notes sliding out, shutter, tray
{
  const b = make(2.3);
  addMotor(b, 0.1, 1.9, 0.5);
  addRustle(b, 0.45, 1.6, 0.35);
  addSwish(b, 0.5, 0.35, 0.3);
  addShutter(b, 1.72, 0.55);
  write("cash_dispense.wav", b);
}

// gift processing: rising beeps + hum
{
  const b = make(1.9);
  [1500, 1800, 2200].forEach((f, i) => addSine(b, 0.05 + i * 0.16, 0.08, f, 0.33, 0.035));
  addHum(b, 0.0, 1.8, 0.1);
  addSine(b, 1.2, 0.09, 2200, 0.3, 0.04);
  addSine(b, 1.38, 0.09, 2200, 0.3, 0.04);
  write("gift_processing.wav", b);
}

// premium dispense: longer motor + rollers, more notes sliding, shutter, tray
{
  const b = make(3.8);
  addMotor(b, 0.1, 3.1, 0.55);
  addRustle(b, 0.5, 2.7, 0.4);
  [0.6, 1.0, 1.4, 1.8, 2.2].forEach((t) => addSwish(b, t, 0.3, 0.28));
  addShutter(b, 2.95, 0.6);
  addShutter(b, 3.15, 0.3);
  write("premium_dispense.wav", b);
}

// success: two short confirmation beeps
{
  const b = make(0.6);
  addSine(b, 0.02, 0.11, 1760, 0.4, 0.06);
  addSine(b, 0.19, 0.16, 1760, 0.4, 0.08);
  write("success.wav", b);
}

// ---------------------------------------------------------------------------------------------
// Visual-engine themes (Energy Reactor, Kinetic Marble Machine): 22.05 kHz mono to keep size small.
// Original synthesis (CC0). Not recordings.
// ---------------------------------------------------------------------------------------------
SR = 22050;

function addSweep(buf, start, dur, f0, f1, amp, shape = (x) => Math.sin(Math.PI * x) ** 0.7, expo = true) {
  const s = Math.floor(start * SR);
  let ph = 0;
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const x = i / (dur * SR);
    const f = expo ? f0 * Math.pow(f1 / f0, x) : f0 + (f1 - f0) * x;
    ph += (2 * Math.PI * f) / SR;
    buf[s + i] += (Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.2 + Math.sin(ph * 3) * 0.1) * amp * shape(x);
  }
}
function addNoiseBand(buf, start, dur, f0, f1, q, amp, shape = (x) => Math.sin(Math.PI * x)) {
  const s = Math.floor(start * SR);
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const x = i / (dur * SR);
    const bp = bandpass(f0 * Math.pow(f1 / f0, x), q);
    buf[s + i] += bp(rnd()) * amp * shape(x);
  }
}
const decayShape = (k) => (x) => Math.min(1, x * 40) * Math.exp(-x * k);

function addBoom(buf, start, amp, len = 2.4) {
  addSine(buf, start, len, 52, amp, len / 3.2);
  addSweep(buf, start, 0.8, 420, 55, amp * 0.8, (x) => Math.exp(-x * 3));
  addNoiseBand(buf, start, len * 0.6, 900, 120, 0.7, amp * 0.9, decayShape(4));
  [523, 1170, 1760].forEach((f, i) => addSine(buf, start + 0.02, len * 0.7, f, amp * 0.08 / (i + 1), len / 4));
}

// rx_pulse: soft core pulse (viewer join)
{
  const b = make(0.8);
  addSine(b, 0, 0.7, 70, 0.8, 0.22);
  addSweep(b, 0.02, 0.6, 520, 1040, 0.18, decayShape(5));
  addNoiseBand(b, 0, 0.5, 300, 2400, 0.8, 0.12, decayShape(5));
  write("rx_pulse.wav", b, 0.6);
}
// rx_charge: riser (base length 3.2 s; played faster for smaller gifts)
{
  const b = make(3.2);
  addSweep(b, 0, 3.0, 60, 880, 0.55, (x) => Math.pow(x, 1.6) * Math.min(1, (1 - x) * 12 + 0.15));
  addNoiseBand(b, 0, 3.0, 200, 3800, 1.2, 0.35, (x) => Math.pow(x, 2) * Math.min(1, (1 - x) * 14 + 0.1));
  addHum(b, 0, 3.0, 0.18);
  addSine(b, 2.9, 0.3, 1320, 0.12, 0.1);
  write("rx_charge.wav", b, 0.7);
}
// rx_release: boom + decay
{
  const b = make(3.0);
  addBoom(b, 0.02, 0.8, 2.6);
  write("rx_release.wav", b, 0.85);
}
// rx_special: riser between two releases, longer tail
{
  const b = make(5.6);
  addBoom(b, 0.05, 0.6, 2.0);
  addSweep(b, 1.4, 1.3, 90, 1100, 0.4, (x) => Math.pow(x, 1.4));
  addNoiseBand(b, 1.4, 1.3, 300, 4200, 1.2, 0.3, (x) => Math.pow(x, 2));
  addBoom(b, 2.7, 1.0, 2.8);
  [660, 990, 1320].forEach((f, i) => addSine(b, 3.0, 2.5, f, 0.05, 1.1 - i * 0.2));
  write("rx_special.wav", b, 0.9);
}
// rx_zap: short arc crackle
{
  const b = make(0.3);
  const s = Math.floor(0.0 * SR);
  for (let i = 0; i < 0.26 * SR; i++) {
    const t = i / SR;
    const am = Math.abs(Math.sin(2 * Math.PI * 140 * t)) > 0.5 ? 1 : 0.25;
    b[s + i] += rnd() * am * Math.exp(-t * 14) * Math.min(1, t * 500);
  }
  addSweep(b, 0, 0.18, 2400, 320, 0.25, decayShape(6));
  write("rx_zap.wav", b, 0.6);
}
// mb_launch: launcher clack + gear ticks
{
  const b = make(0.6);
  addSine(b, 0, 0.12, 210, 0.7, 0.04);
  addSwish(b, 0, 0.012, 0.9);
  addSine(b, 0.01, 0.1, 1300, 0.2, 0.025);
  [0.17, 0.25, 0.33].forEach((t) => { addSine(b, t, 0.04, 2100, 0.18, 0.012); addSwish(b, t, 0.006, 0.35); });
  write("mb_launch.wav", b, 0.7);
}
// mb_clack: ball on rail
{
  const b = make(0.25);
  addSine(b, 0, 0.1, 880, 0.7, 0.03);
  addSine(b, 0, 0.08, 1720, 0.25, 0.02);
  addSine(b, 0, 0.06, 2430, 0.12, 0.015);
  addSwish(b, 0, 0.008, 0.6);
  write("mb_clack.wav", b, 0.6);
}
// mb_bell: struck bell bar (inharmonic partials); pitched variants via playbackRate
{
  const b = make(1.2);
  [[1, 1, 0.38], [2.76, 0.5, 0.22], [5.4, 0.28, 0.13], [8.93, 0.14, 0.08]].forEach(([r, a, d]) => addSine(b, 0, 1.15, 880 * r, a * 0.6, d));
  addSwish(b, 0, 0.006, 0.4);
  write("mb_bell.wav", b, 0.6);
}
// mb_finale: swell + bell chord
{
  const b = make(4.0);
  [262, 330, 392, 523].forEach((f, i) => addSweep(b, 0.1 * i, 2.5, f * 0.98, f, 0.12, (x) => Math.pow(x, 1.5) * (x > 0.96 ? (1 - x) * 25 : 1), false));
  addNoiseBand(b, 0, 2.5, 400, 3000, 1.0, 0.18, (x) => Math.pow(x, 2.2));
  [1, 1.26, 1.5, 2].forEach((m, k) => [[1, 1, 0.5], [2.76, 0.4, 0.28], [5.4, 0.2, 0.15]].forEach(([r, a, d]) => addSine(b, 2.55 + k * 0.05, 1.4, 660 * m * r, a * 0.18, d)));
  write("mb_finale.wav", b, 0.8);
}
