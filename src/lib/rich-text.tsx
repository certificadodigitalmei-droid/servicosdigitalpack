import React from 'react';

/**
 * Formatação estilo WhatsApp + cor:
 *   *negrito*      → <strong>
 *   _itálico_      → <em>
 *   ~riscado~      → <s>
 *   {c:#ff0000}texto{/c} → cor customizada
 *   quebras de linha são preservadas
 */
export function renderRich(input: string | null | undefined): React.ReactNode {
  if (!input) return null;
  return parseSegments(input);
}

type Node = string | { type: 'b' | 'i' | 's' | 'color'; color?: string; children: Node[] };

function tokenize(text: string): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // color tag {c:#hex}...{/c}
    const colorMatch = text.slice(i).match(/^\{c:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}/);
    if (colorMatch) {
      const close = text.indexOf('{/c}', i + colorMatch[0].length);
      if (close !== -1) {
        const inner = text.slice(i + colorMatch[0].length, close);
        nodes.push({ type: 'color', color: colorMatch[1], children: tokenize(inner) });
        i = close + 4;
        continue;
      }
    }

    const ch = text[i];
    const marker = ch === '*' ? 'b' : ch === '_' ? 'i' : ch === '~' ? 's' : null;
    if (marker) {
      // find matching closing marker on same line, not immediately after opener
      const rest = text.slice(i + 1);
      const closeIdx = rest.search(new RegExp(`\\${ch}`));
      const newlineIdx = rest.indexOf('\n');
      if (closeIdx > 0 && (newlineIdx === -1 || closeIdx < newlineIdx)) {
        const inner = rest.slice(0, closeIdx);
        nodes.push({ type: marker, children: tokenize(inner) });
        i += 1 + closeIdx + 1;
        continue;
      }
    }

    // plain char — accumulate until next special
    let j = i;
    while (j < len) {
      const c = text[j];
      if (c === '*' || c === '_' || c === '~' || c === '{') break;
      j++;
    }
    if (j === i) j = i + 1;
    nodes.push(text.slice(i, j));
    i = j;
  }
  return nodes;
}

function renderNodes(nodes: Node[], keyPrefix = ''): React.ReactNode {
  return nodes.map((n, idx) => {
    const k = `${keyPrefix}-${idx}`;
    if (typeof n === 'string') {
      // preserve line breaks
      const parts = n.split('\n');
      return parts.map((p, pi) => (
        <React.Fragment key={`${k}-${pi}`}>
          {pi > 0 ? <br /> : null}
          {p}
        </React.Fragment>
      ));
    }
    if (n.type === 'b') return <strong key={k}>{renderNodes(n.children, k)}</strong>;
    if (n.type === 'i') return <em key={k}>{renderNodes(n.children, k)}</em>;
    if (n.type === 's') return <s key={k}>{renderNodes(n.children, k)}</s>;
    if (n.type === 'color')
      return (
        <span key={k} style={{ color: n.color }}>
          {renderNodes(n.children, k)}
        </span>
      );
    return null;
  });
}

function parseSegments(text: string): React.ReactNode {
  return renderNodes(tokenize(text));
}
