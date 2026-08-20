import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/**
 * Full-markdown renderer for chat transcript text. Wraps `react-markdown` with GitHub-flavored
 * markdown (tables, task lists, strikethrough, autolinks) and syntax-highlighted fenced code
 * (via `rehype-highlight`, which tags tokens with `hljs-*` classes — themed in index.css under
 * `.md`). Output is styled by the scoped rules in index.css so it stays theme-aware (dark/light)
 * without a heavy prose plugin. Long code blocks scroll horizontally inside their own container
 * (see the `pre` override) so they never widen the chat pane.
 *
 * Links carry `target="_blank" rel="noopener noreferrer"` so an external target is never navigated
 * to in-app. In the desktop shell the webview can't act on that on its own, so the app-wide
 * interceptor (`installExternalLinkHandler`) catches the click and hands the URL to the real
 * browser — no project context needed at this leaf.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`md min-w-0 ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // Fenced/long code scrolls inside its own box rather than stretching the pane. The
          // highlighter marks block code with `class="hljs …"`; inline code has no such class,
          // so we only wrap the block variant in a scroller.
          pre: ({ node: _node, ...props }) => (
            <pre {...props} className="overflow-x-auto" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
