import { memo, useState } from "react";

/** Remote/local image with initials fallback; never leaves a broken-image icon. */
export const Avatar = memo(function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  const show = url && failedUrl !== url;
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", background: "#1d4d30", border: "2px solid #3fd16e", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" decoding="async" width={size} height={size} onError={() => setFailedUrl(url)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span className="screen-text" style={{ fontSize: size * 0.4, fontWeight: 700 }}>{initials}</span>
      )}
    </div>
  );
});
