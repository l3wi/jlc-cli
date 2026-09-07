/**
 * Yield direct children of an outer S-expression with original, end-exclusive offsets.
 * Quoted strings may contain parentheses and escaped character pairs. Exhaust the
 * iterator to validate balanced parentheses and terminated strings.
 */
export function* childExpressions(content: string): Generator<{ start: number; end: number }> {
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '(') {
      if (++depth === 2) start = i;
    } else if (char === ')') {
      if (depth-- === 2) yield { start, end: i + 1 };
      if (depth < 0) throw new Error('Invalid S-expression: unbalanced parentheses');
    }
  }
  if (depth !== 0 || inString) throw new Error('Invalid S-expression');
}
