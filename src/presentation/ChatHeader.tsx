import type { ChatModel } from '../domain/chat'
import { Icon } from './Icon'
import type { AppLanguage, UiText } from './i18n'
import type { Theme } from './usePreferences'

interface ChatHeaderProps {
  language: AppLanguage
  models: ChatModel[]
  onLanguageChange: (language: AppLanguage) => void
  onModelChange: (modelId: string) => void
  onOpenSidebar: () => void
  onShowSidebar: () => void
  onToggleTheme: () => void
  onToggleVoiceReplies: () => void
  selectedModel: string
  showOpenSidebar: boolean
  showShowSidebar: boolean
  speechSupported: boolean
  theme: Theme
  ui: UiText
  voiceReplies: boolean
}

export function ChatHeader({
  language,
  models,
  onLanguageChange,
  onModelChange,
  onOpenSidebar,
  onShowSidebar,
  onToggleTheme,
  onToggleVoiceReplies,
  selectedModel,
  showOpenSidebar,
  showShowSidebar,
  speechSupported,
  theme,
  ui,
  voiceReplies,
}: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b-2 border-black/10 bg-[#f3f3f1]/90 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0d]/90 sm:px-7">
      <div className="flex items-center gap-3">
        {showOpenSidebar && <button aria-label={ui.openMenu} className="rounded-xl border-2 border-black bg-white p-2 shadow-boo-sm dark:border-white/30 dark:bg-neutral-900 lg:hidden" onClick={onOpenSidebar} type="button"><Icon name="menu" /></button>}
        {showShowSidebar && <button aria-label={ui.showSidebar} className="hidden rounded-xl border-2 border-black bg-white p-2 shadow-boo-sm dark:border-white/30 dark:bg-neutral-900 lg:grid" onClick={onShowSidebar} type="button"><Icon name="menu" /></button>}
        <label className="relative inline-block"><span className="sr-only">{ui.selectModel}</span><select className="max-w-[135px] cursor-pointer appearance-none rounded-xl border-2 border-black bg-white py-2.5 pl-3 pr-9 text-xs font-black outline-none shadow-boo-md transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-boo-xl focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-boo-xl active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900 sm:max-w-[300px] sm:text-sm" onChange={(event) => onModelChange(event.target.value)} value={selectedModel}><option disabled value="">{models.length ? ui.chooseModel : ui.modelsUnavailable}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider}</option>)}</select><Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" /></label>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="relative inline-block"><span className="sr-only">{ui.language}</span><select aria-label={ui.language} className="w-[52px] cursor-pointer appearance-none rounded-xl border-2 border-black bg-white py-2.5 pl-2 pr-5 text-[10px] font-black outline-none shadow-boo-sm dark:border-white/30 dark:bg-neutral-900" onChange={(event) => onLanguageChange(event.target.value as AppLanguage)} value={language}><option value="en">EN</option><option value="id">ID</option></select><Icon name="chevron-down" className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2" /></label>
        <button aria-label={ui.voiceReplies} aria-pressed={voiceReplies} className={`rounded-xl border-2 p-2.5 disabled:cursor-not-allowed disabled:opacity-30 ${voiceReplies ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black' : 'border-black/20 bg-white dark:border-white/20 dark:bg-neutral-900'}`} disabled={!speechSupported} onClick={onToggleVoiceReplies} title={ui.voiceReplies} type="button"><Icon name="volume" className="size-4" /></button>
        <button aria-label={ui.switchTheme} className="rounded-xl border-2 border-black/20 bg-white p-2.5 dark:border-white/20 dark:bg-neutral-900" onClick={onToggleTheme} title={ui.switchTheme} type="button"><Icon name={theme === 'light' ? 'moon' : 'sun'} className="size-4" /></button>
        <div aria-hidden="true" className="ml-1 hidden size-9 place-items-center rounded-full border-2 border-black bg-white text-[10px] font-black dark:border-white/40 dark:bg-neutral-900 sm:grid">{ui.you}</div>
      </div>
    </header>
  )
}
