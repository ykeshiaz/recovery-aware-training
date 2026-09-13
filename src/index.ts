import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`recovery-aware-training API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
