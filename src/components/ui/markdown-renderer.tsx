"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { normalizeLegacyEscapedMarkdown } from "@/lib/markdown";

function safeMarkdownUrl(url: string) {
  const normalized = url.trim().toLocaleLowerCase();
  if (normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("mailto:") || normalized.startsWith("/") || normalized.startsWith("#") || normalized.startsWith("./") || normalized.startsWith("../")) return url;
  return normalized.includes(":") || normalized.startsWith("//") ? "" : url;
}

export function MarkdownRenderer({ content, className = "", resolveLink }: { content: string; className?: string; resolveLink?: (href: string) => string }) {
  const renderedMarkdown = normalizeLegacyEscapedMarkdown(content);
  if (!content) return <p className="text-muted-foreground">（空 Markdown 文档）</p>;
  return (
    <div className={`markdown-reading max-w-none text-[15px] leading-7 text-foreground ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        urlTransform={(href, key) => safeMarkdownUrl(resolveLink && key === "href" ? resolveLink(href) : href)}
        components={{
          h1: ({ children }) => <h1 className="mb-5 mt-8 border-b border-border pb-3 text-3xl font-black tracking-[-0.03em] first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-4 mt-8 border-b border-border pb-2 text-2xl font-black tracking-[-0.025em]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-7 text-xl font-black">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-6 text-lg font-black">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 mt-5 text-base font-black">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 mt-5 text-sm font-black uppercase tracking-[0.08em] text-muted-foreground">{children}</h6>,
          p: ({ children }) => <p className="my-4">{children}</p>, strong: ({ children }) => <strong className="font-black">{children}</strong>, em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>, ol: ({ children }) => <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-5 border-l-4 border-primary bg-[hsl(var(--surface-subtle)/0.6)] px-5 py-1 text-muted-foreground">{children}</blockquote>,
          a: ({ href = "", children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="font-bold underline decoration-primary underline-offset-4">{children}</a>,
          code: ({ children, className: codeClassName }) => <code className={codeClassName ? `markdown-reading-code-block font-mono text-[13px] ${codeClassName}` : "markdown-reading-inline-code font-mono text-[13px]"}>{children}</code>,
          pre: ({ children }) => <pre className="markdown-reading-code-block-container my-5 overflow-x-auto border p-4 font-mono text-[13px] leading-6">{children}</pre>,
          table: ({ children }) => <div className="my-6 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-[hsl(var(--surface-subtle))]">{children}</thead>,
          th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-black">{children}</th>, td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>, hr: () => <hr className="my-8 border-0 border-t border-border" />
        }}
      >
        {renderedMarkdown}
      </ReactMarkdown>
    </div>
  );
}
