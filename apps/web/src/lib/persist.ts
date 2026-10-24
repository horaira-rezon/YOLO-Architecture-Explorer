import { useEffect, useState } from "react";
import { createStore, del, get, keys, set } from "idb-keyval";
import type { Architecture } from "@yolo-atlas/core";
import type { ClipNode } from "../store/atlas";

/** IndexedDB persistence: autosave, named snapshots, templates, caches. Failures never break the app. */
const store = typeof indexedDB !== "undefined" ? createStore("yolo-atlas", "kv") : undefined;

async function safe<T>(f: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return store ? await f() : fallback;
  } catch {
    return fallback;
  }
}

export const persist = {
  get: <T,>(k: string) => safe(() => get<T>(k, store), undefined),
  set: (k: string, v: unknown) => safe(() => set(k, v, store), undefined),
  del: (k: string) => safe(() => del(k, store), undefined),
  keys: () => safe(async () => (await keys(store)).map(String), [] as string[]),
};

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  arch: Architecture;
}

export interface Template {
  id: string;
  name: string;
  nodes: ClipNode[];
}

export async function listSnapshots(modelKey: string): Promise<Snapshot[]> {
  return (await persist.get<Snapshot[]>(`snapshots:${modelKey}`)) ?? [];
}

export async function saveSnapshot(modelKey: string, name: string, arch: Architecture): Promise<Snapshot[]> {
  const list = await listSnapshots(modelKey);
  const next = [{ id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), arch }, ...list].slice(0, 50);
  await persist.set(`snapshots:${modelKey}`, next);
  return next;
}

export async function deleteSnapshot(modelKey: string, id: string): Promise<Snapshot[]> {
  const next = (await listSnapshots(modelKey)).filter((s) => s.id !== id);
  await persist.set(`snapshots:${modelKey}`, next);
  return next;
}

const listeners = new Set<() => void>();
export async function saveTemplate(t: Template): Promise<void> {
  const list = (await persist.get<Template[]>("templates")) ?? [];
  await persist.set("templates", [...list.filter((x) => x.name !== t.name), t]);
  listeners.forEach((l) => l());
}

export function useTemplates(): Template[] {
  const [list, setList] = useState<Template[]>([]);
  useEffect(() => {
    const load = () => void persist.get<Template[]>("templates").then((l) => setList(l ?? []));
    load();
    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, []);
  return list;
}
