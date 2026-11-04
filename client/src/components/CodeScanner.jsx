import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Full-screen QR scanner for pickup codes: live camera preview, decodes
// the claimer's QR and hands the code back as text - the same 8-character
// code the claimer could read out instead of showing the QR.
export default function CodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Point the camera at the claimer's QR code.");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (cancelled || doneRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height);
            if (found && found.data) {
              const code = found.data.trim().toUpperCase();
              if (/^[A-Z2-9]{8}$/.test(code)) {
                doneRef.current = true;
                resultRef.current(code);
                return;
              }
              setHint("That QR is not a pickup code - keep pointing at the claimer's code.");
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError("Camera is unavailable or permission was denied. You can type the code instead.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true">
      <div className="camera-card">
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <div className="scan-wrap">
            <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
            <div className="scan-box" />
          </div>
        )}
        <div className="camera-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!error && <p className="hint">{hint}</p>}
      </div>
    </div>
  );
}
