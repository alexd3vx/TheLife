import type { GameState, StoreAppId } from "@thelife/game-core";
import type { Act } from "./PhoneApps";
import * as T from "./PhoneTools";
import * as G from "./PhoneGames";

/** The screen for a downloaded app. */
export function ExtraApp({ id, state, act }: { id: StoreAppId; state: GameState; act: Act }) {
  const p = { state, act };
  switch (id) {
    case "notes": return <T.Notes {...p} />;
    case "calendar": return <T.Calendar {...p} />;
    case "weather": return <T.Weather {...p} />;
    case "torch": return <T.Torch />;
    case "calc": return <T.Calculator />;
    case "clock": return <T.Clock {...p} />;
    case "translate": return <T.Translate />;
    case "currency": return <T.Rates {...p} />;
    case "netcheck": return <T.NetCheck {...p} />;
    case "gram": return <T.Feed kind="gram" {...p} />;
    case "chirp": return <T.Feed kind="chirp" {...p} />;
    case "match": return <T.Spark {...p} />;
    case "tube": return <T.Tube {...p} />;
    case "tunes": return <T.Tunes {...p} />;
    case "radio": return <T.Radio {...p} />;
    case "cinema": return <T.Cinema {...p} />;
    case "events": return <T.Events {...p} />;
    case "eats": return <T.Eats {...p} />;
    case "invest": return <T.Invest {...p} />;
    case "ajo": return <T.Ajo {...p} />;
    case "learn": return <T.Learn {...p} />;
    case "health": return <T.Health {...p} />;
    case "faith": return <T.Faith {...p} />;
    case "sleep": return <T.Sleep {...p} />;
    case "diary": return <T.Diary {...p} />;
    case "snake": return <G.Snake {...p} />;
    case "g2048": return <G.Game2048 {...p} />;
    case "xo": return <G.TicTac {...p} />;
    case "memory": return <G.MatchPairs {...p} />;
    case "trivia": return <G.Trivia {...p} />;
  }
}
