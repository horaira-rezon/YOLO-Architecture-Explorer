/** All explanation content in one chunk, loaded after the diagram is on screen (see loadContent). */
import { BlockContentSchema, GlossarySchema, type BlockContent, type GlossaryTerm } from "@yolo-atlas/core";
import glossaryJson from "@yolo-atlas/core/content/glossary.json";

const files = import.meta.glob<{ default: unknown }>("../../../../packages/core/content/{blocks,items}/*.json", { eager: true });

export function parseAll(): { content: Map<string, BlockContent>; glossary: GlossaryTerm[] } {
  const content = new Map<string, BlockContent>();
  for (const [path, mod] of Object.entries(files)) {
    const r = BlockContentSchema.safeParse(mod.default);
    if (r.success) content.set(r.data.id, r.data);
    else console.error(`Invalid content file ${path}`, r.error.issues);
  }
  return { content, glossary: GlossarySchema.parse(glossaryJson) };
}
