import type { ReactNode } from "react";

/**
 * 极简 Markdown 渲染器,只覆盖项目 README 用到的语法子集:
 * 标题、引用、表格、围栏代码块、无序列表、水平线、段落,
 * 行内的粗体 / 行内代码 / 链接 / 图片。输出 React 元素,不走 innerHTML。
 */

type ResolveUrl = (url: string) => string;

function renderInline(text: string, resolveUrl: ResolveUrl): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<img key={key++} className="md-img" src={resolveUrl(match[2])} alt={match[1]} loading="lazy" />);
    } else if (match[3] !== undefined) {
      nodes.push(<a key={key++} className="md-link" href={resolveUrl(match[4])} target="_blank" rel="noreferrer">{match[3]}</a>);
    } else if (match[5] !== undefined) {
      nodes.push(<strong key={key++} className="md-strong">{match[5]}</strong>);
    } else {
      nodes.push(<code key={key++} className="md-code">{match[6]}</code>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START = /^(#{1,2} |>|\||- |```|-{3,}$)/;

export function renderMarkdown(markdown: string, resolveUrl: ResolveUrl): ReactNode[] {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={key++} className="md-pre"><code>{buf.join("\n")}</code></pre>);
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="md-hr" />);
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++} className="md-h2">{renderInline(line.slice(3), resolveUrl)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++} className="md-h1">{renderInline(line.slice(2), resolveUrl)}</h1>);
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      const quoteLines = buf.filter((l) => l.trim());
      blocks.push(
        <blockquote key={key++} className="md-quote">
          {quoteLines.map((l, j) => <p key={j}>{renderInline(l, resolveUrl)}</p>)}
        </blockquote>,
      );
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i++].split("|").slice(1, -1).map((c) => c.trim()));
      }
      const bodyRows = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      blocks.push(
        <div key={key++} className="md-table">
          {bodyRows.map((r, ri) => (
            <div key={ri} className="md-table__row">
              {r.map((c, ci) => <div key={ci} className="md-table__cell">{renderInline(c, resolveUrl)}</div>)}
            </div>
          ))}
        </div>,
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={key++} className="md-list">
          {items.map((it, j) => <li key={j}>{renderInline(it, resolveUrl)}</li>)}
        </ul>,
      );
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    blocks.push(
      <p key={key++} className="md-p">
        {buf.map((l, j) => (
          <span key={j}>
            {renderInline(l, resolveUrl)}
            {j < buf.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
  }

  return blocks;
}
