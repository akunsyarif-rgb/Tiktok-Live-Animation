import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Procedural brushed-metal streak map (no image asset, no network). Shared by every metal material. */
export function brushedTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8a8a";
  g.fillRect(0, 0, size, size);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < size * 5; i++) {
    const y = rnd() * size;
    const l = 20 + rnd() * 140;
    const x = rnd() * size;
    const v = 100 + Math.floor(rnd() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.12})`;
    g.lineWidth = 0.5 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Soft round sprite for additive glows / particles. */
export function glowTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Image-based light from three's procedural RoomEnvironment: zero downloaded pixels. */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return rt.texture;
}

export function metal(color: number, roughness: number, env: THREE.Texture, map?: THREE.Texture, metalness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMap: env, envMapIntensity: 1.0, roughnessMap: map ?? null });
}

/** Cheap "glass": see-through shell + reflections. Deliberately NOT `transmission` (extra render pass on mobile GPUs). */
export function glass(color: number, opacity: number, env: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.06, transparent: true, opacity, envMap: env, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
}
