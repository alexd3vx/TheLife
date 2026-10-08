import { LOCKED_FEATURES } from "../features";

/** The page for a part of the game that is not built yet. */
export default function ComingSoon({ id }: { id: string }) {
  const f = LOCKED_FEATURES[id];
  return (
    <main className="coming-soon">
      <div className="coming-card">
        <div className="coming-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="44" height="44"><rect x="9" y="21" width="30" height="21" rx="4" fill="#5b9bff" /><path d="M16 21v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#a8c8ff" strokeWidth="4" strokeLinecap="round" /></svg>
        </div>
        <h1>{f?.title ?? "Coming soon"}</h1>
        <p>{f?.note ?? "This part of TheLife is still being built."}</p>
        <a className="btn btn-primary" href="#/play">Back home</a>
      </div>
    </main>
  );
}
