import React, { memo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import DOMPurify from 'dompurify'
import { Copy, Check } from 'lucide-react'
import type { Components } from 'react-markdown'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/utils/clipboard'
import { DataTransformErrorBoundary } from '@/components/ui/DataTransformErrorBoundary'

// Import only needed languages for smaller bundle
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json'
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript'
import tsx from 'react-syntax-highlighter/dist/cjs/languages/prism/tsx'
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript'
import jsx from 'react-syntax-highlighter/dist/cjs/languages/prism/jsx'
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python'
import go from 'react-syntax-highlighter/dist/cjs/languages/prism/go'
import rust from 'react-syntax-highlighter/dist/cjs/languages/prism/rust'
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash'
import lua from 'react-syntax-highlighter/dist/cjs/languages/prism/lua'
import clojure from 'react-syntax-highlighter/dist/cjs/languages/prism/clojure'
import zig from 'react-syntax-highlighter/dist/cjs/languages/prism/zig'

// Register languages
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('rs', rust)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('lua', lua)
SyntaxHighlighter.registerLanguage('clojure', clojure)
SyntaxHighlighter.registerLanguage('clj', clojure)
SyntaxHighlighter.registerLanguage('zig', zig)

interface MarkdownRendererProps {
  content: string
  className?: string
  sanitize?: boolean
}

// DOMPurify configuration
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'del',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
}

export const MarkdownRenderer = memo(
  ({ content, className = '', sanitize = true }: MarkdownRendererProps) => {
    const [copiedBlocks, setCopiedBlocks] = React.useState<Set<string>>(new Set())

    const sanitizedContent = sanitize ? DOMPurify.sanitize(content, DOMPURIFY_CONFIG) : content

    const handleCopy = useCallback(async (code: string, id: string) => {
      const success = await copyToClipboard(code)
      if (success) {
        setCopiedBlocks(prev => new Set([...prev, id]))
        setTimeout(() => {
          setCopiedBlocks(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, 2000)
      }
    }, [])

    const components: Components = React.useMemo(
      () => ({
        h1({ children }) {
          return <h1># {children}</h1>
        },
        h2({ children }) {
          return <h2>## {children}</h2>
        },
        h3({ children }) {
          return <h3>### {children}</h3>
        },
        h4({ children }) {
          return <h4>#### {children}</h4>
        },
        h5({ children }) {
          return <h5>##### {children}</h5>
        },
        h6({ children }) {
          return <h6>###### {children}</h6>
        },
        li({ children }) {
          // Remove any leading whitespace/newlines from list items
          // This fixes the issue where numbered lists have newlines between number and text
          if (Array.isArray(children)) {
            // Filter out pure whitespace text nodes at the beginning
            const filteredChildren = children.filter((child, index) => {
              if (index === 0 && typeof child === 'string' && child.trim() === '') {
                return false
              }
              return true
            })
            return <li>{filteredChildren}</li>
          }
          return <li>{children}</li>
        },
        p({ children, ...props }) {
          // Check if we're inside a list item
          const isInList = (props as any).node?.parent?.tagName === 'li'
          // Let CSS handle margins, only control display
          return <p style={{ display: isInList ? 'inline' : 'block' }}>{children}</p>
        },
        code(props) {
          const { className, children } = props as any
          // Check if it's an inline code or code block by looking at the presence of language class
          const match = /language-(\w+)/.exec(className || '')
          const codeString = String(children).replace(/\n$/, '')
          const codeId = `code-${Math.random().toString(36).substr(2, 9)}`

          return match ? (
            <div className="relative group not-prose">
              <div className="overflow-x-auto">
                <DataTransformErrorBoundary
                  dataContext="syntax highlighting"
                  expectedDataType="string"
                  extractFailureInfo={() => ({
                    operation: 'syntax highlighting',
                    dataType: `${match[1]} code`,
                    rawData:
                      codeString?.length > 500 ? codeString.substring(0, 500) + '...' : codeString,
                    failureLocation: `language: ${match[1]}`,
                  })}
                  fallback={({ transformFailure }) => (
                    <pre className="rsh-pre bg-muted p-3 rounded border text-sm font-mono">
                      <div className="text-destructive text-xs mb-2">
                        Syntax highlighting failed for {match[1]}
                      </div>
                      {transformFailure.rawData}
                    </pre>
                  )}
                >
                  <SyntaxHighlighter
                    language={match[1]}
                    useInlineStyles={false}
                    className="rsh-code-block text-sm"
                    PreTag={({ children, ...props }) => (
                      <pre className="rsh-pre" {...props}>
                        {children}
                      </pre>
                    )}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </DataTransformErrorBoundary>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 touch:opacity-100 md:touch:opacity-0 md:touch:group-hover:opacity-100"
                onClick={e => {
                  e.stopPropagation()
                  handleCopy(codeString, codeId)
                }}
                aria-label="Copy code"
                title="Copy code"
              >
                {copiedBlocks.has(codeId) ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          ) : (
            <code className="px-1 py-0.5 bg-accent/20 text-accent rounded-none text-sm font-mono">
              {children}
            </code>
          )
        },
        pre({ children }) {
          // Pre is handled by code block above
          return <>{children}</>
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:text-accent/80 transition-colors"
            >
              {children}
            </a>
          )
        },
      }),
      [handleCopy, copiedBlocks],
    )

    return (
      <DataTransformErrorBoundary
        dataContext="markdown content rendering"
        expectedDataType="string"
        extractFailureInfo={error => ({
          operation: 'markdown parsing',
          dataType: 'markdown',
          rawData: content?.length > 1000 ? content.substring(0, 1000) + '...' : content,
          failureLocation: error.message.includes('syntax') ? 'markdown syntax' : 'rendering engine',
        })}
        fallbackData=""
        validationConfig={{
          showRawData: true,
          maxRawDataDisplay: 1000,
        }}
        contextInfo={{
          contentLength: content?.length || 0,
          sanitized: sanitize,
          className,
        }}
        fallback={({ transformFailure, useFallbackData, retryWithRepair }) => (
          <div className="text-destructive border border-destructive/20 rounded p-3 space-y-2">
            <div className="font-semibold">Markdown rendering failed</div>
            <div className="text-sm">
              Failed to render markdown content. This could be due to invalid syntax or a rendering
              engine error.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={retryWithRepair}>
                Try Again
              </Button>
              <Button size="sm" variant="secondary" onClick={useFallbackData}>
                Show Raw Text
              </Button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer hover:text-foreground">Raw content preview</summary>
              <pre className="mt-2 p-2 bg-muted rounded border text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                {transformFailure.rawData}
              </pre>
            </details>
          </div>
        )}
      >
        <ReactMarkdown
          className={`prose-terminal ${className}`}
          remarkPlugins={[remarkGfm]}
          components={components}
        >
          {sanitizedContent}
        </ReactMarkdown>
      </DataTransformErrorBoundary>
    )
  },
)

MarkdownRenderer.displayName = 'MarkdownRenderer'
