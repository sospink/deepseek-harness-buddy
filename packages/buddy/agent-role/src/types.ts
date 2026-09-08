/** Client-safe professional-role identifiers, projections, and failures. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable role identifiers recorded in Session logs and sent over Remote. */
export type AgentRoleId =
  | 'general'
  | 'business-requirements-analyst'
  | 'product-solution-designer'
  | 'prototype-designer'
  | 'software-architect'
  | 'ai-application-engineer'
  | 'blockchain-engineer'
  | 'code-review-expert'

/** Stable details for role-selection failures returned to a Client. */
export interface AgentRoleErrorDetailsMap {
  /** The requested role is not in the product catalog. */
  'agent-role-not-found': { readonly agentRole: string; readonly available: readonly AgentRoleId[] }
  /** The Session has started, so its professional role is fixed. */
  'agent-role-locked': { readonly sessionId: SessionId; readonly agentRole: AgentRoleId }
}

/** One role-selection refusal as a Client reads it. */
export type AgentRoleError = {
  [Code in keyof AgentRoleErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: AgentRoleErrorDetailsMap[Code]
  }
}[keyof AgentRoleErrorDetailsMap]

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Last professional role recorded for the Session. */
    agentRole: AgentRoleId
  }
  interface SessionProjectionMap {
    /** Professional working method selected before the Session starts. */
    agentRole: AgentRoleId
  }
}

export {}
