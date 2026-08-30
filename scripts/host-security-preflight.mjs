import { createRequire } from "node:module";
import { resolveHostSecurityConfig } from "./host-security-config.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd(), process.argv.includes("--dev"));
resolveHostSecurityConfig(process.env);
