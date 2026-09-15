import fs from 'node:fs';

const checks = [];
const add = (name, ok, detail='') => checks.push({name, ok, detail});
const read = (p) => fs.readFileSync(p, 'utf8');

const webhook = read('src/routes/api/public/telegram/webhook.ts');
const contentFns = read('src/lib/content.functions.ts');
const contentServer = read('src/lib/content.server.ts');
const fulfillment = read('src/lib/fulfillment.server.ts');
const adminFns = read('src/lib/admin.functions.ts');
const migration = read('supabase/migrations/20260915000100_content_commerce_scaffold.sql');

add('Content-Migration vorhanden', migration.includes('CREATE TABLE IF NOT EXISTS public.content_sets'));
add('Entitlement eindeutig pro Fan+Set', migration.includes('content_access_user_set_uidx'));
add('Shop-Deep-Link c_<set>', contentFns.includes('?start=c_${set.id}'));
add('Telegram Stars / XTR', webhook.includes('currency: "XTR"'));
add('TON-Zahlpfad', webhook.includes('callback_data: `ton_${p.id}`') && webhook.includes('currency: "ton"'));
add('TRX-Zahlpfad', webhook.includes('callback_data: `trx_${p.id}`') && webhook.includes('currency: "trx"'));
add('Krypto-Freigabe nur durch Admin', adminFns.includes('confirmCryptoPurchase') && adminFns.includes('admin-confirmed'));
add('Pre-Checkout bestätigt', webhook.includes('answerPreCheckoutQuery'));
add('Successful-Payment Handler', webhook.includes('successful_payment'));
add('Charge-Idempotenz', webhook.includes('telegram_charge_id') && webhook.includes('duplicate: true'));
add('Meine Inhalte', webhook.includes('Meine Inhalte') && webhook.includes('content_${r.content_sets.id}'));
add('Content-Deep-Link Handler', webhook.includes('payload?.startsWith("c_")'));
add('Content-Freischaltung', contentServer.includes('grantContentAccess'));
add('Direkte Telegram-Auslieferung', contentServer.includes('deliverContentSet') && contentServer.includes('sendMediaGroup'));
add('Bundle-Freischaltung', fulfillment.includes('source: "bundle"'));
add('1-Star-Smoke-Test', contentFns.includes('CONTENT_SMOKE_TITLE') && contentFns.includes('price_stars: 1'));
add('Shop-Chat konfigurierbar', contentFns.includes('shop_chat_id'));

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
const failed = checks.filter(c => !c.ok);
console.log(`\nContent Live Smoke Preflight: ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
