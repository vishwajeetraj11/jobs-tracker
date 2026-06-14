import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownRenderer({ markdown }: { markdown: string }) {
  return (
    <article className="prose max-w-[72ch] prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[color:var(--career-ink)] prose-p:leading-7 prose-p:text-[color:var(--career-ink-muted)] prose-li:leading-7 prose-li:text-[color:var(--career-ink-muted)] prose-strong:text-[color:var(--career-ink)] prose-a:text-[color:var(--career-accent-strong)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  );
}
