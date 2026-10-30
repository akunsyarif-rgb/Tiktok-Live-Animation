// Generates ORIGINAL placeholder ATM sound effects (CC0). These are synthesized,
// NOT field recordings of a real ATM. Replace the files in public/audio with
// licensed recordings for higher realism (see docs/AUDIO_ASSETS.md).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SR = 44100;
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

function write(name, buf) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.8 / peak : 1;
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
