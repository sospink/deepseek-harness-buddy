/** Durable professional-role selection and model context for Buddy Sessions. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { AgentRoleErrorDetailsMap, AgentRoleId } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentRoles: AgentRoleService
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Selects the Session's professional working method. Log-only: prompt
     * assembly folds this event, so resume and fork reproduce the same role.
     */
    'agent-role/selected': { agentRole: AgentRoleId }
  }
}

/** Default working method used when a Session carries no explicit role event. */
export const DEFAULT_AGENT_ROLE = 'general' satisfies AgentRoleId

/** Product-owned role catalog in stable presentation order. */
export const AGENT_ROLE_IDS = [
  DEFAULT_AGENT_ROLE,
  'business-requirements-analyst',
  'product-solution-designer',
  'prototype-designer',
  'software-architect',
  'ai-application-engineer',
  'blockchain-engineer',
  'code-review-expert',
] as const satisfies readonly AgentRoleId[]

const roleSchema = z.enum(AGENT_ROLE_IDS)

/** Current professional role, folded from the Session log. */
export function effectiveAgentRole(events: readonly SessionEvent[]): AgentRoleId {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as SessionEvent
    if (event.type === 'agent-role/selected') return event.data.agentRole
  }
  return DEFAULT_AGENT_ROLE
}

/** Session projection used by cold lists and the browser role selector. */
export const agentRoleProjectionDefinition = {
  key: 'agentRole',
  stateSchema: roleSchema,
  init: () => DEFAULT_AGENT_ROLE,
  apply: (state, event) => event.type === 'agent-role/selected' ? event.data.agentRole : state,
  wire: { viewSchema: roleSchema, view: state => state },
  stateVersion: 1,
} satisfies ProjectionDefinition<'agentRole', AgentRoleId>

const ROLE_CONTEXT: Readonly<Record<Exclude<AgentRoleId, 'general'>, string>> = {
  'business-requirements-analyst': `Professional role: Business Requirements Analyst.
Treat this as a working method, not a change to tool permissions. Structure the work around business goals, stakeholders, current process, pain points, business rules, scope boundaries, assumptions, dependencies, and testable acceptance criteria. Identify missing or conflicting requirements before committing to a conclusion. Follow the user's actual task and do not invent domain facts.`,
  'product-solution-designer': `Professional role: Product Solution Designer.
Treat this as a working method, not a change to tool permissions. Translate the request into user scenarios, product flows, information architecture, capability priorities, success metrics, release boundaries, and an evolvable roadmap. Make trade-offs explicit and keep recommendations tied to the user's actual goal. Do not invent research evidence or business facts.`,
  'prototype-designer': `Professional role: Prototype Designer.
Treat this as a working method, not a change to tool permissions. Define task flows, page hierarchy, interaction states, component behavior, responsive rules, and empty, loading, success, and error states. Make the prototype implementable and preserve the user's established visual system. Ask only for critical missing decisions and do not present guesses as validated user research.`,
  'software-architect': `Professional role: Software Architect.
Treat this as a working method, not a change to tool permissions. Start from functional and non-functional requirements, then reason about system boundaries, modules, interfaces, data models, deployment, security, observability, failure modes, evolution, and trade-offs. Prefer the simplest architecture that satisfies the constraints and do not invent infrastructure facts.`,
  'ai-application-engineer': `Professional role: AI Application Engineer.
Treat this as a working method, not a change to tool permissions. Cover model and provider choice, prompting, agents or workflows, retrieval, tool use, evaluation, observability, latency, cost, privacy, and safety. Design measurable evaluations and failure handling before claiming quality. Follow the user's actual task and do not invent model capabilities or benchmark results.`,
  'blockchain-engineer': `Professional role: Blockchain Engineer.
Treat this as a working method, not a change to tool permissions. Establish the trust model first, then define chain and off-chain boundaries, contracts, data ownership, keys, networks, consensus assumptions, transaction lifecycle, auditability, and attack surfaces. Do not force blockchain into a problem that does not benefit from decentralized trust, and do not invent protocol guarantees.`,
  'code-review-expert': `Professional role: Code Review Expert.
Treat this as a working method, not a change to tool permissions. Review for correctness, security, data loss, concurrency, performance, compatibility, maintainability, and test coverage. Prioritize actionable findings by impact, cite precise files and lines when available, explain the failure scenario, and distinguish confirmed defects from questions or optional improvements.`,
}

/** Render the dynamic model context for one logged role. */
export function renderAgentRoleContext(role: AgentRoleId): string {
  if (role === DEFAULT_AGENT_ROLE) return ''
  return ROLE_CONTEXT[role]
}

function roleFailure<Code extends keyof AgentRoleErrorDetailsMap>(
  code: Code,
  message: string,
  details: AgentRoleErrorDetailsMap[Code],
): TypertRemoteFailure {
  return new TypertRemoteFailure({ code, message, details })
}

/** Host service owning role selection, projection, and request-time context. */
export class AgentRoleService extends TypertRemoteService {
  static inject = ['sessions', 'systemPrompt', 'sessionProjections']

  constructor(ctx: Context) {
    super(ctx, 'agentRoles')
    ctx.sessionProjections.register(agentRoleProjectionDefinition)
    ctx.systemPrompt.context({
      name: 'buddy:agent-role',
      order: 105,
      text: context => context.agent === undefined
        ? ''
        : renderAgentRoleContext(effectiveAgentRole(context.agent.session.events)),
    })
    ctx.on('session/created', (session) => { this.pinDefault(session) })
  }

  /**
   * Select a role for a blank Session and record the committed value.
   * @param agent - Blank-session Agent whose identity becomes fixed.
   * @param agentRole - Requested stable role identifier.
   * @returns The validated and durably selected role identifier.
   */
  @Remote('select')
  select(agent: Agent, agentRole: string): AgentRoleId {
    const parsed = roleSchema.safeParse(agentRole)
    if (!parsed.success) {
      throw roleFailure(
        'agent-role-not-found',
        `unknown agent role "${agentRole}"`,
        { agentRole, available: AGENT_ROLE_IDS },
      )
    }
    if (agent.session.events.some(event => event.type === 'turn/start')) {
      throw roleFailure(
        'agent-role-locked',
        `session "${agent.id}" has already started; its professional role is fixed`,
        { sessionId: agent.id, agentRole: parsed.data },
      )
    }
    if (effectiveAgentRole(agent.session.events) !== parsed.data) {
      agent.session.append('agent-role/selected', { agentRole: parsed.data })
    }
    return parsed.data
  }

  /** Record the default on a fresh Session so its visible identity is durable. */
  private pinDefault(session: Session): void {
    if (session.events.some(event => event.type === 'agent-role/selected')) return
    if (session.events.some(event => event.type === 'session/end-seed')) return
    session.append('agent-role/selected', { agentRole: DEFAULT_AGENT_ROLE })
  }
}

export default AgentRoleService
