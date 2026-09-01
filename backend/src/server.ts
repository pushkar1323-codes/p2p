import { createApp } from "./app.ts";
import { env } from "./config/env.ts";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`P2P backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
