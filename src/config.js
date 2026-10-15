import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {
  // .env é opcional
}

function deepMerge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return override ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function loadConfig() {
  const example = JSON.parse(readFileSync(join(ROOT, 'config.example.json'), 'utf8'));
  const userPath = join(ROOT, 'config.json');
  const user = existsSync(userPath) ? JSON.parse(readFileSync(userPath, 'utf8')) : {};
  return deepMerge(example, user);
}

export const env = {
  placesKey: process.env.GOOGLE_PLACES_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  ownerWhatsapp: (process.env.OWNER_WHATSAPP || '').replace(/\D/g, ''),
  waToken: process.env.WHATSAPP_TOKEN || '',
  waPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  waVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  waAppSecret: process.env.WHATSAPP_APP_SECRET || '',
};
