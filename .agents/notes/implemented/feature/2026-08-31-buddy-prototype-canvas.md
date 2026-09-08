---
title: Buddy prototype canvas
status: implemented
---

# Buddy prototype canvas

The Buddy product layer presents the supplied ZhiYu City design assets through a dedicated Conversation View. The Positioning Safety Agent receives `generate_prototype` and `update_prototype`; their durable Tool calls and results are the replay source for the canvas. A successful generation Tool card opens the registered `prototype` View through the Session-scoped Conversation action.

The Host serves four packaged HTML prototypes and their PNG fallbacks from an authenticated allowlisted route. HTML executes inside a sandboxed iframe rather than the Harness document. The canvas uses `@xyflow/react` inside the Harness layout, Slot, locale, and Tool-card systems while preserving the prototype's black, electric-mint visual language. Each HTML page is an independent artboard on one infinite dot-grid canvas. The surface supports staged reveal, artboard selection and 16-pixel grid dragging, pointer-anchored wheel/pinch zoom, fit view, dark Controls, a pannable and zoomable MiniMap, page focus actions, browser-local per-Session viewport and node-position state, and a double-click HTML interaction mode that exits through Escape or the toolbar.

Edit mode injects a direct-manipulation bridge into each packaged HTML document. The iframe owns DOM hit testing, stable child-index paths, eight-handle selection geometry, eight-pixel drag/resize snapping, inline leaf-text editing, keyboard nudging, parent selection, bounded style changes, and element hiding. It emits structured operations through `postMessage`; the parent validates the exact iframe source, persists the operation history per Session, replays it after reload, and provides undo, redo, reset, and the property inspector. The editor changes the rendered instance and never writes arbitrary HTML or mutates the packaged source asset. A version query on iframe URLs invalidates immutable browser caches when the injected bridge changes.

This is a controlled editor for packaged HTML prototypes, not a general design-file importer or a claim that the Agent generated the supplied UI from scratch. Arbitrary paths, HTML, nodes, and design files are not accepted by either Tool.

The Buddy launcher uses an attended loopback deployment. Its Connection row enables clean `http://127.0.0.1:3080/` access without the process-token exchange only for loopback Host values. The existing Host and Origin trust fences remain authoritative, non-loopback authorities still require browser authentication, and the WebServer remains bound to `127.0.0.1`.
