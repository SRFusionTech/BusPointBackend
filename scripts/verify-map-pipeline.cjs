/**
 * Smoke-check the tracking/map pipeline prerequisites (local backend).
 * Usage: node scripts/verify-map-pipeline.mjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}

function get(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolve({ status: res.statusCode || 0, body, headers: res.headers }),
      );
    });
    req.on('error', (err) => resolve({ status: 0, body: String(err.message), headers: {} }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: 'timeout', headers: {} });
    });
  });
}

async function main() {
  const backendEnv = path.join(__dirname, '..', '.env');
  const mobileEnv = path.join(__dirname, '..', '..', 'mobile', '.env');
  loadEnvFile(backendEnv);
  loadEnvFile(mobileEnv);

  const failures = [];
  console.log('\n── Map pipeline verification ──\n');

  // 1) Local API
  const api = await get('http://127.0.0.1:3000/api');
  const apiOk = api.status === 401 || api.status === 200;
  console.log(
    apiOk
      ? `OK  Backend /api reachable (HTTP ${api.status})`
      : `FAIL Backend /api not healthy (HTTP ${api.status}: ${api.body.slice(0, 120)})`,
  );
  if (!apiOk) failures.push('Backend not running on :3000');

  // 2) Must not be dead Railway host
  const mobileUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
  console.log(`INFO Mobile EXPO_PUBLIC_BACKEND_URL=${mobileUrl || '(unset)'}`);
  if (mobileUrl.includes('hospitable-determination-production')) {
    failures.push('Mobile still points at dead Railway host');
    console.log('FAIL Dead Railway URL in mobile/.env');
  } else if (!mobileUrl) {
    failures.push('EXPO_PUBLIC_BACKEND_URL unset');
  } else if (mobileUrl.includes('10.0.2.2') || mobileUrl.includes('192.168.') || mobileUrl.includes('localhost')) {
    console.log('OK  Mobile URL looks like local/emulator/LAN');
  } else {
    console.log('WARN Mobile URL is remote — OK for prod testing');
  }

  // 3) Maps keys present in mobile env
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY || '';
  if (androidKey || iosKey) {
    console.log('OK  Google Maps key(s) present in mobile/.env');
  } else {
    failures.push('Missing GOOGLE_MAPS_ANDROID_API_KEY / GOOGLE_MAPS_IOS_API_KEY');
    console.log('FAIL No Maps keys in mobile/.env');
  }

  // 4) JWT secret for local
  if (process.env.JWT_SECRET) {
    console.log('OK  JWT_SECRET set in backend .env');
  } else {
    failures.push('JWT_SECRET missing');
    console.log('FAIL JWT_SECRET missing');
  }

  console.log('\n── Manual runtime steps (cannot automate without driver JWT) ──');
  console.log('1. School admin: school lat/lng → route with stops → bus.routeId → parent busId+routeStopId → driver on bus');
  console.log('2. Driver app: Always location → Start trip (emulator: set Extended Controls GPS away from SF mock coords)');
  console.log('3. Confirm POST /api/tracking/location in backend logs');
  console.log('4. Parent app: bus marker moves; pickup/school pins; polyline if Directions API enabled on the key');

  console.log('\n── Summary ──');
  if (failures.length === 0) {
    console.log('PASS: Automated prerequisites OK. Complete manual steps above for live map.');
  } else {
    console.log(`FAIL: ${failures.length} issue(s):`);
    for (const f of failures) console.log(`  • ${f}`);
    process.exitCode = 2;
  }
}

main();
