import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, BadgeCheck, Info } from "lucide-react";
import type { Architecture, VersionInfo } from "@yolo-atlas/core";

/** "Data source" popover: where this architecture comes from, and how sure we are. */
export function Provenance({ arch, info }: { arch: Architecture; info?: VersionInfo }) {
  const m = arch.meta;
  const verified = m.confidence === "verified";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${verified ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}
          data-testid="provenance"
        >
          {verified ? <BadgeCheck size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
          {verified ? "verified from official files" : "unverified"}
          <Info size={12} aria-hidden />
          <span className="sr-only">: show data source</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="z-50 w-[min(380px,calc(100vw-24px))] rounded-xl border border-border bg-surface p-3 text-sm shadow-xl" data-testid="provenance-popover">
          <h3 className="font-semibold">Data source</h3>
          <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted">Repository</dt><dd><a className="break-all text-accent underline" href={m.source.repo} target="_blank" rel="noreferrer">{m.source.repo.replace("https://github.com/", "")}</a></dd>
            <dt className="text-muted">Config file</dt><dd className="break-all font-mono">{m.source.file}</dd>
            {m.source.package && <><dt className="text-muted">Package</dt><dd>{m.source.package} {m.source.packageVersion}</dd></>}
            {m.source.commit && <><dt className="text-muted">Commit</dt><dd className="font-mono">{m.source.commit.slice(0, 12)}</dd></>}
            <dt className="text-muted">Retrieved</dt><dd>{m.retrievedAt}</dd>
            <dt className="text-muted">Confidence</dt><dd>{verified ? "Verified: every layer's shape and parameter count was checked against the real PyTorch model." : "Draft: could not be checked against official code."}</dd>
          </dl>
          {info && (
            <>
              <h4 className="mt-3 text-xs font-semibold uppercase text-muted">Sources for the descriptions</h4>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {info.sources.map((s) => <li key={s.url}><a className="text-accent underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
              </ul>
              {info.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{info.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </>
          )}
          <Popover.Arrow className="fill-[var(--border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
