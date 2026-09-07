import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { render, type Instance } from 'ink';
import type { ReactNode } from 'react';

export function createTerminal() {
  class Input extends PassThrough {
    isTTY = true;
    setRawMode() { return this; }
    ref() { return this; }
    unref() { return this; }
  }
  const stdin = new Input();
  let output = '';
  let instance: Instance | undefined;
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += stripVTControlCharacters(String(chunk));
      callback();
    },
  });
  Object.assign(stdout, { columns: 120, rows: 40, isTTY: true });

  return {
    render(node: ReactNode) {
      instance = render(node, {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as NodeJS.WriteStream,
        stderr: stdout as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      });
      return instance;
    },
    async see(text: string) {
      const deadline = Date.now() + 3_000;
      while (!output.includes(text) && Date.now() < deadline) await delay(10);
      assert.ok(output.includes(text), `Expected ${JSON.stringify(text)} in terminal output:\n${output}`);
      // Let Ink commit its input subscriptions before sending the next key.
      await delay(30);
    },
    key(value: string) {
      output = '';
      stdin.write(value);
    },
    output: () => output,
    cleanup() {
      instance?.unmount();
      instance?.cleanup();
      stdin.destroy();
      stdout.destroy();
    },
  };
}
