import { memo } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  className?: string;
  content: string;
}

export function getFencedCodeBlock(content: string, language: string): string {
  const longestFence = Math.max(
    3,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length + 1),
  );
  const fence = "`".repeat(longestFence);
  return `${fence}${language}\n${content}\n${fence}`;
}

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <div className="mb-1.5 mt-3 text-base font-semibold text-txt">{children}</div>,
  h2: ({ children }) => <div className="mb-1.5 mt-3 text-sm font-semibold text-txt">{children}</div>,
  h3: ({ children }) => <div className="mb-1.5 mt-3 text-[13px] font-medium text-txt">{children}</div>,
  p: ({ children }) => (
    <p className="my-2 whitespace-pre-wrap text-[12px] leading-relaxed text-txt/90 md:text-[13px]">
      {children}
    </p>
  ),
  a: ({ children, href }) => (
    <a
      className="text-accent underline underline-offset-2 hover:text-accent/80"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-txt">{children}</strong>,
  em: ({ children }) => <em className="italic text-muted">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-accent">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-bdr bg-surface p-3 text-[11px] text-txt/90 md:text-xs">
      {children}
    </div>
  ),
  ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1 text-txt/90">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1 text-txt/90">{children}</ol>,
  li: ({ children }) => <li className="text-[12px] leading-relaxed md:text-[13px]">{children}</li>,
  blockquote: ({ children }) => (
    <div className="my-2 border-l-2 border-bdr pl-3 italic text-muted">{children}</div>
  ),
  hr: () => <hr className="my-4 border-bdr" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-bdr">
      <table className="w-full text-[12px] md:text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-bdr last:border-b-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-txt">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 text-muted">{children}</td>,
};

export const MarkdownRenderer = memo(function MarkdownRenderer(
  props: MarkdownRendererProps,
) {
  const { className = "", content } = props;

  return (
    <div className={`break-words ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </Markdown>
    </div>
  );
});
