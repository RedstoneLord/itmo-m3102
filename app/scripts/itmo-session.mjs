// Only encrypted session state may be written to disk or uploaded as an Actions artifact.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const fail = (message) => { throw new Error(message); };
export const validToken = (value) => typeof value === 'string' && value.length > 20 && value.length < 20000 && !/\s/.test(value);

function key(seed, repository) {
  if (!validToken(seed)) fail('ITMO_REFRESH_TOKEN must contain a raw refresh token.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) fail('Invalid session repository.');
  return Buffer.from(hkdfSync('sha256', seed, 'itmo-timetable/session/v1', repository.toLowerCase(), 32));
}

export function sessionPrefix(seed, repository) {
  const id = createHmac('sha256', key(seed, repository)).update('artifact identity').digest('hex').slice(0, 32);
  return `itmo-session-v1-${id}-`;
}

function checkedSession(value) {
  if (!validToken(value?.refreshToken) || !(value.accessToken === null || validToken(value.accessToken))) fail('Invalid saved ITMO session.');
  return { refreshToken: value.refreshToken, accessToken: value.accessToken };
}

export function encryptSession(session, seed, repository) {
  const checked = checkedSession(session);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(seed, repository), iv);
  cipher.setAAD(Buffer.from(`itmo-timetable/session/v1:${repository.toLowerCase()}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(checked), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}

export function decryptSession(encrypted, seed, repository) {
  try {
    if (typeof encrypted !== 'string' || encrypted.length > 128 * 1024) throw new Error();
    const value = JSON.parse(encrypted), iv = Buffer.from(value.iv, 'base64'), tag = Buffer.from(value.tag, 'base64');
    if (value.version !== 1 || iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key(seed, repository), iv);
    decipher.setAAD(Buffer.from(`itmo-timetable/session/v1:${repository.toLowerCase()}`));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
    return checkedSession(JSON.parse(plaintext.toString('utf8')));
  } catch { fail('Saved ITMO session could not be decrypted. Restore the original secret or reseed ITMO_REFRESH_TOKEN with a fresh official login.'); }
}

export async function findSessionArtifact({ seed, repository, githubToken, request = fetch }) {
  const prefix = sessionPrefix(seed, repository);
  let latest = null;
  // Paginate instead of assuming response order; a checkpoint from a subsequently failed run is still authoritative.
  for (let page = 1; page <= 100; page++) {
    const response = await request(`https://api.github.com/repos/${repository}/actions/artifacts?per_page=100&page=${page}`, {
      redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${githubToken}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) fail('Could not read encrypted ITMO session artifacts. Check Actions read permission; no ITMO token was consumed.');
    let payload;
    try { payload = await response.json(); } catch { fail('Invalid session artifact listing; no ITMO token was consumed.'); }
    if (!Array.isArray(payload.artifacts)) fail('Invalid session artifact listing; no ITMO token was consumed.');
    for (const artifact of payload.artifacts) {
      const suffix = typeof artifact.name === 'string' && artifact.name.startsWith(prefix) ? artifact.name.slice(prefix.length) : '';
      if (!/^\d+-\d+$/.test(suffix) || artifact.expired || artifact.workflow_run?.head_branch !== 'master') continue;
      if (!Number.isSafeInteger(artifact.id) || !Number.isSafeInteger(artifact.workflow_run?.id)) fail('Invalid session artifact listing; no ITMO token was consumed.');
      if (!latest || artifact.id > latest.id) latest = artifact;
    }
    if (!response.headers.get('link')?.includes('rel="next"')) return latest;
  }
  fail('Too many session artifacts to search safely; no ITMO token was consumed.');
}
