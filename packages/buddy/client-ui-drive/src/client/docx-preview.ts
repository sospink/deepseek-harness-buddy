/** Bounded DOCX loading, Worker preflight, and opaque-frame protocol. */

import { DRIVE_DOCX_RUNTIME_PATH, DRIVE_DOCX_WORKER_PATH } from '@sospink/dsh-buddy-api-drive/paths'

/** Largest encoded DOCX retained by the browser preview. */
export const DOCX_PREVIEW_MAX_BYTES = 20 * 1024 * 1024
/** Maximum time allowed for Worker OOXML inspection. */
export const DOCX_PREFLIGHT_TIMEOUT_MS = 10_000
/** Maximum time allowed for iframe visual rendering. */
export const DOCX_RENDER_TIMEOUT_MS = 15_000
/** Largest pinned iframe runtime source accepted from the Host. */
export const DOCX_RUNTIME_MAX_BYTES = 512 * 1024
export const DOCX_FRAME_CHANNEL = 'buddy-docx-preview'

export interface DocxPreflightResult {
  readonly buffer: ArrayBuffer
  readonly entries: number
  readonly expandedBytes: number
}

export interface DocxWorkerProgress {
  readonly checked: number
  readonly total: number
}

interface DocxWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
  terminate(): void
}

interface InspectDocxOptions {
  readonly createWorker?: (url: string) => DocxWorkerLike
  readonly timeoutMs?: number
  readonly onProgress?: (progress: DocxWorkerProgress) => void
}

function responseLength(response: Response): number | undefined {
  const raw = response.headers.get('content-length')
  if (raw === null) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Read one authenticated response without buffering beyond the complete-result budget. */
export async function loadBoundedBytes(url: string, signal: AbortSignal, maxBytes: number): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`DOCX preview request failed (${String(response.status)}).`)
  const declared = responseLength(response)
  if (declared !== undefined && declared > maxBytes) throw new Error(`DOCX preview exceeds ${String(maxBytes)} bytes.`)
  if (response.body === null) {
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.byteLength > maxBytes) throw new Error(`DOCX preview exceeds ${String(maxBytes)} bytes.`)
    return body
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > maxBytes) throw new Error(`DOCX preview exceeds ${String(maxBytes)} bytes.`)
      chunks.push(part.value)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/** Load the authenticated UMD runtime that will be embedded into the opaque iframe. */
export async function loadDocxRuntime(signal: AbortSignal): Promise<string> {
  const bytes = await loadBoundedBytes(DRIVE_DOCX_RUNTIME_PATH, signal, DOCX_RUNTIME_MAX_BYTES)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function isProgress(value: unknown): value is { type: 'progress'; checked: number; total: number } {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return message.type === 'progress' && Number.isSafeInteger(message.checked) && Number.isSafeInteger(message.total)
}

function isSafe(value: unknown): value is {
  type: 'safe'
  buffer: ArrayBuffer
  entries: number
  expandedBytes: number
} {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return message.type === 'safe' && message.buffer instanceof ArrayBuffer
    && Number.isSafeInteger(message.entries) && Number.isSafeInteger(message.expandedBytes)
}

/** Send a DOCX through the bounded Worker preflight and recover its transferred buffer only on success. */
export function inspectDocxBuffer(
  buffer: ArrayBuffer,
  signal: AbortSignal,
  options: InspectDocxOptions = {},
): Promise<DocxPreflightResult> {
  const createWorker = options.createWorker ?? (url => new Worker(url))
  const worker = createWorker(DRIVE_DOCX_WORKER_PATH)
  const timeoutMs = options.timeoutMs ?? DOCX_PREFLIGHT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (operation: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.terminate()
      operation()
    }
    const abort = (): void => { finish(() => { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')) }) }
    const timer = setTimeout(() => { finish(() => { reject(new Error('DOCX preflight timed out.')) }) }, timeoutMs)
    worker.onerror = (event) => { finish(() => { reject(new Error(event.message || 'DOCX preflight Worker failed.')) }) }
    worker.onmessage = (event) => {
      if (isProgress(event.data)) {
        options.onProgress?.({ checked: event.data.checked, total: event.data.total })
        return
      }
      const safe = isSafe(event.data) ? event.data : undefined
      if (safe !== undefined) {
        finish(() => { resolve({ buffer: safe.buffer, entries: safe.entries, expandedBytes: safe.expandedBytes }) })
        return
      }
      if (typeof event.data === 'object' && event.data !== null && (event.data as { type?: unknown }).type === 'failure') {
        const message = (event.data as { message?: unknown }).message
        finish(() => { reject(new Error(typeof message === 'string' ? message : 'DOCX preflight failed.')) })
        return
      }
      finish(() => { reject(new Error('DOCX preflight returned an invalid response.')) })
    }
    if (signal.aborted) abort()
    else {
      signal.addEventListener('abort', abort, { once: true })
      worker.postMessage({ type: 'inspect', buffer }, [buffer])
    }
  })
}

function escapeInlineScript(source: string): string {
  return source.replace(/<\/script/giu, '<\\/script')
}

/** Opaque-origin HTML shell; the DOCX buffer arrives later through postMessage. */
export function docxFrameHtml(runtimeSource: string, nonce: string): string {
  const runtime = escapeInlineScript(runtimeSource)
  const nonceLiteral = JSON.stringify(nonce)
  const channelLiteral = JSON.stringify(DOCX_FRAME_CHANNEL)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:#f5f6f8;color:#15171a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif}#docx-body{padding:16px;min-height:100vh;box-sizing:border-box}.docx-wrapper{display:flex!important;flex-direction:column!important;align-items:center!important;gap:16px!important;padding:12px!important;background:transparent!important;overflow:hidden!important}.buddy-docx-page{position:relative;flex:none;content-visibility:auto;contain:layout paint style;contain-intrinsic-size:816px 1056px}.buddy-docx-page>section.docx{position:absolute!important;inset:0 auto auto 0;margin:0!important;transform-origin:top left!important;box-shadow:0 2px 12px rgba(0,0,0,.12)!important}a{pointer-events:none;color:inherit;text-decoration:none}</style></head><body><div id="docx-styles"></div><main id="docx-body"></main><script>${runtime}\n;(() => { 'use strict'; const nonce=${nonceLiteral}; const channel=${channelLiteral}; let accepted=false; const send=(type,fields={})=>parent.postMessage({channel,nonce,type,...fields},'*'); const allowedUrl=value=>value.startsWith('data:')||value.startsWith('blob:')||value.startsWith('#'); const sanitize=()=>{ document.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,meta[http-equiv],link').forEach(node=>node.remove()); for(const element of document.querySelectorAll('*')){ for(const attribute of [...element.attributes]){ const name=attribute.name.toLowerCase(); if(name.startsWith('on')||name==='srcset'||name==='action'||name==='formaction') element.removeAttribute(attribute.name); else if((name==='src'||name==='href'||name==='xlink:href')&&!allowedUrl(attribute.value)) element.removeAttribute(attribute.name); } } }; const preparePages=()=>{ const body=document.getElementById('docx-body'); for(const section of [...body.querySelectorAll('.docx-wrapper>section.docx')]){ const holder=document.createElement('div'); holder.className='buddy-docx-page'; section.before(holder); holder.append(section); } }; const fitPages=()=>{ const body=document.getElementById('docx-body'); for(const holder of body.querySelectorAll('.buddy-docx-page')){ const section=holder.querySelector('section.docx'); if(!(section instanceof HTMLElement)) continue; section.style.transform='none'; const width=section.offsetWidth; const height=section.offsetHeight; const available=Math.max(1,body.clientWidth-24); const scale=Math.min(1,available/Math.max(1,width)); section.style.transform='scale('+String(scale)+')'; holder.style.width=String(Math.ceil(width*scale))+'px'; holder.style.height=String(Math.ceil(height*scale))+'px'; } }; addEventListener('message',async event=>{ const message=event.data; if(accepted||event.source!==parent||!message||message.channel!==channel||message.nonce!==nonce||message.type!=='render'||!(message.buffer instanceof ArrayBuffer)) return; accepted=true; try{ const body=document.getElementById('docx-body'); const styles=document.getElementById('docx-styles'); await self.docx.renderAsync(message.buffer,body,styles,{inWrapper:true,hideWrapperOnPrint:true,ignoreWidth:false,ignoreHeight:false,ignoreFonts:false,breakPages:true,debug:false,experimental:false,trimXmlDeclaration:true,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,ignoreLastRenderedPageBreak:true,useBase64URL:true,renderChanges:false,renderComments:false,renderAltChunks:false}); sanitize(); preparePages(); fitPages(); let fitFrame=0; const scheduleFit=()=>{ if(fitFrame!==0) return; fitFrame=requestAnimationFrame(()=>{ fitFrame=0; fitPages(); }); }; new ResizeObserver(scheduleFit).observe(body); send('ready',{pages:body.querySelectorAll('section.docx').length}); }catch(error){ send('failure',{message:error instanceof Error?error.message:String(error)}); } }); send('boot'); })();</script></body></html>`
}

export interface DocxFrameMessage {
  readonly channel: typeof DOCX_FRAME_CHANNEL
  readonly nonce: string
  readonly type: 'boot' | 'ready' | 'failure'
  readonly pages?: number
  readonly message?: string
}

/** Validate the tiny metadata-only message surface accepted from the opaque iframe. */
export function parseDocxFrameMessage(value: unknown, nonce: string): DocxFrameMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const message = value as Record<string, unknown>
  if (message.channel !== DOCX_FRAME_CHANNEL || message.nonce !== nonce
    || typeof message.type !== 'string' || !['boot', 'ready', 'failure'].includes(message.type)) return undefined
  if (message.type === 'ready' && (!Number.isSafeInteger(message.pages) || Number(message.pages) < 0)) return undefined
  if (message.type === 'failure' && typeof message.message !== 'string') return undefined
  return message as unknown as DocxFrameMessage
}
