import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Nuxt } from '@nuxt/schema'
import type { RsbuildDevServer, RsbuildInstance } from '@rsbuild/core'
import { logger } from '@nuxt/kit'
import { getPort } from 'get-port-please'
import type { H3Event as H3V1Event } from 'h3'
import type { H3Event as H3V2Event } from 'h3-next'
import { joinURL } from 'ufo'

import { isSameOriginRequest } from '../../webpack/src/utils/same-origin.ts'

export interface HMRServer {
  port: number
  protocol: 'ws' | 'wss'
  server: Server
}

/** Same default port range as the Vite builder */
const HMR_PORT = 24678

/**
 * Create the server that the Rsbuild HMR client connects to.
 *
 * The Nuxt dev server is created before the builder is loaded, so it cannot
 * forward WebSocket upgrades to Rsbuild; HMR is served on a dedicated port instead.
 */
export async function createHMRServer (nuxt: Nuxt): Promise<HMRServer> {
  const host = nuxt.options.devServer.host || 'localhost'
  const port = await getPort({ host, port: HMR_PORT, portRange: [HMR_PORT, HMR_PORT + 20], verbose: false })

  const https = nuxt.options.devServer.https
  const handleRequest = (_req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = 426
    res.end('Upgrade Required')
  }
  const server = (https ? createHttpsServer(typeof https === 'object' ? https : {}, handleRequest) : createHttpServer(handleRequest)) as Server

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  nuxt.hook('close', () => new Promise<void>(resolve => server.close(() => resolve())))

  return { port, protocol: https ? 'wss' : 'ws', server }
}

export async function setupDevServer (nuxt: Nuxt, rsbuild: RsbuildInstance, hmrServer: HMRServer) {
  logger.debug('Creating Rsbuild dev server...')

  const devServer = await rsbuild.createDevServer({ getPortSilently: true })
  devServer.connectWebSocket({ server: hmrServer.server })
  nuxt.hook('close', () => devServer.close())

  const assetsPath = joinURL(nuxt.options.app.baseURL, nuxt.options.app.buildAssetsDir, '/')
  await nuxt.callHook('server:devHandler', defineEventHandler(async (event) => {
    const { req, res } = 'runtime' in event ? event.runtime!.node! : event.node
    if (!req.url?.startsWith(assetsPath)) {
      return
    }

    if (!isSameOriginRequest(req)) {
      res!.statusCode = 403
      res!.end('Forbidden')
    } else if (!await handleRequest(devServer, req as IncomingMessage, res as ServerResponse)) {
      return
    }

    // the response has already been sent
    if ('runtime' in event) {
      return kHandled
    }
  }), { cors: () => true })

  // wait for the initial compilation of all environments
  await Promise.all(Object.values(devServer.environments).map(environment => environment.getStats()))
}

/** Signals to h3 v2 that the response has already been sent. */
const kHandled = Symbol.for('h3.handled')

/** Resolves to `true` when the request was handled by Rsbuild, or `false` when it was passed through. */
function handleRequest (devServer: RsbuildDevServer, req: IncomingMessage, res: ServerResponse) {
  return new Promise<boolean>((resolve, reject) => {
    res.once('close', () => resolve(true))
    res.once('finish', () => resolve(true))
    devServer.middlewares(req, res, (error?: unknown) => error ? reject(error) : resolve(false))
  })
}

type GenericHandler = (event: H3V1Event | H3V2Event) => unknown | Promise<unknown>

function defineEventHandler (handler: GenericHandler): GenericHandler {
  return Object.assign(handler, { __is_handler__: true })
}
