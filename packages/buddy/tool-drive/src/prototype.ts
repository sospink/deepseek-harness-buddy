/** Model-facing tools for presenting and revising the packaged prototype canvas. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

const PAGE_IDS = ['home', 'drone-registration', 'blockchain-center', 'user-management'] as const
const OPERATION_TYPES = ['set-text', 'set-color', 'move', 'resize', 'show', 'hide'] as const

/** Tools added to the Positioning Safety Agent for the controlled prototype canvas. */
export const PROTOTYPE_TOOL_NAMES = ['generate_prototype', 'update_prototype'] as const

/** Register controlled prototype presentation and update tools.
 * @param ctx - Agent scope carrying the tool registry.
 */
export function registerPrototypeTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'generate_prototype',
    description: 'Present the packaged ZhiYu City product prototype on the interactive canvas. Use this when the user asks to design, generate, show, or preview the supplied product UI.',
    parameters: {
      prototype_id: {
        type: 'string', required: true, enum: ['zhiyu-city'] as const,
        description: 'Packaged prototype identity. The only available value is zhiyu-city.',
      },
      pages: {
        type: 'array', required: true, items: { type: 'string', enum: PAGE_IDS },
        description: 'Pages to present, in canvas order. Choose at least one unique page.',
      },
      brief: {
        type: 'string', required: true,
        description: 'Short user-facing design rationale grounded in the request.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          canvasId: { type: 'string', required: true },
          prototypeId: { type: 'string', required: true },
          pages: { type: 'array', required: true, items: { type: 'string', enum: PAGE_IDS } },
          brief: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Prototype ${value.canvasId} is ready on the canvas with ${String(value.pages.length)} page(s).`,
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec) {
      const pages = [...new Set(args.pages)]
      if (pages.length === 0) throw new Error('generate_prototype pages must contain at least one page.')
      const brief = args.brief.trim()
      if (brief === '') throw new Error('generate_prototype brief must not be empty.')
      return {
        canvasId: `${String(exec.callId)}-zhiyu-city`,
        prototypeId: args.prototype_id,
        pages,
        brief,
      }
    },
    presentCall: args => ({
      card: 'generic', title: 'Generate product prototype', rawInput: args,
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'update_prototype',
    description: 'Apply controlled edits to the active ZhiYu City prototype canvas. Use only node ids exposed by the canvas, such as canvas-title and canvas-accent.',
    parameters: {
      canvas_id: { type: 'string', required: true, description: 'Canvas identity returned by generate_prototype.' },
      operations: {
        type: 'array', required: true,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            type: { type: 'string', required: true, enum: OPERATION_TYPES },
            node_id: { type: 'string', required: true, enum: ['canvas-title', 'canvas-accent'] as const },
            value: { type: 'string', description: 'Text or CSS color for set-text and set-color.' },
            x: { type: 'number', description: 'Horizontal position for move.' },
            y: { type: 'number', description: 'Vertical position for move.' },
            width: { type: 'number', description: 'Width for resize.' },
            height: { type: 'number', description: 'Height for resize.' },
          },
        },
        description: 'One or more controlled canvas edits.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          canvasId: { type: 'string', required: true },
          operations: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: true,
              properties: {
                type: { type: 'string', required: true },
                node_id: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text', text: `Applied ${String(value.operations.length)} controlled prototype edit(s).`,
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute(args) {
      if (args.canvas_id.trim() === '') throw new Error('update_prototype canvas_id must not be empty.')
      if (args.operations.length === 0) throw new Error('update_prototype operations must not be empty.')
      for (const operation of args.operations) {
        if ((operation.type === 'set-text' || operation.type === 'set-color')
          && (operation.value === undefined || operation.value.trim() === '')) {
          throw new Error(`${operation.type} requires a non-empty value.`)
        }
        if (operation.type === 'move'
          && (!Number.isFinite(operation.x) || !Number.isFinite(operation.y))) {
          throw new Error('move requires finite x and y values.')
        }
        if (operation.type === 'resize'
          && (!(operation.width !== undefined && operation.width > 0)
            || !(operation.height !== undefined && operation.height > 0))) {
          throw new Error('resize requires positive width and height values.')
        }
      }
      return { canvasId: args.canvas_id, operations: args.operations }
    },
    presentCall: args => ({
      card: 'generic', kind: 'edit', title: 'Update product prototype', rawInput: args,
    }),
  }))
}
