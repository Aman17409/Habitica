/*
 * sync.js — Google Drive sync for the habit tracker.
 *
 * Data lives in ONE JSON file inside the user's Drive "app data folder"
 * (a hidden, app-specific area). The scope used, drive.appdata, is a
 * non-sensitive scope, so no Google verification review is needed for
 * personal use. Only the public OAuth client ID appears in this code —
 * there is no client secret anywhere, which is what makes it safe to
 * ship in a public GitHub Pages repo.
 *
 * Flow on sync():
 *   1. pull the remote file (if any)
 *   2. merge it with the local state (union of ticks — see store.js)
 *   3. push the merged result back
 *
 * The access token is kept in memory and sessionStorage only; it is never
 * written to disk or committed anywhere.
 */

import { CLIENT_ID } from './config.js';
import { mergeStates, saveLocal } from './store.js';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'habit-tracker.json';
const TOKEN_KEY = 'habit-tracker-token';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0; // ms epoch

/* ---------- configuration ---------- */

export function isConfigured() {
  return Boolean(CLIENT_ID) && !CLIENT_ID.includes('PASTE_YOUR');
}

/* ---------- token handling ---------- */

function loadCachedToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return;
    const t = JSON.parse(raw);
    if (t && t.expiry > Date.now() + 60000) {
      accessToken = t.token;
      tokenExpiry = t.expiry;
    }
  } catch (_) { /* ignore */ }
}

function cacheToken(token, expiresIn) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresIn || 3600) * 1000;
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry: tokenExpiry }));
  } catch (_) { /* ignore */ }
}

/** True if we hold a still-valid token from this session (no popup needed). */
export function hasCachedToken() {
  return Boolean(accessToken) && tokenExpiry > Date.now() + 60000;
}

function ensureClient() {
  if (tokenClient) return;
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    throw new Error('Google sign-in is still loading. Check your connection and try again.');
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}, // replaced per request
  });
}

/** Interactive connect — shows Google's consent screen the first time. */
export function connect() {
  return new Promise((resolve, reject) => {
    try {
      ensureClient();
    } catch (err) {
      reject(err);
      return;
    }
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      cacheToken(resp.access_token, resp.expires_in);
      resolve(true);
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

async function authHeader() {
  if (!accessToken || tokenExpiry < Date.now() + 60000) await connect();
  return { Authorization: `Bearer ${accessToken}` };
}

/* ---------- Drive REST helpers ---------- */

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function findFile() {
  const headers = await authHeader();
  const url = `${DRIVE}/files?spaces=appDataFolder&q=name='${FILE_NAME}'&fields=files(id,name,modifiedTime)`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const json = await res.json();
  return (json.files && json.files[0]) || null;
}

async function downloadFile(id) {
  const headers = await authHeader();
  const res = await fetch(`${DRIVE}/files/${id}?alt=media`, { headers });
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  return res.json();
}

async function createFile(data) {
  const headers = await authHeader();
  const boundary = '-------habit-tracker-boundary';
  const meta = { name: FILE_NAME, parents: ['appDataFolder'] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(data)}\r\n` +
    `--${boundary}--`;
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive create failed (${res.status})`);
  return res.json();
}

async function updateFile(id, data) {
  const headers = await authHeader();
  const res = await fetch(`${UPLOAD}/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Drive update failed (${res.status})`);
  return res.json();
}

export async function pull() {
  const file = await findFile();
  if (!file) return null;
  return downloadFile(file.id);
}

export async function push(state) {
  const file = await findFile();
  if (file) return updateFile(file.id, state);
  return createFile(state);
}

/* ---------- the one call the app uses ---------- */

/**
 * Pull, merge, push. Returns the merged state (also written to local storage).
 * Throws on any failure so the caller can show a message.
 */
export async function syncWithDrive(localState) {
  if (!isConfigured()) throw new Error('No Google Client ID set. See README.md.');
  const remote = await pull();
  const merged = remote ? mergeStates(localState, remote) : localState;
  await push(merged);
  saveLocal(merged);
  return merged;
}

loadCachedToken();
