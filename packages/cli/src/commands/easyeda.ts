/**
 * EasyEDA subcommands
 * Browser-based component search and exploration
 */

import open from 'open'
import { startHttpServer, stopHttpServer } from '@jlcpcb/core'

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
