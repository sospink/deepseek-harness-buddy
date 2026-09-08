/** React Flow prototype canvas built from durable prototype tool calls. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  applyNodeChanges, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import './xyflow-base.css'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import css from './PrototypeCanvas.module.css'

const PAGES = [
  { id: 'home', name: 'pageHome', file: 'home.html', width: 1918, height: 1574, x: 0, y: 0 },
  { id: 'drone-registration', name: 'pageDrone', file: 'drone-registration.html', width: 1920, height: 1249, x: 2140, y: 0 },
  { id: 'blockchain-center', name: 'pageBlockchain', file: 'blockchain-center.html', width: 1918, height: 1690, x: 0, y: 1840 },
  { id: 'user-management', name: 'pageUsers', file: 'user-management.html', width: 1925, height: 1019, x: 2140, y: 1840 },
] as const

const PROTOTYPE_ASSET_PATH = '/api/buddy-prototype/assets'
const PROTOTYPE_EDITOR_VERSION = '2'
const MIN_ZOOM = 0.1
const MAX_ZOOM = 2
const FIT_OPTIONS = { padding: 0.16, minZoom: MIN_ZOOM, maxZoom: 0.8, duration: 420 } as const

type PageName = typeof PAGES[number]['name']

interface ScreenData extends Record<string, unknown> {
  readonly id: string
  readonly name: PageName
  readonly file: string
  readonly width: number
  readonly height: number
  readonly revealed: boolean
  readonly interactive: boolean
  readonly label: string
  readonly editable: boolean
  readonly onFrameReady: (pageId: string, frame: HTMLIFrameElement) => void
}

type ScreenNode = Node<ScreenData, 'prototype-screen'>

interface PersistedCanvas {
  readonly positions?: Record<string, { readonly x: number; readonly y: number }>
  readonly viewport?: Viewport
  readonly title?: string
  readonly accent?: string
  readonly titleX?: number
  readonly titleY?: number
  readonly titleWidth?: number
  readonly titleHeight?: number
  readonly titleVisible?: boolean
  readonly elementEdits?: readonly ElementEdit[]
}

interface OverlayState {
  readonly title: string
  readonly accent: string
  readonly titleX: number
  readonly titleY: number
  readonly titleWidth: number
  readonly titleHeight: number
  readonly titleVisible: boolean
}

interface PrototypeOperation {
  type?: unknown
  node_id?: unknown
  value?: unknown
  x?: unknown
  y?: unknown
  width?: unknown
  height?: unknown
}

interface ElementEdit {
  readonly pageId: string
  readonly type: 'set-text' | 'move' | 'resize' | 'set-style' | 'hide'
  readonly nodeId: string
  readonly value?: string
  readonly dx?: number
  readonly dy?: number
  readonly width?: number
  readonly height?: number
  readonly property?: 'color' | 'backgroundColor' | 'fontSize' | 'fontWeight' | 'borderRadius' | 'opacity'
}

interface SelectedElement {
  readonly pageId: string
  readonly nodeId: string
  readonly tag: string
  readonly name: string
  readonly text: string
  readonly canEditText: boolean
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly color: string
  readonly backgroundColor: string
  readonly fontSize: number
  readonly fontWeight: string
  readonly borderRadius: number
  readonly opacity: number
}

type Props = ConvViewProps & PropsLocale<'buddy-prototype'>

function isPrototypeGeneration(node: unknown): node is ChatNode<'tool-call'> {
  if (typeof node !== 'object' || node === null || !('kind' in node) || node.kind !== 'tool-call') return false
  const root = (node as ChatNode<'tool-call'>).data.root
  return 'kind' in root && root.call?.name === 'generate_prototype' && !root.isError
}

function isToolCallNode(node: unknown): node is ChatNode<'tool-call'> {
  return typeof node === 'object' && node !== null && 'kind' in node && node.kind === 'tool-call'
}

function prototypeOperations(node: ChatNode<'tool-call'>): readonly PrototypeOperation[] {
  const root = node.data.root
  if (!('kind' in root) || root.call?.name !== 'update_prototype' || root.isError) return []
  try {
    const args = JSON.parse(root.call.argsRaw) as { operations?: unknown }
    return Array.isArray(args.operations)
      ? args.operations.filter((item): item is PrototypeOperation => typeof item === 'object' && item !== null)
      : []
  } catch {
    return []
  }
}

function applyOperations(state: OverlayState, operations: readonly PrototypeOperation[]): OverlayState {
  let next = state
  for (const operation of operations) {
    if (operation.node_id === 'canvas-title') {
      if (operation.type === 'set-text' && typeof operation.value === 'string') next = { ...next, title: operation.value }
      else if (operation.type === 'move' && typeof operation.x === 'number' && typeof operation.y === 'number') {
        next = { ...next, titleX: operation.x, titleY: operation.y }
      } else if (operation.type === 'resize' && typeof operation.width === 'number' && typeof operation.height === 'number') {
        next = { ...next, titleWidth: operation.width, titleHeight: operation.height }
      } else if (operation.type === 'show') next = { ...next, titleVisible: true }
      else if (operation.type === 'hide') next = { ...next, titleVisible: false }
    } else if (operation.node_id === 'canvas-accent'
      && operation.type === 'set-color' && typeof operation.value === 'string') {
      next = { ...next, accent: operation.value }
    }
  }
  return next
}

function readPersisted(key: string): PersistedCanvas {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown
    return typeof value === 'object' && value !== null ? value as PersistedCanvas : {}
  } catch {
    return {}
  }
}

function cssColor(value: string, fallback: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (channels?.length !== 3 || channels.some(channel => !Number.isFinite(channel))) return fallback
  return `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** Project current node positions, viewport, and overlay into local persistence.
 * @param nodes - Current React Flow artboards.
 * @param viewport - Current viewport transform.
 * @param overlay - Current editable overlay values.
 * @returns JSON-safe canvas state.
 */
export function persistedCanvas(
  nodes: readonly Pick<ScreenNode, 'id' | 'position'>[],
  viewport: Viewport,
  overlay: OverlayState,
): PersistedCanvas {
  return {
    positions: Object.fromEntries(nodes.map(node => [node.id, node.position])),
    viewport,
    ...overlay,
  }
}

function screenNodes(
  pageIds: readonly string[],
  persisted: PersistedCanvas,
  revealed: number,
  interactiveId: string | null,
  editable: boolean,
  onFrameReady: (pageId: string, frame: HTMLIFrameElement) => void,
  t: Props['t'],
): ScreenNode[] {
  return PAGES.filter(page => pageIds.includes(page.id)).map((page, index) => ({
    id: page.id,
    type: 'prototype-screen',
    position: persisted.positions?.[page.id] ?? { x: page.x, y: page.y },
    style: { width: page.width, height: page.height + 50 },
    data: {
      id: page.id,
      name: page.name,
      file: page.file,
      width: page.width,
      height: page.height,
      revealed: index < revealed,
      interactive: editable || page.id === interactiveId,
      label: t(page.name),
      editable,
      onFrameReady,
    },
  }))
}

/** One HTML page rendered as a draggable React Flow artboard. */
function PrototypeScreen({ data, selected }: NodeProps<ScreenNode>) {
  return (
    <article className={css.screenNode} data-selected={selected || undefined} data-visible={data.revealed || undefined}>
      <header className={css.screenHeader}>
        <strong>{data.label}</strong>
        <span>{data.width} × {data.height}</span>
      </header>
      <div className={css.frameShell} style={{ width: data.width, height: data.height }}>
        <iframe
          className={css.prototypeFrame}
          title={data.label}
          src={`${PROTOTYPE_ASSET_PATH}/zhiyu-city/${data.file}?prototypePage=${data.id}&editor=${PROTOTYPE_EDITOR_VERSION}`}
          sandbox="allow-scripts"
          onLoad={(event) => { data.onFrameReady(data.id, event.currentTarget) }}
        />
        {!data.interactive && <div className={css.frameGuard} aria-hidden />}
        {!data.revealed && <div className={css.revealSkeleton} aria-hidden />}
      </div>
    </article>
  )
}

const NODE_TYPES = { 'prototype-screen': PrototypeScreen }

function PrototypeFlow({ sessionId, useChat, t }: Props) {
  const generated = useChat(snapshot => snapshot.nodes.values().filter(isPrototypeGeneration).at(-1))
  const updateSignature = useChat(snapshot => snapshot.nodes.values()
    .filter(isToolCallNode)
    .filter(node => prototypeOperations(node).length > 0)
    .map(node => `${node.key}:${'kind' in node.data.root ? node.data.root.seq : 0}`)
    .join('|'))
  const updates = useChat(snapshot => snapshot.nodes.values().filter(isToolCallNode).flatMap(prototypeOperations))
  const requestedPages = useMemo(() => {
    if (generated?.kind !== 'tool-call' || !('kind' in generated.data.root) || generated.data.root.call === null) return []
    try {
      const args = JSON.parse(generated.data.root.call.argsRaw) as { pages?: unknown }
      return Array.isArray(args.pages) ? args.pages.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  }, [generated])
  const storageKey = `buddy.prototype.flow.${String(sessionId)}`
  const [persisted] = useState<PersistedCanvas>(() => readPersisted(storageKey))
  const [revealed, setRevealed] = useState(0)
  const [interactiveId, setInteractiveId] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const [pagesCollapsed, setPagesCollapsed] = useState(false)
  const [instance, setInstance] = useState<ReactFlowInstance<ScreenNode> | null>(null)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [viewport, setViewport] = useState<Viewport>(persisted.viewport ?? { x: 0, y: 0, zoom: 0.22 })
  const [elementEdits, setElementEdits] = useState<readonly ElementEdit[]>(persisted.elementEdits ?? [])
  const [editCursor, setEditCursor] = useState(elementEdits.length)
  const [overlay, setOverlay] = useState<OverlayState>(() => ({
    title: persisted.title ?? t('defaultTitle'),
    accent: persisted.accent ?? '#4D6BFE',
    titleX: persisted.titleX ?? 48,
    titleY: persisted.titleY ?? 42,
    titleWidth: persisted.titleWidth ?? 460,
    titleHeight: persisted.titleHeight ?? 62,
    titleVisible: persisted.titleVisible ?? true,
  }))
  const [frames] = useState(() => new Map<string, HTMLIFrameElement>())

  const onFrameReady = useCallback((pageId: string, frame: HTMLIFrameElement): void => {
    frames.set(pageId, frame)
    frame.contentWindow?.postMessage({ type: 'prototype-mode', editable: edit }, '*')
    for (const operation of elementEdits.slice(0, editCursor)) {
      if (operation.pageId === pageId) frame.contentWindow?.postMessage({ type: 'prototype-apply', pageId, operation }, '*')
    }
  }, [edit, editCursor, elementEdits, frames])

  const [nodes, setNodes] = useState<ScreenNode[]>(() => screenNodes(requestedPages, persisted, 0, null, edit, onFrameReady, t))

  const save = useCallback((nextNodes: readonly ScreenNode[], nextViewport = viewport, nextOverlay = overlay) => {
    localStorage.setItem(storageKey, JSON.stringify({
      ...persistedCanvas(nextNodes, nextViewport, nextOverlay), elementEdits,
    }))
  }, [elementEdits, overlay, storageKey, viewport])

  useEffect(() => {
    setNodes((current) => {
      const positions = Object.fromEntries(current.map(node => [node.id, node.position]))
      return screenNodes(requestedPages, { ...persisted, positions }, revealed, interactiveId, edit, onFrameReady, t)
    })
  }, [edit, interactiveId, onFrameReady, persisted, requestedPages.join('|'), revealed, t])

  useEffect(() => {
    for (const frame of frames.values()) frame.contentWindow?.postMessage({ type: 'prototype-mode', editable: edit }, '*')
    if (!edit) setSelectedElement(null)
  }, [edit, frames])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const message = event.data
      if (typeof message !== 'object' || message === null) return
      if (message.type === 'prototype-selected'
        && typeof message.pageId === 'string' && typeof message.nodeId === 'string'
        && typeof message.tag === 'string' && typeof message.name === 'string' && typeof message.text === 'string'
        && typeof message.canEditText === 'boolean' && typeof message.x === 'number' && typeof message.y === 'number'
        && typeof message.width === 'number' && typeof message.height === 'number'
        && typeof message.color === 'string' && typeof message.backgroundColor === 'string'
        && typeof message.fontSize === 'number' && typeof message.fontWeight === 'string'
        && typeof message.borderRadius === 'number' && typeof message.opacity === 'number') {
        const frame = frames.get(message.pageId)
        if (frame !== undefined && event.source === frame.contentWindow) {
          setSelectedElement({
            pageId: message.pageId, nodeId: message.nodeId, tag: message.tag, name: message.name,
            text: message.text, canEditText: message.canEditText, x: message.x, y: message.y,
            width: message.width, height: message.height, color: message.color,
            backgroundColor: message.backgroundColor, fontSize: message.fontSize,
            fontWeight: message.fontWeight, borderRadius: message.borderRadius, opacity: message.opacity,
          })
        }
      }
      if (message.type === 'prototype-deselected' && typeof message.pageId === 'string') {
        const frame = frames.get(message.pageId)
        if (frame !== undefined && event.source === frame.contentWindow) setSelectedElement(null)
      }
      if (message.type === 'prototype-history' && typeof message.pageId === 'string'
        && (message.direction === 'undo' || message.direction === 'redo')) {
        const frame = frames.get(message.pageId)
        if (frame !== undefined && event.source === frame.contentWindow) {
          const bounded = Math.max(0, Math.min(elementEdits.length, editCursor + (message.direction === 'undo' ? -1 : 1)))
          for (const [pageId, targetFrame] of frames) {
            targetFrame.contentWindow?.postMessage({ type: 'prototype-reset', pageId }, '*')
            for (const operation of elementEdits.slice(0, bounded)) {
              if (operation.pageId === pageId) targetFrame.contentWindow?.postMessage({ type: 'prototype-apply', pageId, operation }, '*')
            }
          }
          setEditCursor(bounded)
          setSelectedElement(null)
        }
      }
      if (message.type === 'prototype-changed' && typeof message.pageId === 'string'
        && typeof message.nodeId === 'string' && typeof message.operation === 'object') {
        const frame = frames.get(message.pageId)
        if (frame !== undefined && event.source === frame.contentWindow) {
          const operation = message.operation as ElementEdit
          if (operation.type === 'move' || operation.type === 'set-text' || operation.type === 'resize'
            || operation.type === 'set-style' || operation.type === 'hide') {
            setElementEdits((current) => {
              const next = [...current.slice(0, editCursor), operation]
              localStorage.setItem(storageKey, JSON.stringify({
                ...persistedCanvas(nodes, viewport, overlay), elementEdits: next,
              }))
              setEditCursor(next.length)
              return next
            })
          }
          setSelectedElement((current) => {
            if (current === null || current.pageId !== message.pageId || current.nodeId !== message.nodeId) return current
            return {
              ...current,
              ...(typeof message.text === 'string' ? { text: message.text } : {}),
              ...(typeof message.width === 'number' ? { width: message.width } : {}),
              ...(typeof message.height === 'number' ? { height: message.height } : {}),
              ...(typeof message.x === 'number' ? { x: message.x } : {}),
              ...(typeof message.y === 'number' ? { y: message.y } : {}),
              ...(typeof message.color === 'string' ? { color: message.color } : {}),
              ...(typeof message.backgroundColor === 'string' ? { backgroundColor: message.backgroundColor } : {}),
              ...(typeof message.fontSize === 'number' ? { fontSize: message.fontSize } : {}),
              ...(typeof message.fontWeight === 'string' ? { fontWeight: message.fontWeight } : {}),
              ...(typeof message.borderRadius === 'number' ? { borderRadius: message.borderRadius } : {}),
              ...(typeof message.opacity === 'number' ? { opacity: message.opacity } : {}),
            }
          })
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [editCursor, elementEdits, frames, nodes, overlay, storageKey, viewport])

  useEffect(() => {
    if (requestedPages.length === 0) return
    setRevealed(0)
    const timers = requestedPages.map((_, index) => setTimeout(() => setRevealed(index + 1), 280 + index * 620))
    const fitTimer = setTimeout(() => { void instance?.fitView(FIT_OPTIONS) }, 350 + requestedPages.length * 620)
    return () => {
      for (const timer of timers) clearTimeout(timer)
      clearTimeout(fitTimer)
    }
  }, [generated?.key, instance, requestedPages.join('|')])

  useEffect(() => {
    if (updates.length === 0) return
    setOverlay((state) => {
      const next = applyOperations(state, updates)
      save(nodes, viewport, next)
      return next
    })
  }, [updateSignature])

  useEffect(() => {
    if (interactiveId === null) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setInteractiveId(null) }
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('keydown', close) }
  }, [interactiveId])

  const onNodesChange = useCallback((changes: NodeChange<ScreenNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current)
      if (changes.some(change => change.type === 'position' && change.dragging !== true)) save(next)
      return next
    })
  }, [save])

  const appendElementEdit = useCallback((operation: ElementEdit): void => {
    setElementEdits((current) => {
      const next = [...current.slice(0, editCursor), operation]
      localStorage.setItem(storageKey, JSON.stringify({
        ...persistedCanvas(nodes, viewport, overlay), elementEdits: next,
      }))
      setEditCursor(next.length)
      return next
    })
  }, [editCursor, nodes, overlay, storageKey, viewport])

  const postOperation = useCallback((operation: ElementEdit): void => {
    appendElementEdit(operation)
    frames.get(operation.pageId)?.contentWindow?.postMessage({
      type: 'prototype-apply', pageId: operation.pageId, operation,
    }, '*')
  }, [appendElementEdit, frames])

  const replayEdits = useCallback((cursor: number): void => {
    const bounded = Math.max(0, Math.min(elementEdits.length, cursor))
    for (const [pageId, frame] of frames) {
      frame.contentWindow?.postMessage({ type: 'prototype-reset', pageId }, '*')
      for (const operation of elementEdits.slice(0, bounded)) {
        if (operation.pageId === pageId) frame.contentWindow?.postMessage({ type: 'prototype-apply', pageId, operation }, '*')
      }
    }
    setEditCursor(bounded)
    setSelectedElement(null)
    localStorage.setItem(storageKey, JSON.stringify({
      ...persistedCanvas(nodes, viewport, overlay), elementEdits: elementEdits.slice(0, bounded),
    }))
  }, [elementEdits, frames, nodes, overlay, storageKey, viewport])

  if (requestedPages.length === 0) {
    return (
      <div className={css.empty} data-conversation-fullscreen-view="prototype">
        <div className={css.emptyMark}>✦</div>
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyBody')}</p>
      </div>
    )
  }

  return (
    <div className={css.root} data-conversation-fullscreen-view="prototype">
      <ReactFlow<ScreenNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_event, node, dragged) => {
          setNodes((current) => {
            const landed = new Map([...dragged, node].map(item => [item.id, item.position]))
            const next = current.map((item) => {
              const position = landed.get(item.id)
              return position === undefined ? item : { ...item, position }
            })
            save(next)
            return next
          })
        }}
        onNodeDoubleClick={(_event, node) => { setInteractiveId(node.id) }}
        onPaneClick={() => { setInteractiveId(null) }}
        onMove={(_event, nextViewport) => { setViewport(nextViewport) }}
        onMoveEnd={(_event, nextViewport) => { setViewport(nextViewport); save(nodes, nextViewport) }}
        onInit={(flow) => { setInstance(flow); if (persisted.viewport !== undefined) void flow.setViewport(persisted.viewport) }}
        defaultViewport={persisted.viewport ?? { x: 0, y: 0, zoom: 0.22 }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView={persisted.viewport === undefined}
        fitViewOptions={FIT_OPTIONS}
        snapToGrid
        snapGrid={[16, 16]}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag
        nodesDraggable={!edit}
        elementsSelectable
        multiSelectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={null}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        className={css.flow}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--prototype-grid-dot)" />
        <Controls className={css.controls ?? ''} showInteractive={false} />
        <MiniMap<ScreenNode>
          className={css.miniMap}
          pannable
          zoomable
          zoomStep={1}
          bgColor="var(--prototype-minimap-bg)"
          nodeColor={node => node.selected ? 'var(--dsw-alias-state-business-primary)' : 'var(--prototype-minimap-node)'}
          maskColor="var(--prototype-minimap-mask)"
          ariaLabel={t('miniMap')}
        />
        <Panel position="top-left" className={pagesCollapsed ? css.pagePanelCollapsed : css.pagePanel}>
          {pagesCollapsed ? (
            <button
              type="button"
              className={css.pageOrb}
              aria-label={t('expandPages')}
              onClick={() => { setPagesCollapsed(false) }}
            >
              <span>{revealed}</span>
              <small>/{nodes.length}</small>
            </button>
          ) : (
            <>
              <header className={css.trackerHeader}>
                <div className={css.trackerIcon}>✦</div>
                <div className={css.trackerHeading}>
                  <strong>{overlay.title}</strong>
                  <span>{t('generatedSubtitle')}</span>
                </div>
                <button
                  type="button"
                  className={css.collapseButton}
                  aria-label={t('collapsePages')}
                  onClick={() => { setPagesCollapsed(true) }}
                >⌃</button>
              </header>
              <section className={css.trackerProgress}>
                <div className={css.progressNumbers}>
                  <strong>{revealed}</strong>
                  <span>{t('generatedOf', { count: String(nodes.length) })}</span>
                  <em>{t('generatedLabel')}</em>
                </div>
                <div className={css.progressTrack}>
                  <i style={{ width: `${nodes.length === 0 ? 0 : Math.round(revealed / nodes.length * 100)}%` }} />
                </div>
              </section>
              <div className={css.pageList}>
                {nodes.map((node, index) => (
                  <button
                    key={node.id}
                    type="button"
                    data-complete={index < revealed || undefined}
                    onClick={() => { void instance?.fitView({ ...FIT_OPTIONS, nodes: [node], maxZoom: 0.72 }) }}
                  >
                    <span className={css.pageStep}>{index < revealed ? '✓' : String(index + 1).padStart(2, '0')}</span>
                    <span className={css.pageName}>{node.data.label}</span>
                    <small>{t('compactWidth', { width: String(Math.round(node.data.width / 100) / 10) })}</small>
                  </button>
                ))}
              </div>
              <button type="button" className={css.fitAllButton} onClick={() => { void instance?.fitView(FIT_OPTIONS) }}>
                {t('fitAll')}
              </button>
            </>
          )}
        </Panel>
        <Panel position="top-right" className={css.toolbar}>
          <span className={css.status}><i data-ready={revealed === nodes.length || undefined} />{t(revealed === nodes.length ? 'ready' : 'generating')}</span>
          <span className={css.zoomPill}>{Math.round(viewport.zoom * 100)}%</span>
          <button type="button" onClick={() => { void instance?.fitView(FIT_OPTIONS) }}>{t('fit')}</button>
          <button type="button" data-active={edit || undefined} onClick={() => { setEdit(value => !value) }}>{t(edit ? 'browse' : 'edit')}</button>
          {edit && <>
            <span className={css.toolDivider} />
            <button type="button" disabled={editCursor === 0} aria-label={t('undo')} onClick={() => { replayEdits(editCursor - 1) }}>↶</button>
            <button type="button" disabled={editCursor >= elementEdits.length} aria-label={t('redo')} onClick={() => { replayEdits(editCursor + 1) }}>↷</button>
          </>}
          {interactiveId !== null && <button type="button" data-active onClick={() => { setInteractiveId(null) }}>{t('exitPreview')}</button>}
        </Panel>
        <Panel position="bottom-right" className={css.canvasMeta}>{nodes.length} {t('pageCount')} · {Math.round(viewport.zoom * 100)}%</Panel>
      </ReactFlow>
      {edit && (
        <aside className={css.properties}>
          <header className={css.propertyHeader}>
            <div><div className={css.section}>{t('properties')}</div><strong>{selectedElement?.name ?? t('nothingSelected')}</strong></div>
            <button type="button" aria-label={t('closeProperties')} onClick={() => { setEdit(false) }}>×</button>
          </header>
          {selectedElement === null
            ? <div className={css.emptySelection}><span>⌖</span><p>{t('selectElement')}</p><small>{t('selectionShortcut')}</small></div>
            : <>
              <div className={css.selectedMeta}><span>{selectedElement.tag}</span><code>{selectedElement.nodeId}</code></div>
              <section className={css.propertyGroup}>
                <h3>{t('layout')}</h3>
                <div className={css.fieldGrid}>
                  <label>{t('positionX')}<input readOnly value={Math.round(selectedElement.x)} /></label>
                  <label>{t('positionY')}<input readOnly value={Math.round(selectedElement.y)} /></label>
                  <label>{t('widthShort')}<input type="number" min="8" value={Math.round(selectedElement.width)} onChange={(event) => {
                    const width = Number(event.target.value); if (!Number.isFinite(width) || width < 8) return
                    setSelectedElement(current => current === null ? current : { ...current, width })
                    postOperation({ type: 'resize', nodeId: selectedElement.nodeId, pageId: selectedElement.pageId, width, height: selectedElement.height })
                  }} /></label>
                  <label>{t('heightShort')}<input type="number" min="8" value={Math.round(selectedElement.height)} onChange={(event) => {
                    const height = Number(event.target.value); if (!Number.isFinite(height) || height < 8) return
                    setSelectedElement(current => current === null ? current : { ...current, height })
                    postOperation({ type: 'resize', nodeId: selectedElement.nodeId, pageId: selectedElement.pageId, width: selectedElement.width, height })
                  }} /></label>
                </div>
              </section>
              {selectedElement.canEditText && <section className={css.propertyGroup}>
                <h3>{t('typography')}</h3>
                <label>{t('elementText')}<textarea value={selectedElement.text} onChange={(event) => {
                  const value = event.target.value; setSelectedElement(current => current === null ? current : { ...current, text: value })
                  postOperation({ type: 'set-text', nodeId: selectedElement.nodeId, pageId: selectedElement.pageId, value })
                }} /></label>
                <div className={css.fieldGrid}>
                  <label>{t('fontSize')}<input type="number" min="1" value={Math.round(selectedElement.fontSize)} onChange={(event) => {
                    const fontSize = Number(event.target.value); if (!Number.isFinite(fontSize) || fontSize < 1) return
                    setSelectedElement(current => current === null ? current : { ...current, fontSize })
                    postOperation({ type: 'set-style', property: 'fontSize', value: `${fontSize}px`, nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                  }} /></label>
                  <label>{t('fontWeight')}<select value={selectedElement.fontWeight} onChange={(event) => {
                    const fontWeight = event.target.value
                    setSelectedElement(current => current === null ? current : { ...current, fontWeight })
                    postOperation({ type: 'set-style', property: 'fontWeight', value: fontWeight, nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                  }}><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option></select></label>
                </div>
              </section>}
              <section className={css.propertyGroup}>
                <h3>{t('appearance')}</h3>
                <div className={css.colorRow}><label>{t('textColor')}<input type="color" value={cssColor(selectedElement.color, '#111111')} onChange={(event) => {
                  const color = event.target.value; setSelectedElement(current => current === null ? current : { ...current, color })
                  postOperation({ type: 'set-style', property: 'color', value: color, nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                }} /></label><label>{t('fillColor')}<input type="color" value={cssColor(selectedElement.backgroundColor, '#ffffff')} onChange={(event) => {
                  const backgroundColor = event.target.value
                  setSelectedElement(current => current === null ? current : { ...current, backgroundColor })
                  postOperation({ type: 'set-style', property: 'backgroundColor', value: backgroundColor, nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                }} /></label></div>
                <div className={css.fieldGrid}>
                  <label>{t('radius')}<input type="number" min="0" value={Math.round(selectedElement.borderRadius)} onChange={(event) => {
                    const borderRadius = Number(event.target.value); if (!Number.isFinite(borderRadius) || borderRadius < 0) return
                    setSelectedElement(current => current === null ? current : { ...current, borderRadius })
                    postOperation({ type: 'set-style', property: 'borderRadius', value: `${borderRadius}px`, nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                  }} /></label>
                  <label>{t('opacity')}<input type="number" min="0" max="100" value={Math.round(selectedElement.opacity * 100)} onChange={(event) => {
                    const opacity = Number(event.target.value) / 100; if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return
                    setSelectedElement(current => current === null ? current : { ...current, opacity })
                    postOperation({ type: 'set-style', property: 'opacity', value: String(opacity), nodeId: selectedElement.nodeId, pageId: selectedElement.pageId })
                  }} /></label>
                </div>
              </section>
              <div className={css.elementActions}>
                <button type="button" onClick={() => { frames.get(selectedElement.pageId)?.contentWindow?.postMessage({ type: 'prototype-command', pageId: selectedElement.pageId, command: 'select-parent' }, '*') }}>{t('selectParent')}</button>
                {selectedElement.canEditText && <button type="button" onClick={() => { frames.get(selectedElement.pageId)?.contentWindow?.postMessage({ type: 'prototype-command', pageId: selectedElement.pageId, command: 'edit-text' }, '*') }}>{t('editInPlace')}</button>}
                <button type="button" className={css.dangerAction} onClick={() => { postOperation({ type: 'hide', nodeId: selectedElement.nodeId, pageId: selectedElement.pageId }); setSelectedElement(null) }}>{t('hideElement')}</button>
              </div>
            </>}
          <button type="button" className={css.reset} onClick={() => {
            const next = { ...overlay, title: t('defaultTitle'), titleVisible: true }
            setOverlay(next); setElementEdits([]); setEditCursor(0); setSelectedElement(null)
            for (const [pageId, frame] of frames) frame.contentWindow?.postMessage({ type: 'prototype-reset', pageId }, '*')
            localStorage.setItem(storageKey, JSON.stringify({ ...persistedCanvas(nodes, viewport, next), elementEdits: [] }))
          }}>{t('reset')}</button>
        </aside>
      )}
    </div>
  )
}

/** Render the packaged multi-page prototype as an xyflow infinite canvas. */
export function PrototypeCanvas(props: Props) {
  return <ReactFlowProvider><PrototypeFlow {...props} /></ReactFlowProvider>
}
