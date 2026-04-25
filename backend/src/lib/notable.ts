// Loads the curated notable-users list once at startup.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

interface NotableEntry {
  login: string;
  ecosystems: string[];
}

const here = path.dirname(url.fileURLToPath(import.meta.url));
const configPath = path.resolve(here, '..', '..', 'config', 'notable-users.json');
const raw = readFileSync(configPath, 'utf8');
const list = JSON.parse(raw) as NotableEntry[];

const byLogin = new Map<string, NotableEntry>();
for (const entry of list) byLogin.set(entry.login.toLowerCase(), entry);

export function isNotable(login: string): boolean {
  return byLogin.has(login.toLowerCase());
}

export function notableEcosystems(login: string): string[] {
  return byLogin.get(login.toLowerCase())?.ecosystems ?? [];
}

export function notableMatchesLanguage(login: string, language: string | null): boolean {
  if (!language) return false;
  const entry = byLogin.get(login.toLowerCase());
  if (!entry) return false;
  return entry.ecosystems.some((e) => e.toLowerCase() === language.toLowerCase());
}
