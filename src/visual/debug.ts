/** Tiny external store for the optional debug monitor (?debug=1). Nothing is shown unless a UI subscribes. */
export interface VisualStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  webgl: "ok" | "lost" | "unavailable" | "n/a";
  quality: number;
  dpr: number;
  renderer: string;
}

let stats: VisualStats = { fps: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, webgl: "n/a", quality: 1, dpr: 1, renderer: "" };
const listeners = new Set<() => void>();

export const visualStats = {
  get: (): VisualStats => stats,
  set(patch: Partial<VisualStats>): void {
    stats = { ...stats, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
