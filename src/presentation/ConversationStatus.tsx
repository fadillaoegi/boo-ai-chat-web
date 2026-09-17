import booLogo from '../assets/logoBooAgent.png'
import { Icon } from './Icon'
import type { UiText } from './i18n'

export function RetryNotice({ message, onRetry, ui }: { message: string; onRetry: () => void; ui: UiText }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div aria-hidden="true" className="size-9 shrink-0" />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-black/30 bg-white px-4 py-3 text-sm font-semibold dark:border-white/30 dark:bg-[#171717]" role="alert">
        <span>{message}</span>
        <button className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-black px-3 py-1.5 text-[10px] font-black uppercase text-white shadow-boo-inverse-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-white dark:text-black" onClick={onRetry} type="button"><Icon name="refresh" className="size-3" /> {ui.retry}</button>
      </div>
    </div>
  )
}

export function ThinkingIndicator({ ui }: { ui: UiText }) {
  return (
    <div aria-live="polite" className="flex items-center gap-4" role="status">
      <img alt="" className="size-9 rounded-xl border-2 border-black bg-white object-contain dark:border-white/40" src={booLogo} />
      <div className="flex gap-1.5 rounded-2xl border-2 border-black/20 bg-white px-5 py-4 dark:border-white/20 dark:bg-[#171717]">
        <span className="sr-only">{ui.thinking}</span>
        <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
      </div>
    </div>
  )
}
