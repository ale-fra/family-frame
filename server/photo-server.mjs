import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { startFrameServer } from "./frame-server.mjs";

// Existing device launchers can keep injecting system actions through this entry point.
export { startFrameServer as startPhotoServer };

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await startFrameServer();
}
