// One-off: fetch the competition requirements and this account's referral code.
// Reads the API key from ~/.makefun/credentials and never prints it.
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const creds = JSON.parse(readFileSync(join(homedir(), '.makefun', 'credentials'), 'utf8'));
const key = creds.keys?.['https://make.fun']?.key ?? '';
if (!key) { process.stderr.write('no api key in credentials\n'); process.exit(1); }

const req = await fetch('https://make.fun/api/competitions/token-radar-01/requirements', { headers: { Authorization: `Bearer ${key}` } });
const reqJson = await req.json();
writeFileSync('/tmp/req-token-radar.json', JSON.stringify(reqJson, null, 2));
console.log('requirements status', req.status, 'keys:', Object.keys(reqJson).join(', '));

// Referral code: try the account endpoint; if it fails, report and stop.
const me = await fetch('https://make.fun/api/account', { headers: { Authorization: `Bearer ${key}` } });
console.log('account status', me.status);
if (me.ok) {
  const meJson = await me.json();
  writeFileSync('/tmp/me-token-radar.json', JSON.stringify(meJson, null, 2));
  console.log('account keys:', Object.keys(meJson).join(', '));
  if (meJson.referral_code) console.log('referral code present in account response');
}
