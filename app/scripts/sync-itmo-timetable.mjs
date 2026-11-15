// Runs only in a trusted Actions environment. Writes one allowlisted public snapshot; never a git commit.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { campusDate, dateRange, importPersonalTimetable, parseLiveTimetable, shiftDate } from '../classic/live-timetable.js';
import { decryptSession, encryptSession, findSessionArtifact, sessionPrefix, validToken } from './itmo-session.mjs';

const TOKEN_URL = 'https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/token';
const SCHEDULE_URL = 'https://my.itmo.ru/api/schedule/schedule/personal';
const fail = (message) => { throw new Error(message); };

export async function renewSession({ refreshToken, request = fetch, mask = () => {}, reportLifetime = () => {} }) {
  if (!validToken(refreshToken) || /^Bearer /i.test(refreshToken)) fail('ITMO_REFRESH_TOKEN must contain a raw refresh token.');
  const tokenResponse = await request(TOKEN_URL, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'student-personal-cabinet', refresh_token: refreshToken }),
  });
  if (!tokenResponse.ok) fail('ITMO session could not be renewed. Replace ITMO_REFRESH_TOKEN using a fresh official login.');
  let tokens;
  try { tokens = await tokenResponse.json(); } catch { fail('ITMO token response was invalid; a fresh login may be needed.'); }
  // Mask all newly returned token values, including values in a malformed response, before validation.
  for (const key of ['access_token', 'refresh_token', 'id_token']) if (validToken(tokens?.[key])) mask(tokens[key]);
  if (tokens?.refresh_token !== undefined && !validToken(tokens.refresh_token)) fail('Invalid replacement refresh token; a fresh login may be needed.');
  const seconds = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
  reportLifetime({ accessSeconds: seconds(tokens?.expires_in), refreshSeconds: seconds(tokens?.refresh_expires_in) });
  // Preserve a valid rotated refresh token even if the access-token response is malformed.
  return { refreshToken: tokens?.refresh_token || refreshToken,
    accessToken: validToken(tokens?.access_token) && (!tokens.token_type || String(tokens.token_type).toLowerCase() === 'bearer') ? tokens.access_token : null };
}

export async function fetchTimetable({ accessToken, request = fetch, now = new Date(), previous = null, reference = [] }) {
  if (!validToken(accessToken)) fail('Invalid access-token response. The renewed session was saved; retry the workflow.');
  const today = campusDate(now), from = shiftDate(today, -7), to = shiftDate(today, 41), dates = dateRange(from, to), chunks = [];
  for (let i = 0; i < dates.length; i += 7) {
    const part = dates.slice(i, i + 7), url = new URL(SCHEDULE_URL);
    url.searchParams.set('date_start', part[0]); url.searchParams.set('date_end', part.at(-1));
    const response = await request(url, {
      redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Accept-Language': 'ru' },
    });
    if (!response.ok) fail('Timetable request failed; the previous published timetable remains in place.');
    let payload;
    try { payload = await response.json(); } catch { fail('Timetable response was invalid JSON.'); }
    // Validate each requested chunk as well as the entire range; shifted coverage must not pass by accident.
    const returned = payload?.data?.map?.((day) => day?.date);
    if (!Array.isArray(returned) || returned.length !== part.length || part.some((date) => !returned.includes(date))) fail('Incomplete timetable response; publication stopped.');
    chunks.push(payload);
  }
  return importPersonalTimetable(chunks, from, to, now.toISOString(), previous, reference);
}

function writeAtomic(path, contents) {
  const output = resolve(path), temporary = `${output}.new`;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(temporary, contents, { mode: 0o600 });
  renameSync(temporary, output);
}

async function main() {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== 'true') fail('Run this credentialed importer in its GitHub Actions environment, not an interactive shell.');
  const repository = env.GITHUB_REPOSITORY, seed = env.ITMO_REFRESH_TOKEN, mode = process.argv[2];
  const prefix = sessionPrefix(seed, repository);
  const mask = (token) => { if (validToken(token)) process.stdout.write(`::add-mask::${token}\n`); };
  if (mode === 'locate') {
    if (!env.GITHUB_TOKEN || !env.GITHUB_OUTPUT || !/^\d+$/.test(env.GITHUB_RUN_ID) || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT)) fail('Invalid session artifact configuration.');
    const artifact = await findSessionArtifact({ seed, repository, githubToken: env.GITHUB_TOKEN });
    // IDs and a keyed artifact identity are public metadata, never token values.
    appendFileSync(env.GITHUB_OUTPUT, `artifact-id=${artifact?.id || ''}\nrun-id=${artifact?.workflow_run.id || ''}\nname=${prefix}${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}\n`);
    console.log(artifact ? 'Encrypted session checkpoint located.' : 'No checkpoint for this secret; starting the supplied ITMO session.');
    return;
  }
  if (!env.ITMO_SESSION_FILE) fail('ITMO_SESSION_FILE path is missing.');
  if (mode === 'renew') {
    if (env.ITMO_EXPECT_SESSION === 'true' && !existsSync(env.ITMO_SESSION_FILE)) fail('Saved ITMO session is missing; no refresh token was consumed.');
    const saved = existsSync(env.ITMO_SESSION_FILE) ? decryptSession(readFileSync(env.ITMO_SESSION_FILE, 'utf8'), seed, repository) : null;
    mask(saved?.refreshToken); mask(saved?.accessToken);
    let lifetime;
    const renewed = await renewSession({ refreshToken: saved?.refreshToken || seed, mask, reportLifetime: (value) => { lifetime = value; } });
    writeAtomic(env.ITMO_SESSION_FILE, encryptSession(renewed, seed, repository));
    console.log(`ITMO token lifetimes in seconds: access=${lifetime.accessSeconds ?? 'not provided'}, refresh=${lifetime.refreshSeconds ?? 'not provided'}.`);
    console.log('ITMO session renewed and encrypted. Upload this checkpoint before requesting timetable data.');
    return;
  }
  if (mode !== 'fetch') fail('Invalid session command. Use locate, renew, or fetch.');
  if (!env.ITMO_TIMETABLE_FILE) fail('ITMO_TIMETABLE_FILE output path is missing.');
  const session = decryptSession(readFileSync(env.ITMO_SESSION_FILE, 'utf8'), seed, repository);
  mask(session.refreshToken); mask(session.accessToken);
  let previous = null;
  const published = `https://${repository.split('/')[0].toLowerCase()}.github.io/${repository.split('/')[1]}/data/timetable-live.json`;
  try {
    const response = await fetch(published, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.ok) previous = parseLiveTimetable(await response.json());
  } catch { /* The first deployment has no public snapshot; malformed old data is not trusted. */ }
  const groupReference = JSON.parse(readFileSync(new URL('../../data/schedule.json', import.meta.url), 'utf8'));
  if (!Array.isArray(groupReference.cycle) || groupReference.cycle.length !== 14) fail('Timetable: invalid group reference schedule.');
  const snapshot = await fetchTimetable({ accessToken: session.accessToken, previous, reference: groupReference.cycle.flat() });
  writeAtomic(env.ITMO_TIMETABLE_FILE, JSON.stringify(snapshot));
  console.log(`My ITMO: ${Object.keys(snapshot.days).length} complete days; ${Object.values(snapshot.days).flat().length} shared lessons. Public snapshot ready.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Only our fixed error messages reach logs, never a fetch/JSON exception or upstream body.
    const message = error instanceof Error && /^(ITMO_|ITMO session|ITMO token|Could not read encrypted|Saved ITMO session|Too many session|Timetable:|Timetable request|Timetable response|Incomplete timetable|Invalid |Run this)/.test(error.message)
      ? error.message : 'Timetable synchronization failed; the last published data is unchanged.';
    console.error(message); process.exitCode = 1;
  });
}
