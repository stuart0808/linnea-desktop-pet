import React from "react";
import { parseMarkdownBlocks, renderCodexInlineMarkdown } from "../../utils/codexHelpers";

export function MarkdownText({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(text), [text]);
  return (
    <div className="codex-markdown">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <figure key={index} className="codex-code-block">
              {block.language && <figcaption>{block.language}</figcaption>}
              <pre><code>{block.text}</code></pre>
            </figure>
          );
        }
        if (block.type === "heading") {
          const Heading = `h${Math.min(3, block.level)}` as "h1" | "h2" | "h3";
          return <Heading key={index}>{renderCodexInlineMarkdown(block.text)}</Heading>;
        }
        if (block.type === "quote") return <blockquote key={index}>{renderCodexInlineMarkdown(block.text)}</blockquote>;
        if (block.type === "table") {
          return (
            <div key={index} className="codex-table-wrap">
              <table>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => rowIndex === 0
                        ? <th key={cellIndex}>{renderCodexInlineMarkdown(cell)}</th>
                        : <td key={cellIndex}>{renderCodexInlineMarkdown(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderCodexInlineMarkdown(item)}</li>)}
            </ul>
          );
        }
        return <p key={index}>{renderCodexInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
