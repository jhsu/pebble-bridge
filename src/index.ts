import { loadEnvFile } from "node:process";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Pebble bridge listening on port ${config.port}`);
});
