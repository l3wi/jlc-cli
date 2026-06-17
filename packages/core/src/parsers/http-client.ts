/**
 * Shared HTTP client for EasyEDA API calls
 * Used by both LCSC and Community API clients
 */

import { execFileSync } from 'child_process';
import { createLogger } from '../utils/index.js';

const logger = createLogger('http-client');

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: string;
  contentType?: string;
  binary?: boolean;
  timeoutMs?: number;
}

/**
 * Fetch URL with curl fallback for reliability
 * Falls back to curl when Node fetch fails (proxy issues, etc.)
 */
export async function fetchWithCurlFallback(
  url: string,
  options: FetchOptions = {}
): Promise<string | Buffer> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs ?? 30_000;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  if (options.contentType) {
    headers['Content-Type'] = options.contentType;
  }

  // Try native fetch first
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(url, fetchOptions);

    if (response.ok) {
      if (options.binary) {
        return Buffer.from(await response.arrayBuffer());
      }
      return await response.text();
    }
  } catch (error) {
    logger.debug(`Native fetch failed, falling back to curl: ${error}`);
  } finally {
    clearTimeout(timeout);
  }

  // Fallback to curl
  try {
    const curlArgs = ['-sS', '--max-time', String(Math.ceil(timeoutMs / 1000))];

    if (method === 'POST') {
      curlArgs.push('-X', 'POST');
    }

    curlArgs.push('-H', 'Accept: application/json');
    curlArgs.push(
      '-H',
      'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    );

    if (options.contentType) {
      curlArgs.push('-H', `Content-Type: ${options.contentType}`);
    }

    if (options.body) {
      curlArgs.push('-d', options.body);
    }

    curlArgs.push(url);

    if (options.binary) {
      const result = execFileSync('curl', curlArgs, { maxBuffer: 50 * 1024 * 1024 });
      return result;
    }

    const result = execFileSync('curl', curlArgs, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return result;
  } catch (error) {
    throw new Error(`Both fetch and curl failed for URL: ${url}`);
  }
}
