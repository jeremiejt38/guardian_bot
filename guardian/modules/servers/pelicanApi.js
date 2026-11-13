// Client minimal pour l'API Pelican Panel.
// PELICAN_URL (ex: http://127.0.0.1:8083), PELICAN_APP_KEY (application), PELICAN_CLIENT_KEY (client).

const BASE = () => (process.env.PELICAN_URL || '').replace(/\/$/, '');
const APP_KEY = () => process.env.PELICAN_APP_KEY || '';
const CLIENT_KEY = () => process.env.PELICAN_CLIENT_KEY || '';

const isConfigured = () => !!(BASE() && APP_KEY() && CLIENT_KEY());

async function req(path, { key = APP_KEY(), method = 'GET', body } = {}) {
  const r = await fetch(`${BASE()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Pelican ${path} -> ${r.status}`);
  return data;
}

const listServers = () => req('/api/application/servers?per_page=50')
  .then((d) => (d?.data || []).map((s) => ({
    id: s.attributes.id,
    identifier: s.attributes.identifier,
    name: s.attributes.name,
    suspended: !!s.attributes.suspended,
  })));

const getResources = (identifier) =>
  req(`/api/client/servers/${identifier}/resources`, { key: CLIENT_KEY() })
    .then((d) => d?.attributes || {});

const listFiles = (identifier, dir = '/') =>
  req(`/api/client/servers/${identifier}/files/list?directory=${encodeURIComponent(dir)}`, { key: CLIENT_KEY() })
    .then((d) => d?.data || []);

const getFileContents = (identifier, file) =>
  fetch(`${BASE()}/api/client/servers/${identifier}/files/contents?file=${encodeURIComponent(file)}`, {
    headers: { Authorization: `Bearer ${CLIENT_KEY()}`, Accept: 'text/plain' },
    signal: AbortSignal.timeout(8000),
  }).then((r) => (r.ok ? r.text() : null));

const power = (identifier, signal) =>
  req(`/api/client/servers/${identifier}/power`, {
    key: CLIENT_KEY(), method: 'POST', body: { signal },
  });

const VALID_SIGNALS = new Set(['start', 'stop', 'restart', 'kill']);

module.exports = { isConfigured, listServers, getResources, listFiles, getFileContents, power, VALID_SIGNALS };
