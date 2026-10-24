import { serve } from "@hono/node-server";
import { createApp } from "./app";

const port = Number(process.env.PROXY_PORT ?? 8787);
serve({ fetch: createApp(process.env).fetch, port });
console.log(`YOLO Atlas AI proxy on http://localhost:${port} (keys read from .env; never sent to the browser)`);
