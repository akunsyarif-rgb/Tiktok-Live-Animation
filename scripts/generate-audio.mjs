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

// motor: low saw + harmonic hum + lowpassed noise, with spin up/down
function addMotor(buf, start, dur, amp) {
  const s = Math.floor(start * SR);
  let lp = 0;
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.15) * Math.min(1, (dur - t) / 0.25);
    const f = 62 + 22 * Math.min(1, t / 0.4);
    const saw = ((t * f) % 1) * 2 - 1;
    lp += 0.06 * (rnd() - lp);
    buf[s + i] += (saw * 0.22 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12 + lp * 0.5) * amp * fade;
  }
}

// note riffle: dense short highpassed noise ticks
function addRiffle(buf, start, end, rate, amp) {
  for (let t = start; t < end; t += (1 / rate) * (0.7 + 0.6 * Math.abs(rnd()))) {
    const s = Math.floor(t * SR);
    const a = amp * (0.4 + 0.6 * Math.abs(rnd()));
    let prev = 0;
    for (let i = 0; i < 0.012 * SR && s + i < buf.length; i++) {
      const n = rnd();
      const hp = n - prev;
      prev = n;
      buf[s + i] += hp * a * Math.exp(-i / (0.0018 * SR));
    }
  }
}

function addThunk(buf, start, amp) {
  addSine(buf, start, 0.16, 78, amp, 0.05);
  addRiffle(buf, start, start + 0.01, 1, amp * 0.8);
}

function addServo(buf, start, dur, amp) {
  const s = Math.floor(start * SR);
  let lp = 0;
  for (let i = 0; i < dur * SR && s + i < buf.length; i++) {
    const t = i / SR;
    lp += 0.2 * (rnd() - lp);
    const f = 300 + 500 * (t / dur);
    buf[s + i] += (lp * 0.4 + Math.sin(2 * Math.PI * f * t) * 0.08) * amp * Math.min(1, t / 0.05) * Math.min(1, (dur - t) / 0.1);
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

// processing (viewer join)
{
  const b = make(1.4);
  [0.05, 0.22, 0.39].forEach((t) => addSine(b, t, 0.07, 1900, 0.35, 0.03));
  addSine(b, 0.85, 0.14, 1400, 0.3, 0.06);
  addMotor(b, 0.0, 1.3, 0.12);
  addServo(b, 0.55, 0.28, 0.3);
  write("processing.wav", b);
}

// cash dispense
{
  const b = make(2.3);
  addMotor(b, 0.1, 1.9, 0.5);
  addRiffle(b, 0.45, 1.55, 55, 0.55);
  addServo(b, 1.6, 0.2, 0.35);
  addThunk(b, 1.72, 0.6);
  addRiffle(b, 1.95, 1.99, 40, 0.5);
  write("cash_dispense.wav", b);
}

// gift processing
{
  const b = make(1.9);
  [1500, 1800, 2200].forEach((f, i) => addSine(b, 0.05 + i * 0.16, 0.08, f, 0.35, 0.035));
  addSine(b, 1.05, 0.09, 2200, 0.33, 0.04);
  addSine(b, 1.2, 0.14, 2600, 0.33, 0.06);
  addMotor(b, 0.0, 1.8, 0.1);
  addServo(b, 0.7, 0.3, 0.3);
  write("gift_processing.wav", b);
}

// premium dispense
{
  const b = make(3.8);
  addMotor(b, 0.1, 3.1, 0.55);
  addRiffle(b, 0.5, 2.7, 80, 0.55);
  addServo(b, 2.8, 0.2, 0.35);
  addThunk(b, 2.95, 0.65);
  addRiffle(b, 3.1, 3.14, 40, 0.5);
  addSine(b, 3.2, 0.55, 1568, 0.22, 0.25);
  addSine(b, 3.3, 0.5, 2093, 0.18, 0.22);
  write("premium_dispense.wav", b);
}
