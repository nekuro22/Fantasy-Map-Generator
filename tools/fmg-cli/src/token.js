// The API token: a long random secret kept in a file only its owner can read, or given in FMG_TOKEN
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const tokenPath = () => process.env.FMG_TOKEN_FILE || join(homedir(), ".config", "fmg", "token");

/** The token in use, or undefined when there is none yet */
export function readToken() {
  if (process.env.FMG_TOKEN?.trim()) return process.env.FMG_TOKEN.trim();
  const path = tokenPath();
  return existsSync(path) ? readFileSync(path, "utf8").trim() || undefined : undefined;
}

/** Make a new token and keep it in the token file (owner-only), replacing an older one */
export function createToken() {
  const path = tokenPath();
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return token;
}

/** The token, made when missing */
export const ensureToken = () => readToken() ?? createToken();

/** Same text, compared in constant time */
export function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}
