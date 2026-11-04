import { useEffect, useRef, useState } from "react";

// Full-screen camera capture: live preview, one tap to snap the photo.
// Hands back a JPEG File, exactly like picking one from the gallery,
// so recognition and the listing photo work the same either way.
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setReady(true);
        }
      } catch {
        if (!cancelled) setError("Camera is unavailable or permission was denied. You can upload a photo instead.");
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "camera-photo.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="camera-overlay" role="dialog" aria-modal="true">
      <div className="camera-card">
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
        )}
        <div className="camera-actions">
          {!error && (
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={capture}>
              📸 Capture photo
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!error && <p className="hint">Point the camera at the food and tap Capture - we recognize it from the photo.</p>}
      </div>
    </div>
  );
}
