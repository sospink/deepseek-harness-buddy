/** Offline, allowlisted prototype image assets shipped with the Buddy product layer. */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { prototypeEditorScript } from './prototype-editor-script.ts'

/** Stable browser prefix for packaged prototype resources. */
export const PROTOTYPE_ASSET_PATH = '/api/buddy-prototype/assets'

const ASSETS = new Set([
  'zhiyu-city/home.png',
  'zhiyu-city/drone-registration.png',
  'zhiyu-city/blockchain-center.png',
  'zhiyu-city/user-management.png',
  'zhiyu-city/home.html',
  'zhiyu-city/drone-registration.html',
  'zhiyu-city/blockchain-center.html',
  'zhiyu-city/user-management.html',
])

function authenticate(ctx: Context, request: IncomingMessage): boolean {
  const rejection = ctx.connection.requestRejection(request)
  if (rejection === undefined) return true
  request.resume()
  return false
}

/** Create the authenticated route serving only package-owned prototype images.
 * @param ctx - Host context carrying browser authentication.
 * @returns Prefix route for the fixed prototype asset catalog.
 */
export function createPrototypeAssetRoute(ctx: Context): WebRoute {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'prototypes')
  return {
    kind: 'prefix',
    path: PROTOTYPE_ASSET_PATH,
    handler: async (request, response: ServerResponse) => {
      if (!authenticate(ctx, request)) {
        response.writeHead(401, { 'cache-control': 'no-store' })
        response.end('Unauthorized')
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
        response.end('Method not allowed')
        return
      }
      const url = new URL(request.url ?? PROTOTYPE_ASSET_PATH, 'http://dsh.internal')
      const relative = decodeURIComponent(url.pathname.slice(`${PROTOTYPE_ASSET_PATH}/`.length))
      if (!ASSETS.has(relative)) {
        response.writeHead(404, { 'cache-control': 'no-store' })
        response.end('Not found')
        return
      }
      let bytes = await readFile(join(root, relative))
      const html = relative.endsWith('.html')
      if (html) {
        const source = bytes.toString('utf8')
        const script = `<script>${prototypeEditorScript()}</script>`
        bytes = Buffer.from(source.replace(/<\/body>/i, `${script}</body>`), 'utf8')
      }
      response.writeHead(200, {
        'content-type': html ? 'text/html; charset=utf-8' : 'image/png',
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': html
          ? "default-src 'self' https: data:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'none'; frame-ancestors 'self'"
          : "default-src 'none'; sandbox",
      })
      if (request.method === 'HEAD') response.end()
      else response.end(bytes)
    },
  }
}
