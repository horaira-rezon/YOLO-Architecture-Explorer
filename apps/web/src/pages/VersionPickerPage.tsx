import { Link, useParams } from "react-router-dom";
import { TASKS, VERSIONS, type Task } from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";

export function VersionPickerPage() {
  const { task = "detect" } = useParams();
  const level = useAtlas((s) => s.readingLevel);
  const t = TASKS.find((x) => x.id === task);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted"><Link to="/" className="underline">Tasks</Link> › {t?.label}</p>
      <h1 className="mt-1 text-2xl font-semibold">Pick a YOLO version</h1>
      <p className="mt-1 text-muted">Newer is not always better for your case. Each card says what the version changed.</p>
      <ol className="relative mt-8 space-y-4 border-l-2 border-border pl-6" aria-label="YOLO versions over time">
        {VERSIONS.map((v) => {
          const sup = v.tasks[task as Task];
          const ok = v.status === "released" && sup?.supported;
          const body = (
            <>
              <span className="absolute -left-[33px] top-5 h-4 w-4 rounded-full border-2 border-bg" style={{ background: ok ? "var(--accent)" : "var(--border)" }} aria-hidden />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-semibold">{v.label}</span>
                <span className="text-sm text-muted">{v.year} · {v.org}</span>
                {v.status === "announced" ? (
                  <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">announced, not released</span>
                ) : v.confidence === "verified" ? (
                  <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">verified</span>
                ) : (
                  <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">draft</span>
                )}
              </div>
              <p className="mt-1 text-sm">{v.bigIdea[level]}</p>
              {!ok && <p className="mt-2 text-sm text-warn">{sup?.note ?? "Not available for this task."}</p>}
              {ok && sup?.note && <p className="mt-2 text-xs text-muted">{sup.note}</p>}
            </>
          );
          return (
            <li key={v.id} className="relative">
              {ok ? (
                <Link to={`/explore/${v.id}/${task}`} className="block rounded-xl border border-border bg-surface p-4 hover:border-accent" data-testid={`version-${v.id}`}>{body}</Link>
              ) : (
                <div className="block rounded-xl border border-dashed border-border bg-surface/60 p-4 opacity-80" aria-disabled title={sup?.note}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
