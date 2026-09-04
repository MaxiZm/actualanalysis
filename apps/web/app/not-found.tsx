import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell">
      <header className="page-header">
        <h1>That record is not in this dataset.</h1>
        <div>
          <p className="page-lede">The slug may have changed, or the model or benchmark has not been added yet.</p>
          <p className="page-meta"><Link className="primary-button" href="/">Open leaderboard</Link></p>
        </div>
      </header>
    </div>
  );
}
