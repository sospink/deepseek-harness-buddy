/** Locale-owned copy for the professional-role selector. */

import type { AgentRoleId } from '@sospink/dsh-buddy-agent-role/types'

export type AgentRoleKey =
  | 'hint' | 'productGroup' | 'technologyGroup' | 'qualityGroup' | 'switchRefused'
  | `role.${AgentRoleId}.name`
  | `role.${AgentRoleId}.description`

/** English role-picker copy. */
export const en: Record<AgentRoleKey, string> = {
  hint: 'Professional role for the session you are about to start',
  productGroup: 'Product',
  technologyGroup: 'Technology',
  qualityGroup: 'Quality',
  switchRefused: 'Could not select {name}: {reason}',
  'role.general.name': 'General Agent',
  'role.general.description': 'Balanced assistance without a specialized working method.',
  'role.business-requirements-analyst.name': 'Business Requirements Analyst',
  'role.business-requirements-analyst.description': 'Clarifies goals, stakeholders, rules, scope, and acceptance criteria.',
  'role.product-solution-designer.name': 'Product Solution Designer',
  'role.product-solution-designer.description': 'Shapes scenarios, flows, priorities, metrics, and release plans.',
  'role.prototype-designer.name': 'Prototype Designer',
  'role.prototype-designer.description': 'Designs task flows, page structure, interaction states, and responsive behavior.',
  'role.software-architect.name': 'Software Architect',
  'role.software-architect.description': 'Defines system boundaries, interfaces, data, deployment, and trade-offs.',
  'role.ai-application-engineer.name': 'AI Application Engineer',
  'role.ai-application-engineer.description': 'Builds model, agent, RAG, tool, evaluation, cost, and safety plans.',
  'role.blockchain-engineer.name': 'Blockchain Engineer',
  'role.blockchain-engineer.description': 'Designs trust models, contracts, chain boundaries, keys, and attack surfaces.',
  'role.code-review-expert.name': 'Code Review Expert',
  'role.code-review-expert.description': 'Finds and prioritizes correctness, security, performance, and testing issues.',
}

/** Simplified Chinese role-picker copy. */
export const zh: Record<AgentRoleKey, string> = {
  hint: '为即将开始的会话选择专业身份',
  productGroup: '产品',
  technologyGroup: '技术',
  qualityGroup: '质量',
  switchRefused: '无法选择「{name}」：{reason}',
  'role.general.name': '通用 Agent',
  'role.general.description': '不限定专业方法，提供均衡的通用协作能力。',
  'role.business-requirements-analyst.name': '业务需求分析师',
  'role.business-requirements-analyst.description': '梳理目标、干系人、业务规则、范围边界与验收标准。',
  'role.product-solution-designer.name': '产品方案设计师',
  'role.product-solution-designer.description': '设计用户场景、产品流程、功能优先级、指标与版本路线。',
  'role.prototype-designer.name': '原型设计师',
  'role.prototype-designer.description': '定义任务流、页面结构、交互状态与响应式行为。',
  'role.software-architect.name': '软件架构师',
  'role.software-architect.description': '规划系统边界、模块接口、数据、部署、安全与演进取舍。',
  'role.ai-application-engineer.name': 'AI 应用工程师',
  'role.ai-application-engineer.description': '设计模型、Agent、RAG、工具调用、评测、成本与安全方案。',
  'role.blockchain-engineer.name': '区块链工程师',
  'role.blockchain-engineer.description': '分析信任模型、链上链下边界、合约、密钥与攻击面。',
  'role.code-review-expert.name': '代码审查专家',
  'role.code-review-expert.description': '按影响排序正确性、安全、性能、兼容性与测试问题。',
}

/** Localized name and description keys for one role. */
export function roleKeys(role: AgentRoleId): {
  readonly name: `role.${AgentRoleId}.name`
  readonly description: `role.${AgentRoleId}.description`
} {
  return { name: `role.${role}.name`, description: `role.${role}.description` }
}
