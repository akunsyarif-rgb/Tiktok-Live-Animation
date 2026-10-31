/** Feature-detect WebGL without keeping a context alive. Never throws. */
export function detectWebGL(): { ok: boolean; version: 1 | 2 | 0 } {
  try {
    if (typeof document === "undefined") return { ok: false, version: 0 };
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2");
    if (gl2) {
      gl2.getExtension("WEBGL_lose_context")?.loseContext();
      return { ok: true, version: 2 };
    }
    const c1 = document.createElement("canvas");
    const gl1 = c1.getContext("webgl") ?? (c1.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl1) {
      gl1.getExtension("WEBGL_lose_context")?.loseContext();
      return { ok: true, version: 1 };
    }
  } catch {
    /* blocked */
  }
  return { ok: false, version: 0 };
}
