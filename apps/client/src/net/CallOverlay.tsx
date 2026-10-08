import { calls, useCalls } from "./calls";
import "./calls.css";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const initials = (n: string) => n.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

/** The call screen: shown over everything while a call rings, connects or runs (an incoming call can arrive anywhere in the game). */
export default function CallOverlay() {
  const c = useCalls();
  if (c.phase === "idle") return null;
  const status =
    c.phase === "calling" ? "Calling…" : c.phase === "incoming" ? "Incoming call" : c.phase === "connecting" ? "Connecting…" : c.phase === "active" ? clock(c.seconds) : c.why || "Call ended";
  return (
    <div className="call-screen" role="dialog" aria-label="Phone call" aria-live="polite">
      <div className="call-top">
        <div className={`call-avatar${c.phase === "incoming" || c.phase === "calling" ? " ring" : ""}`}>{initials(c.peerName)}</div>
        <h2>{c.peerName}</h2>
        <p className="call-status">{c.phase === "ended" ? c.why || "Call ended" : status}</p>
        {c.phase === "calling" && <p className="call-note">Calls use your airtime, ₦20 a minute.</p>}
      </div>
      <div className="call-actions">
        {c.phase === "incoming" && (
          <>
            <button className="call-btn decline" onClick={() => calls.decline()} aria-label="Decline">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1A15.07 15.07 0 0 0 12 9z" /></svg>
            </button>
            <button className="call-btn accept" onClick={() => void calls.answer()} aria-label="Answer">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.61 21 3 13.39 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
            </button>
          </>
        )}
        {(c.phase === "calling" || c.phase === "connecting" || c.phase === "active") && (
          <>
            {c.phase !== "calling" && (
              <button className={`call-btn mute${c.muted ? " on" : ""}`} onClick={() => calls.toggleMute()} aria-pressed={c.muted} aria-label={c.muted ? "Unmute" : "Mute"}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                  {c.muted ? <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" /> : <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />}
                </svg>
              </button>
            )}
            <button className="call-btn decline" onClick={() => calls.hangUp()} aria-label="End call">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1A15.07 15.07 0 0 0 12 9z" /></svg>
            </button>
          </>
        )}
        {c.phase === "ended" && (
          <button className="call-close" onClick={() => calls.dismiss()}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
