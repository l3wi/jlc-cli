/**
 * Info command
 * Display component details
 */

import { createComponentService } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';
import { printJson, printJsonError, getErrorMessage } from '../utils/agent-output.js';

const componentService = createComponentService();

interface InfoOptions {
  json?: boolean;
}

export async function infoCommand(id: string, options: InfoOptions): Promise<void> {
  // JSON mode - non-interactive output for scripting
  if (options.json) {
    try {
      const details = await componentService.getDetails(id);
      printJson({
        success: true,
        component: details,
      });
    } catch (error) {
      printJsonError('component_fetch_failed', getErrorMessage(error), { retryable: true });
      process.exit(1);
    }
    return;
  }

  // Interactive mode - launch TUI
  await renderApp('info', { componentId: id });
}
