import 'katex/dist/katex.min.css'
import { isValidElement, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Options } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { copyPlainText } from './clipboard'
import { Icon } from './Icon'
import { normalizeMathDelimiters } from './markdownMath'

const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkGfm, remarkMath]
const REHYPE_PLUGINS: Options['rehypePlugins'] = [
  // KaTeX lebih dulu agar blok ```math``` hasil remark-math tidak diperlakukan sebagai kode.
  [rehypeKatex, { throwOnError: false, strict: false }],
  // Tanpa deteksi otomatis: hanya blok berlabel bahasa yang diwarnai, jauh lebih ringan saat streaming.
  [rehypeHighlight, { detect: false }],
]

interface MarkdownMessageProps {
  content: string
  copiedCodeLabel: string
  copyCodeLabel: string
  openLinkLabel: string
  streaming?: boolean
}

function nodeToText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children)
  return ''
}

function CodeBlock({
  children,
  copiedCodeLabel,
  copyCodeLabel,
}: {
  children: ReactNode
  copiedCodeLabel: string
  copyCodeLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)
  const code = nodeToText(children).replace(/\n$/, '')
  const childClassName = isValidElement<{ className?: string }>(children) ? children.props.className : undefined
  const language = /language-([\w-]+)/.exec(childClassName ?? '')?.[1]

  useEffect(() => () => {
    if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current)
  }, [])

  async function handleCopy() {
    try {
      await copyPlainText(code)
      setCopied(true)
      if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current)
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimeoutRef.current = null
      }, 2000)
    } catch (error) {
      console.error('[boo-markdown] Failed to copy code.', error)
    }
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span>{language || 'code'}</span>
        <button aria-label={copied ? copiedCodeLabel : copyCodeLabel} className={copied ? 'is-copied' : ''} onClick={() => void handleCopy()} type="button">
          <Icon className="size-3.5" name={copied ? 'check' : 'copy'} />
          <span>{copied ? copiedCodeLabel : copyCodeLabel}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

function markdownUrlTransform(url: string, key: string, node: Readonly<{ tagName: string }>): string {
  const safeUrl = defaultUrlTransform(url)
  if (key !== 'src' || node.tagName !== 'img' || !safeUrl) return safeUrl
  try {
    const parsed = new URL(safeUrl, window.location.origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? safeUrl : ''
  } catch {
    return ''
  }
}

// memo: saat satu jawaban sedang di-stream, pesan-pesan lama tidak perlu diparsing ulang tiap frame.
export const MarkdownMessage = memo(function MarkdownMessage({ content, copiedCodeLabel, copyCodeLabel, openLinkLabel, streaming = false }: MarkdownMessageProps) {
  const markdown = useMemo(() => normalizeMathDelimiters(content), [content])
  return (
    <div aria-busy={streaming || undefined} className={`markdown-message${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown
        components={{
          a: ({ children, href, title }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href))
            return <a href={href} rel={external ? 'noopener noreferrer' : undefined} target={external ? '_blank' : undefined} title={title || (external ? `${openLinkLabel}: ${href}` : undefined)}>{children}</a>
          },
          img: ({ alt, src, title }) => <img alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" src={src} title={title} />,
          pre: ({ children }) => <CodeBlock copiedCodeLabel={copiedCodeLabel} copyCodeLabel={copyCodeLabel}>{children}</CodeBlock>,
          table: ({ children }) => <div className="markdown-table-wrap"><table>{children}</table></div>,
        }}
        rehypePlugins={REHYPE_PLUGINS}
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={markdownUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
})
