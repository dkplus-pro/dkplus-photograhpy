import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(
    `DKPlus admin API listening on http://${config.host}:${config.port}`,
  );
});
