import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, openSync, readSync, closeSync, renameSync, appendFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

function ensureDir(): void {
  mkdirSync(config.dataDir, { recursive: true });
}

export function saveJsonAtomic(file: string, data: unknown): void {
  ensureDir();
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}

export function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (err) {
    if (existsSync(file)) {
      const quarantine = `${file}.corrupt-${Date.now()}`;
      try {
        renameSync(file, quarantine);
        console.error(`[persist] corrupt ${path.basename(file)} quarantined to ${quarantine}:`, err instanceof Error ? err.message : err);
      } catch {
        console.error(`[persist] corrupt ${path.basename(file)} and quarantine failed`);
      }
    }
    return fallback;
  }
}

export function readTail(file: string, maxBytes = 256 * 1024): string {
  if (!existsSync(file)) return "";
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  try {
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const nl = text.indexOf("\n");
      text = nl >= 0 ? text.slice(nl + 1) : ""; // drop partial first line
    }
    return text;
  } finally {
    closeSync(fd);
  }
}

export function parseJsonl(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // skip corrupt line
    }
  }
  return out;
}

export function appendJsonl(file: string, entry: unknown, maxBytes = 8 * 1024 * 1024, keepLines = 500): void {
  ensureDir();
  try {
    if (existsSync(file) && statSync(file).size > maxBytes) {
      const lines = parseJsonl(readTail(file, 2 * 1024 * 1024))
        .slice(-keepLines)
        .map(l => JSON.stringify(l));
      writeFileSync(file, lines.length ? lines.join("\n") + "\n" : "");
    }
    appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[persist] append failed (continuing in-memory):", err instanceof Error ? err.message : err);
  }
}

export function dataFile(name: string): string {
  return path.join(config.dataDir, name);
}
