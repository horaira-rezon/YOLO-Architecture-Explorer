import { Link } from "react-router-dom";
import { TASKS } from "@yolo-atlas/core";
import { TaskIllustration } from "../components/TaskIllustration";

export function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold">What do you want the computer to see?</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick a job. Then pick a YOLO version and look inside it, one block at a time, in simple words.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TASKS.map((t) => (
          <li key={t.id}>
            <Link to={`/versions/${t.id}`} className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition hover:border-accent hover:shadow-md" data-testid={`task-${t.id}`}>
              <TaskIllustration task={t.id} />
              <span className="text-lg font-semibold">{t.label}</span>
              <span className="text-sm text-muted">{t.short}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
