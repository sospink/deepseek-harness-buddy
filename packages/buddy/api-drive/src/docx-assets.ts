/** Pinned DOCX preview assets for Worker preflight and opaque-iframe rendering. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const jsZipSource = readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8')
const docxEntry = require.resolve('docx-preview')
const docxSource = readFileSync(join(dirname(docxEntry), 'docx-preview.min.js'), 'utf8')

/** Browser UMD libraries executed only inside the opaque-origin preview iframe. */
export const DOCX_RUNTIME_SOURCE = Buffer.from(`${jsZipSource}\n;${docxSource}\n`)

const workerBootstrap = String.raw`
;(() => {
  'use strict';
  const MAX_ENTRIES = 1000;
  const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
  const MAX_COMPRESSION_RATIO = 100;
  const REQUIRED = new Set(['[Content_Types].xml', 'word/document.xml']);
  const XML = new TextDecoder('utf-8', { fatal: true });
  const unsafePath = name => name.startsWith('/') || name.split('/').includes('..');
  const forbiddenName = name => /(?:^|\/)vbaProject\.bin$/iu.test(name)
    || /^word\/afchunk/iu.test(name)
    || /^word\/(?:activeX|embeddings)\//iu.test(name);
  const scanXml = (name, bytes) => {
    const xml = XML.decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error(name + ': DTD and entities are not allowed.');
    if (/TargetMode\s*=\s*["']External["']/iu.test(xml)) throw new Error(name + ': external relationships are not allowed.');
    if (/application\/vnd\.ms-office\.vbaProject|macroEnabled/iu.test(xml)) throw new Error(name + ': macro-enabled content is not allowed.');
    if (/<w:altChunk\b/iu.test(xml) || /relationships\/aFChunk/iu.test(xml)) throw new Error(name + ': AltChunk content is not allowed.');
    if (/relationships\/(?:oleObject|package)/iu.test(xml)) throw new Error(name + ': embedded packages are not allowed.');
  };
  self.onmessage = async event => {
    const message = event.data;
    if (!message || message.type !== 'inspect' || !(message.buffer instanceof ArrayBuffer)) return;
    try {
      const archive = await self.JSZip.loadAsync(message.buffer, { checkCRC32: true, createFolders: false });
      const entries = Object.values(archive.files).filter(entry => !entry.dir);
      if (entries.length > MAX_ENTRIES) throw new Error('DOCX contains too many ZIP entries.');
      const names = new Set(entries.map(entry => entry.name));
      for (const required of REQUIRED) if (!names.has(required)) throw new Error('DOCX is missing required OOXML entries.');
      let expandedBytes = 0;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (unsafePath(entry.name)) throw new Error('DOCX contains an unsafe ZIP member path.');
        if (forbiddenName(entry.name)) throw new Error(entry.name + ': active content is not allowed.');
        const metadata = entry._data || {};
        const compressed = Number(metadata.compressedSize);
        const declared = Number(metadata.uncompressedSize);
        if (Number.isFinite(declared) && declared > MAX_EXPANDED_BYTES - expandedBytes) {
          throw new Error('DOCX expanded content exceeds the preview limit.');
        }
        if (Number.isFinite(compressed) && compressed >= 0 && Number.isFinite(declared)) {
          const ratio = compressed === 0 ? (declared === 0 ? 1 : Infinity) : declared / compressed;
          if (ratio > MAX_COMPRESSION_RATIO) throw new Error(entry.name + ': compression ratio exceeds the preview limit.');
        }
        const bytes = await entry.async('uint8array');
        expandedBytes += bytes.byteLength;
        if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('DOCX expanded content exceeds the preview limit.');
        if (entry.name === '[Content_Types].xml' || entry.name.endsWith('.rels') || entry.name === 'word/document.xml') {
          scanXml(entry.name, bytes);
        }
        if ((index & 31) === 0) self.postMessage({ type: 'progress', checked: index + 1, total: entries.length });
      }
      self.postMessage({ type: 'safe', buffer: message.buffer, entries: entries.length, expandedBytes }, [message.buffer]);
    } catch (error) {
      self.postMessage({ type: 'failure', message: error instanceof Error ? error.message : String(error) });
    }
  };
})();
`

/** Self-contained JSZip Worker that returns the checked buffer only after bounded OOXML inspection. */
export const DOCX_PREFLIGHT_WORKER_SOURCE = Buffer.from(`${jsZipSource}\n${workerBootstrap}`)
