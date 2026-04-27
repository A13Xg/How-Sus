/**
 * updateChecker.js — Checks for new commits on main branch via GitHub API.
 */
import logger from './logger.js';

export const APP_VERSION = '1.0.0';
export const APP_BUILD_DATE = '2025-07-16T00:00:00.000Z';

const GITHUB_API_URL = 'https://api.github.com/repos/A13Xg/How-Sus/commits/main';
const STORED_SHA_KEY = 'howsus-known-sha';

export function getStoredSha() {
  try { return localStorage.getItem(STORED_SHA_KEY) || null; } catch { return null; }
}

export function setStoredSha(sha) {
  try { localStorage.setItem(STORED_SHA_KEY, sha); } catch { /* ignore */ }
}

export async function checkForUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    logger.info('Checking for updates…');
    const res = await fetch(GITHUB_API_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object' || typeof data.sha !== 'string') {
      throw new Error('Unexpected GitHub API response shape');
    }
    const latestSha = data.sha;
    const latestDate = data.commit?.committer?.date || data.commit?.author?.date || null;
    const commitMessage = data.commit?.message?.split('\n')[0] || '';
    const knownSha = getStoredSha();
    const hasUpdate = !!knownSha && knownSha !== latestSha;
    if (!knownSha) setStoredSha(latestSha);
    logger.info('Update check complete', { hasUpdate, latestSha: latestSha.slice(0, 7) });
    return { hasUpdate, latestSha, latestDate, commitMessage };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      logger.warn('Update check timed out');
    } else {
      logger.warn('Update check failed', { error: err.message });
    }
    return { hasUpdate: false, latestSha: null, latestDate: null, commitMessage: '' };
  }
}
