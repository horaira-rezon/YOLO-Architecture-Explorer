/**
 * Link checker (needs network, so it is not part of `pnpm check`): every URL in the content files, the version
 * catalogue and the model provenance must answer. Run: pnpm --filter @yolo-atlas/core links:check
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VERSIONS } from "../src/catalog";

const ROOT = join(import.meta.dirname, "..");
const urls = new Map<string, string>();
const add = (u: string, where: string) => { if (/^https?:\/\//.test(u) && !urls.has(u)) urls.set(u, where); };

for (const dir of ["blocks", "items"]) for (const f of readdirSync(join(ROOT, "content", dir))) {
  const text = readFileSync(join(ROOT, "content", dir, f), "utf8");
  for (const m of text.matchAll(/"url":\s*"([^"]+)"/g)) add(m[1]!, `content/${dir}/${f}`);
}
for (const v of VERSIONS) for (const s of v.sources) add(s.url, `catalog ${v.label}`);
for (const f of readdirSync(join(ROOT, "data", "models"))) {
  const d = JSON.parse(readFileSync(join(ROOT, "data", "models", f), "utf8")) as { tasks: Record<string, { variants: Record<string, { source: { repo: string } }> }> };
  for (const t of Object.values(d.tasks)) for (const x of Object.values(t.variants)) add(x.source.repo, `data/models/${f}`);
}

async function check(u: string): Promise<number> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const r = await fetch(u, { method, redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "yolo-atlas-link-check" } });
      if (r.ok || method === "GET") return r.status;
    } catch {
      if (method === "GET") return 0;
    }
  }
  return 0;
}

const bad: string[] = [];
await Promise.all([...urls].map(async ([u, where]) => {
  const status = await check(u);
  // arXiv and some docs sites rate-limit robots with 403/429; report but do not fail on those
  if (status === 0 || (status >= 400 && status !== 403 && status !== 429)) bad.push(`${status} ${u} (${where})`);
  else if (status === 403 || status === 429) console.warn(`warn ${status} ${u}`);
}));
console.log(`checked ${urls.size} links`);
if (bad.length) {
  for (const b of bad) console.error(`broken: ${b}`);
  process.exit(1);
}
