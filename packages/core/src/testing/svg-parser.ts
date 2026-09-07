/** Shared structural parser for vendor reference SVGs; never resolves external entities. */
export interface ReferenceSvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: ReferenceSvgNode[];
  /** Ordered text content for SVG text elements, including nested spans. */
  text: string;
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return String.fromCodePoint(code);
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name] ?? entity;
  });
}

export function parseReferenceSvg(svg: string): ReferenceSvgNode {
  const root: ReferenceSvgNode = { tag: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g;
  let end = 0;
  for (const match of svg.matchAll(tokens)) {
    if (match.index !== end) throw new Error('Malformed reference SVG');
    end = match.index + match[0].length;
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (!token.startsWith('<') || token.startsWith('<![CDATA[')) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== 'text') continue;
        stack[i].text += token.startsWith('<![CDATA[') ? token.slice(9, -3) : decodeXml(token);
        break;
      }
      continue;
    }
    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim();
      if (stack.length === 1 || stack.pop()!.tag !== tag) throw new Error('Unbalanced reference SVG');
      continue;
    }
    const tag = token.match(/^<([\w:.-]+)/)![1];
    const attrs: Record<string, string> = {};
    for (const attr of token.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (Object.hasOwn(attrs, attr[1])) throw new Error(`Duplicate SVG attribute ${attr[1]}`);
      attrs[attr[1]] = decodeXml(attr[2] ?? attr[3]);
    }
    const node: ReferenceSvgNode = { tag, attrs, children: [], text: '' };
    stack.at(-1)!.children.push(node);
    if (!/\/\s*>$/.test(token)) stack.push(node);
  }
  if (end !== svg.length || stack.length !== 1 || root.children.length !== 1 || root.children[0].tag !== 'svg') {
    throw new Error('Malformed reference SVG');
  }
  return root;
}
