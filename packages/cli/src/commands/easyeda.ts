/**
 * EasyEDA subcommands
 * Browser-based component search and exploration
 */

import open from 'open'
import * as p from '@clack/prompts'
import chalk from 'chalk'
import {
  startHttpServer,
  stopHttpServer,
  createComponentService,
  createLibraryService,
  type SearchOptions,
} from '@jlcpcb/core'
import { renderApp } from '../app/App.js'
import { printJson, printJsonError, getErrorMessage } from '../utils/agent-output.js'
import { formatSearchResultForJson } from '../utils/search-result-output.js'

const componentService = createComponentService()
const libraryService = createLibraryService()

interface EasyedaSearchOptions {
  port?: number
  json?: boolean
  open?: boolean
  once?: boolean
}

/**
 * Launch the EasyEDA component browser with an optional search query
 */
export async function easyedaSearchCommand(
  query: string,
  options: EasyedaSearchOptions
): Promise<void> {
  if (options.json) {
    try {
      const results = await componentService.search(query, {
        limit: 20,
        source: 'easyeda-community',
      })
      printJson({
        success: true,
        query,
        count: results.length,
        results: results.map(formatSearchResultForJson),
      })
    } catch (error) {
      printJsonError('easyeda_search_failed', getErrorMessage(error), { retryable: true })
      process.exit(1)
    }
    return
  }

  const port = options.port ?? 3847

  console.log('Starting component browser...')

  startHttpServer({
    port,
    onReady: async (url) => {
      // Append query to URL if provided
      const searchUrl = query ? `${url}?q=${encodeURIComponent(query)}` : url

      console.log(`Browser opened at ${searchUrl}`)

      if (options.open !== false) {
        await open(searchUrl)
      }

      if (options.once) {
        stopHttpServer()
        process.exit(0)
      }

      console.log('Press Ctrl+C to stop the server and exit')
    }
  })

  // Keep running until Ctrl+C
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nShutting down server...')
      stopHttpServer()
      resolve()
      process.exit(0)
    })
  })
}

interface EasyedaInstallOptions {
  projectPath?: string
  include3d?: boolean
  yes?: boolean
  json?: boolean
  force?: boolean
}

/**
 * Install an EasyEDA community component to KiCad libraries
 */
export async function easyedaInstallCommand(
  uuid: string | undefined,
  options: EasyedaInstallOptions
): Promise<void> {
  if (!uuid && (options.yes || options.json)) {
    if (options.json) {
      printJsonError('missing_uuid', 'Direct EasyEDA install requires a component UUID')
    } else {
      p.log.error('Direct EasyEDA install requires a component UUID.')
    }
    process.exit(1)
  }

  // If UUID provided with --yes or --json, do direct install (non-interactive)
  if (uuid && (options.yes || options.json)) {
    const spinner = options.json ? null : p.spinner()
    spinner?.start(`Installing EasyEDA component ${uuid}...`)

    try {
      // Ensure libraries are set up
      await libraryService.ensureGlobalTables()

      // Install the component
      const result = await libraryService.install(uuid, {
        projectPath: options.projectPath,
        include3d: options.include3d,
        force: options.force,
      })

      spinner?.stop(chalk.green('✓ Component installed'))

      if (options.json) {
        printJson({
          success: true,
          result,
        })
        return
      }

      // Display result
      console.log()
      console.log(chalk.cyan('Symbol:    '), result.symbolRef)
      console.log(chalk.cyan('Footprint: '), result.footprintRef)
      console.log(chalk.cyan('Action:    '), result.symbolAction)
      if (result.files.model3d) {
        console.log(chalk.cyan('3D Model:  '), result.files.model3d)
      }
      console.log()
      console.log(chalk.dim(`Library: ${result.files.symbolLibrary}`))
    } catch (error) {
      spinner?.stop(chalk.red('✗ Installation failed'))
      if (options.json) {
        printJsonError('easyeda_install_failed', getErrorMessage(error), { retryable: true })
      } else {
        p.log.error(`Error: ${getErrorMessage(error)}`)
      }
      process.exit(1)
    }
    return
  }

  // If UUID provided (without --force), launch TUI to fetch and display
  if (uuid) {
    // Launch TUI at EasyEDA info screen - let it fetch the component
    await renderApp('easyeda-info', { uuid })
    return
  }

  // No UUID provided - interactive search mode
  const query = await p.text({
    message: 'Search EasyEDA community library:',
    placeholder: 'e.g., STM32F103, ESP32, Arduino Nano',
    validate: (value) => {
      if (!value) return 'Please enter a search term'
      return undefined
    },
  })

  if (p.isCancel(query)) {
    p.cancel('Installation cancelled')
    process.exit(0)
  }

  console.log(`Searching EasyEDA community for "${query}"...`)

  const searchOptions: SearchOptions = {
    limit: 20,
    source: 'easyeda-community',
  }
  const results = await componentService.search(query as string, searchOptions)

  if (results.length === 0) {
    console.log('No components found. Try a different search term.')
    return
  }

  // Clear the "Searching..." line and launch interactive UI
  process.stdout.write('\x1b[1A\x1b[2K')
  await renderApp('search', { query: query as string, results })
}
