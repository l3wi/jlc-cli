import { expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

it('exits cleanly after a connected stdio client closes stdin', async () => {
  const home = await mkdtemp(join(tmpdir(), 'jlc-mcp-lifecycle-'));
  const child = spawn(process.execPath, [join(import.meta.dir, 'index.ts')], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CONFIG_HOME: join(home, 'config'),
      APPDATA: join(home, 'appdata'),
      JLC_MCP_HTTP_PORT: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  child.stderr.setEncoding('utf-8').on('data', (chunk) => { stderr += chunk; });
  // A real child cannot share fake timers; this watchdog only bounds a leaked-process failure.
  const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
  try {
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.stdout.setEncoding('utf-8').on('data', (chunk) => {
      stdout += chunk;
      // A tools/list response proves the real MCP transport is serving requests.
      // Ending the pipe, rather than signaling the process, exercises disconnect cleanup.
      if (stdout.split('\n').some((line) => {
        try { return JSON.parse(line).id === 1; } catch { return false; }
      })) child.stdin.end();
    });
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
    const result = await exited;
    if (result.code !== 0 || result.signal !== null) {
      throw new Error(`MCP did not exit cleanly: ${JSON.stringify(result)}\n${stderr}`);
    }
    const response = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line)).find((message) => message.id === 1);
    expect(response.result.tools.some((tool: { name: string }) => tool.name === 'library_update')).toBe(true);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(home, { recursive: true, force: true });
  }
}, 10000);
