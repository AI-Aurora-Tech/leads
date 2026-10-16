import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pasta fixa dos dados (~/AuroraLeads): fica FORA da pasta do robô, então baixar uma versão nova
 * não apaga o histórico de leads, os contatados, a chave do Google nem a sessão do WhatsApp.
 */
export const DATA_DIR = process.env.LEADS_DATA_DIR || join(homedir(), 'AuroraLeads');

// O primeiro arquivo vence: o .env da pasta de dados (permanente) tem prioridade
for (const file of [join(DATA_DIR, '.env'), join(ROOT, '.env')]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // .env é opcional
  }
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
  // config.json na pasta de dados vale para todas as versões; o da pasta do robô tem prioridade
  let config = example;
  for (const userPath of [join(DATA_DIR, 'config.json'), join(ROOT, 'config.json')]) {
    if (existsSync(userPath)) config = deepMerge(config, JSON.parse(readFileSync(userPath, 'utf8')));
  }
  return config;
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
