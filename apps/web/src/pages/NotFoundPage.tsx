import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">This page does not exist</h1>
      <p className="mt-2 text-muted">The link may be old or mistyped.</p>
      <Link to="/" className="mt-6 inline-block rounded bg-accent px-4 py-2 text-accent-fg">Go to the start</Link>
    </div>
  );
}
