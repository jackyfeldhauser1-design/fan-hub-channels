import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const useNetwork = args.has('--network');

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const fileEnv = parseEnvFile(path.join(root, '.env'));
const env = { ...fileEnv, ...process.env };
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
const expectedRef = /project_id\s*=\s*["']([^"']+)["']/.exec(config)?.[1] ?? '';
const urlRef = /https?:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(env.SUPABASE_URL ?? '')?.[1] ?? '';
const configuredRef = String(env.SUPABASE_PROJECT_ID ?? '').replace(/^['"]|['"]$/g, '') || urlRef;

const checks = [];
const add = (level, name, detail) => checks.push({ level, name, detail });
const exists = (p) => fs.existsSync(path.join(root, p));

if (!expectedRef) add('FAIL', 'Supabase-Projekt', 'supabase/config.toml enthält keine project_id.');
else if (!configuredRef) add('WARN', 'Supabase-Projekt', `Erwartet ${expectedRef}; keine .env geladen.`);
else if (configuredRef !== expectedRef && urlRef !== expectedRef) add('FAIL', 'Supabase-Projekt', `Falsches Projekt konfiguriert: ${configuredRef}; erwartet ${expectedRef}.`);
else add('PASS', 'Supabase-Projekt', `Projekt-Ref stimmt: ${expectedRef}.`);

for (const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']) {
  add(env[key] ? 'PASS' : 'WARN', key, env[key] ? 'gesetzt' : 'nicht gesetzt');
}
add(env.SUPABASE_SERVICE_ROLE_KEY ? 'PASS' : 'WARN', 'SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY ? 'gesetzt' : 'für Serverbetrieb erforderlich; in Managed Hosting ggf. injiziert');

if (String(env.ADMIN_BOOTSTRAP_ENABLED ?? 'false').toLowerCase() === 'true') {
  add('WARN', 'Admin-Bootstrap', 'aktiv – nach dem ersten Admin unbedingt wieder deaktivieren.');
} else {
  add('PASS', 'Admin-Bootstrap', 'deaktiviert.');
}

add(exists('supabase/migrations/20260915000100_content_commerce_scaffold.sql') ? 'PASS' : 'FAIL', 'Content-Migration', '20260915000100_content_commerce_scaffold.sql');
add(exists('src/routes/content.tsx') ? 'PASS' : 'FAIL', 'Content Studio', 'Route /content vorhanden');
add(exists('src/lib/content.server.ts') ? 'PASS' : 'FAIL', 'Content-Auslieferung', 'Serverlogik vorhanden');
add(exists('src/lib/crypto-verification.server.ts') ? 'PASS' : 'FAIL', 'Crypto-Verifikation', 'TON/TRX Auto-Prüfung vorhanden');

const telegramAdmin = fs.readFileSync(path.join(root, 'src/lib/admin.functions.ts'), 'utf8');
add(
  telegramAdmin.includes('currentWebhookSecret') ? 'PASS' : 'FAIL',
  'Telegram Webhook-Secret',
  telegramAdmin.includes('currentWebhookSecret')
    ? 'Registrierung und Prüfung nutzen dieselbe Secret-Quelle.'
    : 'Webhook-Registrierung nutzt nicht currentWebhookSecret().',
);
add(
  /allowed_updates:[\s\S]*my_chat_member/.test(telegramAdmin) ? 'PASS' : 'FAIL',
  'Telegram Gruppen-Setup',
  /allowed_updates:[\s\S]*my_chat_member/.test(telegramAdmin)
    ? 'my_chat_member wird angefordert.'
    : 'my_chat_member fehlt in allowed_updates.',
);

const auth = fs.readFileSync(path.join(root, 'src/routes/auth.tsx'), 'utf8');
add(/signUp\s*\(/.test(auth) ? 'FAIL' : 'PASS', 'Kundenregistrierung', /signUp\s*\(/.test(auth) ? 'öffentliche signUp-Logik gefunden' : 'keine öffentliche Registrierung im Board');

const konto = fs.readFileSync(path.join(root, 'src/routes/konto.tsx'), 'utf8');
add(/ausschließlich über den Telegram-Bot/i.test(konto) ? 'PASS' : 'WARN', 'Kunden-Webkonto', 'Web-Kundenbereich ist deaktiviert und verweist auf Telegram');

if (useNetwork && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
  try {
    const res = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(8000) });
    add(res.ok || res.status === 404 ? 'PASS' : 'WARN', 'Supabase-Netzwerk', `HTTP ${res.status}`);
  } catch (e) {
    add('FAIL', 'Supabase-Netzwerk', e instanceof Error ? e.message : String(e));
  }
}

for (const c of checks) console.log(`${c.level.padEnd(4)}  ${c.name}: ${c.detail}`);
const fails = checks.filter((c) => c.level === 'FAIL').length;
const warns = checks.filter((c) => c.level === 'WARN').length;
console.log(`\nPreflight: ${checks.length - fails - warns} PASS · ${warns} WARN · ${fails} FAIL`);
process.exitCode = fails ? 1 : 0;
