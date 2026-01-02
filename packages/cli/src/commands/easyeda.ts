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

const componentService = createComponentService()
const libraryService = createLibraryService()

interface EasyedaSearchOptions {
  port?: number
}

/**
 * Launch the EasyEDA component browser with an optional search query
 */
export async function easyedaSearchCommand(
  query: string,
  options: EasyedaSearchOptions
): Promise<void> {
  const port = options.port ?? 3847

  console.log('Starting component browser...')

  startHttpServer({
    port,
    onReady: async (url) => {
      // Append query to URL if provided
      const searchUrl = query ? `${url}?q=${encodeURIComponent(query)}` : url

      console.log(`Browser opened at ${searchUrl}`)

      // Open browser
      await open(searchUrl)

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
  force?: boolean
}

/**
 * Install an EasyEDA community component to KiCad libraries
 */
export async function easyedaInstallCommand(
  uuid: string | undefined,
  options: EasyedaInstallOptions
): Promise<void> {
  // If UUID provided with --force, do direct install (non-interactive)
  if (uuid && options.force) {
    const spinner = p.spinner()
    spinner.start(`Installing EasyEDA component ${uuid}...`)

    try {
      // Ensure libraries are set up
      await libraryService.ensureGlobalTables()

      // Install the component
      const result = await libraryService.install(uuid, {
        projectPath: options.projectPath,
        include3d: options.include3d,
        force: true,
      })

      spinner.stop(chalk.green('✓ Component installed'))

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
      spinner.stop(chalk.red('✗ Installation failed'))
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
