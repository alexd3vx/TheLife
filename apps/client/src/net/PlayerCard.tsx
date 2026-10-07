import type { PlayerView } from "@thelife/shared";
import { GameIcon } from "../ui/icons";
import { social } from "./social";

/** What you can do with another player you tapped: wave, cheer, message, pay. */
export default function PlayerCard({ player, near, onClose, onEmote }: { player: PlayerView; near: boolean; onClose(): void; onEmote(name: string): void }) {
  const open = (mode: "dm" | "pay") => {
    if (mode === "dm" && player.uid) {
      // private messages live in LifeChat on the phone
      social.startWith(player.uid, player.name);
      window.dispatchEvent(new CustomEvent("thelife-open-phone", { detail: "chat" }));
    } else window.dispatchEvent(new CustomEvent("thelife-open-online", { detail: { id: player.id, mode } }));
    onClose();
  };
  const initials = player.name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <div className="player-card" role="dialog" aria-label={`${player.name}`}>
      <header>
        <span className="player-card-avatar">{initials}</span>
        <div>
          <strong>{player.name}</strong>
          <small>{near ? "Right here with you" : "Out in Lagos"}</small>
        </div>
        <button onClick={onClose} aria-label="Close"><GameIcon name="close" size={14} /></button>
      </header>
      <div className="player-card-actions">
        <button onClick={() => onEmote("wave")}><GameIcon name="hand" size={16} /> Wave</button>
        <button onClick={() => onEmote("cheer")}><GameIcon name="star" size={16} /> Cheer</button>
        <button onClick={() => open("dm")}><GameIcon name="phone" size={16} /> Message</button>
        <button onClick={() => open("pay")}><GameIcon name="money" size={16} /> Pay</button>
      </div>
    </div>
  );
}
