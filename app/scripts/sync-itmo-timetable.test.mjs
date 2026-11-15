import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTimetable, renewSession } from './sync-itmo-timetable.mjs';
import { decryptSession, encryptSession, findSessionArtifact, sessionPrefix } from './itmo-session.mjs';
import { dateRange } from '../classic/live-timetable.js';

const REFRESH = 'refresh-token-private-value-123456789', ACCESS = 'access-token-private-value-123456789', NEXT = 'new-refresh-private-value-123456789';
const REPO = 'RedstoneLord/itmo-m3102', SESSION = { refreshToken: NEXT, accessToken: ACCESS };
const reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const academic = { pair_id: 1, subject: 'Дискретная математика', group: 'ДМ 1.2(M3102)', work_type_id: 2, time_start: '13:30', time_end: '15:00' };
const renewOptions = (extra = {}) => ({ refreshToken: REFRESH, request: async (input, init) => {
  assert.equal(String(input), 'https://id.itmo.ru/auth/realms/itmo/protocol/openid-connect/token');
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
  assert.equal(init.body.get('refresh_token'), REFRESH); assert.equal(init.body.get('client_id'), 'student-personal-cabinet');
  return reply({ access_token: ACCESS, refresh_token: NEXT, token_type: 'Bearer' });
}, ...extra });
const fetchOptions = (extra = {}) => ({ accessToken: ACCESS, now: new Date('2026-11-15T09:00:00Z'), request: async (input, init) => {
  const url = new URL(input);
  assert.equal(url.pathname, '/api/schedule/schedule/personal');
  assert.equal(init.headers.Authorization, `Bearer ${ACCESS}`);
  return reply({ code: 0, data: dateRange(url.searchParams.get('date_start'), url.searchParams.get('date_end')).map((date, i) => ({ date, lessons: i === 0 ? [{ ...academic, pair_id: Number(date.replaceAll('-', '')) }] : [] })) });
}, ...extra });

test('renewal masks all returned tokens and returns a session for encrypted checkpointing', async () => {
  const masks = [];
  assert.deepEqual(await renewSession(renewOptions({ mask: (token) => masks.push(token) })), SESSION);
  assert.deepEqual(masks, [ACCESS, NEXT]);
});
test('seven chunks produce 49 complete public days without credentials', async () => {
  const snapshot = await fetchTimetable(fetchOptions());
  assert.equal(Object.keys(snapshot.days).length, 49);
  for (const token of [REFRESH, ACCESS, NEXT]) assert.equal(JSON.stringify(snapshot).includes(token), false);
});
test('incomplete data stops publication without needing another token renewal', async () => {
  await assert.rejects(fetchTimetable(fetchOptions({ request: async () => reply({ code: 0, data: [] }) })), /Incomplete/);
});
test('authentication errors do not expose upstream error bodies', async () => {
  await assert.rejects(renewSession(renewOptions({ request: async () => reply({ error_description: REFRESH }, 400) })), (error) => /fresh official login/.test(error.message) && !error.message.includes(REFRESH));
});
test('malformed access response still preserves a valid replacement refresh token', async () => {
  const state = await renewSession(renewOptions({ request: async () => reply({ access_token: 'bad', refresh_token: NEXT }) }));
  assert.deepEqual(state, { refreshToken: NEXT, accessToken: null });
  assert.deepEqual(decryptSession(encryptSession(state, REFRESH, REPO), REFRESH, REPO), state);
  await assert.rejects(fetchTimetable(fetchOptions({ accessToken: state.accessToken })), /renewed session was saved/);
});
test('a nonrotating renewal retains the current refresh token', async () => {
  const state = await renewSession(renewOptions({ request: async () => reply({ access_token: ACCESS }) }));
  assert.equal(state.refreshToken, REFRESH);
});
test('lifetime diagnostics allow only numeric durations, never arbitrary response strings', async () => {
  for (const [refreshExpiresIn, expected] of [[1800, 1800], [NEXT, null], [-1, null]]) {
    let lifetime;
    await renewSession(renewOptions({ request: async () => reply({ access_token: ACCESS, refresh_token: NEXT, expires_in: 300, refresh_expires_in: refreshExpiresIn }), reportLifetime: (value) => { lifetime = value; } }));
    assert.deepEqual(lifetime, { accessSeconds: 300, refreshSeconds: expected });
    assert.equal(JSON.stringify(lifetime).includes(NEXT), false);
  }
});
test('ciphertext contains no token values and authenticated encryption round-trips', () => {
  const encoded = encryptSession(SESSION, REFRESH, REPO);
  for (const token of [REFRESH, ACCESS, NEXT]) assert.equal(encoded.includes(token), false);
  assert.deepEqual(decryptSession(encoded, REFRESH, REPO), SESSION);
  assert.notEqual(encoded, encryptSession(SESSION, REFRESH, REPO));
});
test('wrong seed, wrong repository and modified ciphertext fail closed', () => {
  const encoded = encryptSession(SESSION, REFRESH, REPO), altered = JSON.parse(encoded);
  const data = Buffer.from(altered.data, 'base64'); data[0] ^= 1; altered.data = data.toString('base64');
  for (const [value, seed, repo] of [[encoded, NEXT, REPO], [encoded, REFRESH, 'other/repository'], [JSON.stringify(altered), REFRESH, REPO], ['{}', REFRESH, REPO]]) {
    assert.throws(() => decryptSession(value, seed, repo), (error) => /could not be decrypted/.test(error.message) && !error.message.includes(REFRESH));
  }
});
test('two successive runs restore rotation while keeping the bootstrap secret unchanged', async () => {
  const first = await renewSession(renewOptions());
  const checkpoint = encryptSession(first, REFRESH, REPO);
  const restored = decryptSession(checkpoint, REFRESH, REPO);
  const second = await renewSession({ refreshToken: restored.refreshToken, request: async (_url, init) => {
    assert.equal(init.body.get('refresh_token'), NEXT);
    return reply({ access_token: ACCESS, refresh_token: `${NEXT}-second` });
  } });
  assert.equal(decryptSession(encryptSession(second, REFRESH, REPO), REFRESH, REPO).refreshToken, `${NEXT}-second`);
});

const artifact = (id, extra = {}) => ({ id, name: `${sessionPrefix(REFRESH, REPO)}${id}-1`, expired: false, workflow_run: { id, head_branch: 'master' }, ...extra });
const locateOptions = (request) => ({ seed: REFRESH, repository: REPO, githubToken: 'synthetic-github-token', request });
test('finds newest checkpoint across pages, including one saved before a later run failure', async () => {
  const requests = [];
  const found = await findSessionArtifact(locateOptions(async (url, init) => {
    requests.push(url); assert.equal(init.headers.Authorization, 'Bearer synthetic-github-token');
    if (requests.length === 1) return reply({ artifacts: [artifact(10)] }, 200, { link: '<https://api.github.com/unused>; rel="next"' });
    return reply({ artifacts: [artifact(40, { workflow_run: { id: 40, head_branch: 'master', conclusion: 'failure' } }), artifact(30)] });
  }));
  assert.equal(found.id, 40); assert.equal(requests.length, 2);
});
test('expired artifacts, other seeds and other branches do not override the current session', async () => {
  const other = `${sessionPrefix(NEXT, REPO)}200-1`;
  const found = await findSessionArtifact(locateOptions(async () => reply({ artifacts: [artifact(10), artifact(100, { expired: true }), artifact(200, { name: other }), artifact(300, { workflow_run: { id: 300, head_branch: 'feature' } })] })));
  assert.equal(found.id, 10);
});
test('changing the bootstrap secret starts a new checkpoint lineage', async () => {
  assert.notEqual(sessionPrefix(REFRESH, REPO), sessionPrefix(NEXT, REPO));
  const found = await findSessionArtifact({ ...locateOptions(async () => reply({ artifacts: [artifact(10)] })), seed: NEXT });
  assert.equal(found, null);
});
test('artifact read failure and malformed listing fail without consuming a university token', async () => {
  for (const response of [reply({ message: REFRESH }, 403), reply({ artifacts: null })]) {
    await assert.rejects(findSessionArtifact(locateOptions(async () => response)), (error) => /no ITMO token was consumed/.test(error.message) && !error.message.includes(REFRESH));
  }
});

test('CLI renewal writes only ciphertext; later fetch failure preserves that checkpoint for the next renewal', () => {
  const directory = mkdtempSync(join(tmpdir(), 'itmo-session-test-'));
  try {
    const sessionFile = join(directory, 'session.json.enc'), publicFile = join(directory, 'timetable-live.json');
    const cli = fileURLToPath(new URL('./sync-itmo-timetable.mjs', import.meta.url));
    const run = (mode, expected, replacement) => {
      // Synthetic fixtures only. Real credentials are never handled by this test.
      const preload = `globalThis.fetch = async (url, init) => {
        if (init?.method === 'POST') {
          if (init.body.get('refresh_token') !== process.env.TEST_EXPECTED) throw new Error('wrong token');
          return new Response(JSON.stringify({ access_token: process.env.TEST_ACCESS, refresh_token: process.env.TEST_NEXT }));
        }
        return new Response('{}', { status: 503 });
      };`;
      const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: REPO,
          ITMO_REFRESH_TOKEN: REFRESH, ITMO_SESSION_FILE: sessionFile, ITMO_TIMETABLE_FILE: publicFile,
          TEST_EXPECTED: expected, TEST_NEXT: replacement, TEST_ACCESS: ACCESS };
      delete env.NODE_TEST_CONTEXT; // Run the real CLI, outside Node's test-worker output protocol.
      return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, cli, mode], { encoding: 'utf8', env });
    };
    assert.equal(run('renew', REFRESH, NEXT).status, 0);
    const checkpoint = readFileSync(sessionFile, 'utf8');
    assert.equal(checkpoint.includes(NEXT), false);
    assert.equal(decryptSession(checkpoint, REFRESH, REPO).refreshToken, NEXT);
    const failed = run('fetch', '', '');
    assert.equal(failed.status, 1); assert.equal(existsSync(publicFile), false);
    assert.equal(readFileSync(sessionFile, 'utf8'), checkpoint);
    assert.equal(run('renew', NEXT, `${NEXT}-second`).status, 0);
    assert.equal(decryptSession(readFileSync(sessionFile, 'utf8'), REFRESH, REPO).refreshToken, `${NEXT}-second`);
    writeFileSync(sessionFile, '{}');
    const corrupt = run('renew', REFRESH, NEXT);
    assert.equal(corrupt.status, 1);
    assert.equal(readFileSync(sessionFile, 'utf8'), '{}'); // No fallback that consumes the original seed.
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
