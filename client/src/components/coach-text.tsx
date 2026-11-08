import { Fragment, type ReactNode } from "react";

/** Bold and italics inside a line. Builds React elements, so the coach's text is never treated as HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; start: number; items: string[] };

function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,})$/.test(line) || /^\|[\s:|-]+\|$/.test(line)) continue;
    const last = blocks[blocks.length - 1];
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (heading) blocks.push({ kind: "heading", text: heading[1] });
    else if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[2]);
      else blocks.push({ kind: "ol", start: Number(numbered[1]), items: [numbered[2]] });
    } else if (line.startsWith("|") && line.endsWith("|")) {
      blocks.push({ kind: "text", text: line.slice(1, -1).split("|").map(c => c.trim()).join("  ·  ") });
    } else blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** Shows a coach reply with its headings, bold and lists, instead of the raw symbols. */
export function CoachText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {toBlocks(text).map((b, i) => {
        if (b.kind === "heading" || b.kind === "text") return <p key={i} className={b.kind === "heading" ? "font-semibold" : undefined}>{inline(b.text)}</p>;
        if (b.kind === "ul") return <ul key={i} className="list-disc space-y-1 pl-4">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
        return <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>;
      })}
    </div>
  );
}
