import { readFileSync } from "node:fs";

/** The agent guide shipped as AGENTS.md next to the package */
export const guide = () => readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8").trim();
