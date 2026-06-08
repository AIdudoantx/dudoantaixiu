import app from "./app";
import { logger } from "./lib/logger";
import { loadSettingsFromDB } from "./routes/settings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Load API keys (Gemini, OpenAI, Telegram) từ DB vào process.env trước khi nhận request
loadSettingsFromDB()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to load settings from DB — starting anyway");
    app.listen(port, () => {
      logger.info({ port }, "Server listening (without DB settings)");
    });
  });
