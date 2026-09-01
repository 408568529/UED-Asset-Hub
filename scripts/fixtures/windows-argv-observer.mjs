import { writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = process.env.UED_ARGV_OBSERVATION_PATH;
if (!outputPath || !path.isAbsolute(outputPath)) throw new Error("UED_ARGV_OBSERVATION_PATH must be an absolute isolated test path.");

await writeFile(outputPath, `${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), parentPid: process.ppid })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
if (process.env.UED_ARGV_OBSERVER_HOLD === "true") {
  await new Promise((resolve) => {
    const timer = setInterval(() => {}, 1_000);
    process.once("SIGTERM", () => { clearInterval(timer); resolve(); });
  });
}
