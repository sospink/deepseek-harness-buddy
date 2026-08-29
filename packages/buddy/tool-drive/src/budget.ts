/** Exact UTF-8 budgeting shared by tool canonical values and rendered text. */

/** UTF-8 byte length of one string. */
export function utf8Bytes(value: string): number { return Buffer.byteLength(value, 'utf8') }

/** Largest valid UTF-8 prefix, never cutting a scalar value. */
export function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  if (utf8Bytes(value) <= maxBytes) return value
  let used = 0
  let result = ''
  for (const scalar of value) {
    const bytes = utf8Bytes(scalar)
    if (used + bytes > maxBytes) break
    result += scalar
    used += bytes
  }
  return result
}

/** JSON byte length of one tool canonical value. */
export function jsonBytes(value: unknown): number { return utf8Bytes(JSON.stringify(value)) }

/** Normalize line endings before line-addressed search/read. */
export function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').replace(/\u0000/gu, '')
}

/** Add complete lines while both JSON and rendered forms fit their full budgets. */
function assertFits<T>(value: T, render: (value: T) => string, maxValueBytes: number, maxRenderBytes: number): void {
  if (jsonBytes(value) > maxValueBytes) throw new Error('Buddy Drive canonical result envelope exceeds maxValueBytes.')
  if (utf8Bytes(render(value)) > maxRenderBytes) throw new Error('Buddy Drive rendered result envelope exceeds maxRenderBytes.')
}

export function fitTextWindow<T extends { text: string }>(input: {
  readonly lines: readonly string[]
  readonly startLine: number
  readonly maxLines: number
  readonly maxValueBytes: number
  readonly maxRenderBytes: number
  readonly value: (text: string, endLine: number, truncated: boolean) => T
  readonly render: (value: T) => string
}): T {
  const selected = input.lines.slice(input.startLine - 1, input.startLine - 1 + input.maxLines)
  let accepted: string[] = []
  let result = input.value('', input.startLine - 1, selected.length < input.lines.length - input.startLine + 1)
  assertFits(result, input.render, input.maxValueBytes, input.maxRenderBytes)
  for (const line of selected) {
    const candidateLines = [...accepted, line]
    const text = candidateLines.join('\n')
    const endLine = input.startLine + candidateLines.length - 1
    const truncated = endLine < input.lines.length
    const candidate = input.value(text, endLine, truncated)
    if (jsonBytes(candidate) > input.maxValueBytes || utf8Bytes(input.render(candidate)) > input.maxRenderBytes) break
    accepted = candidateLines
    result = candidate
  }
  if (accepted.length < selected.length) {
    result = input.value(accepted.join('\n'), input.startLine + accepted.length - 1, true)
    assertFits(result, input.render, input.maxValueBytes, input.maxRenderBytes)
  }
  return result
}

/** Add whole items until the structured value and its render both fit. */
export function fitItems<T, V>(input: {
  readonly items: readonly T[]
  readonly limit: number
  readonly maxValueBytes: number
  readonly maxRenderBytes: number
  readonly value: (items: T[], truncated: boolean) => V
  readonly render: (value: V) => string
}): V {
  const capped = input.items.slice(0, input.limit)
  let accepted: T[] = []
  let result = input.value([], input.items.length > 0)
  assertFits(result, input.render, input.maxValueBytes, input.maxRenderBytes)
  for (const item of capped) {
    const candidateItems = [...accepted, item]
    const candidate = input.value(candidateItems, candidateItems.length < input.items.length)
    if (jsonBytes(candidate) > input.maxValueBytes || utf8Bytes(input.render(candidate)) > input.maxRenderBytes) break
    accepted = candidateItems
    result = candidate
  }
  if (accepted.length < input.items.length) {
    result = input.value(accepted, true)
    assertFits(result, input.render, input.maxValueBytes, input.maxRenderBytes)
  }
  return result
}
