import type { SystemLogEntry } from '../application/useChat'
import booLogo from '../assets/logoBooAgent.png'
import type { ChatSession } from '../domain/chat'
import { Icon } from './Icon'
import type { AppLanguage, UiText } from './i18n'

function formatSessionDate(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short' }).format(timestamp)
}

function formatLogTime(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp)
}

interface SidebarProps {
  activeSessionId: string | null
  deleteLockedSessionId: string | null
  hidden: boolean
  historyReady: boolean
  language: AppLanguage
  logs: SystemLogEntry[]
  onClose: () => void
  onDeleteSession: (session: ChatSession) => void
  onHide: () => void
  onNewChat: () => void
  onOpenSession: (sessionId: string) => void
  onRenameSession: (session: ChatSession) => void
  open: boolean
  sessions: ChatSession[]
  ui: UiText
}

export function Sidebar({
  activeSessionId,
  deleteLockedSessionId,
  hidden,
  historyReady,
  language,
  logs,
  onClose,
  onDeleteSession,
  onHide,
  onNewChat,
  onOpenSession,
  onRenameSession,
  open,
  sessions,
  ui,
}: SidebarProps) {
  return (
    <>
      {open && <button aria-label={ui.closeSidebar} className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} type="button" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r-2 border-black bg-white p-5 transition-transform duration-300 dark:border-white/20 dark:bg-[#141414] ${hidden ? 'lg:-translate-x-full' : 'lg:translate-x-0'} ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-8 flex items-center justify-between">
          <button aria-label={ui.reloadBoo} className="flex items-center gap-3 rounded-xl text-left outline-none transition hover:opacity-75 focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white" onClick={() => window.location.reload()} title={ui.reloadBoo} type="button"><img alt="" className="size-11 shrink-0 rotate-[-3deg] rounded-xl border-2 border-black bg-white object-contain shadow-boo-inverse-md dark:border-white/40" src={booLogo} /><span><span className="block text-lg font-black tracking-[-0.04em]">BOO AI</span><span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-500">Think bigger</span></span></button>
          <div className="flex items-center">
            <button aria-label={ui.closeMenu} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:hidden" onClick={onClose} type="button"><Icon name="menu" /></button>
            <button aria-label={ui.hideSidebar} className="hidden rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 lg:block" onClick={onHide} type="button"><Icon name="menu" /></button>
          </div>
        </div>

        <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-black px-4 py-3 text-sm font-black text-white shadow-boo-inverse-lg active:translate-x-1 active:translate-y-1 active:shadow-none dark:border-white dark:bg-white dark:text-black" onClick={onNewChat} type="button"><Icon name="plus" className="size-4" /> {ui.newChat}</button>

        <nav aria-label={ui.localHistory} className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{ui.localHistory}</p>
          <div className="space-y-2">
            {historyReady && !sessions.length && <p className="px-2 py-3 text-xs font-semibold text-neutral-500">{ui.noSavedChats}</p>}
            {sessions.map((session) => (
              <div className={`group flex items-center rounded-xl border-2 transition ${activeSessionId === session.id ? 'border-black bg-neutral-100 dark:border-white/50 dark:bg-neutral-800' : 'border-transparent hover:border-black/40 hover:bg-neutral-50 dark:hover:border-white/30 dark:hover:bg-neutral-900'}`} data-session-id={session.id} key={session.id}>
                <button aria-current={activeSessionId === session.id ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left" onClick={() => onOpenSession(session.id)} type="button">
                  <Icon name={session.mode === 'image' ? 'image' : 'chat'} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{session.title}</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-500">{session.mode === 'image' ? `${ui.imageSession} · ` : ''}{formatSessionDate(session.updatedAt, language)}</span></span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button aria-label={`${ui.renameTitleAction}: ${session.title}`} className="grid size-7 place-items-center rounded-md text-neutral-500 transition hover:bg-sky-300 hover:text-sky-950 focus-visible:bg-sky-300 focus-visible:text-sky-950" onClick={() => onRenameSession(session)} title={ui.renameTitleAction} type="button"><Icon name="pencil" className="size-3.5" /></button>
                  <button aria-label={`${ui.deleteTitleAction}: ${session.title}`} className="grid size-7 place-items-center rounded-md text-neutral-500 transition hover:bg-red-500 hover:text-white focus-visible:bg-red-500 focus-visible:text-white disabled:cursor-not-allowed disabled:opacity-30" disabled={deleteLockedSessionId === session.id} onClick={() => onDeleteSession(session)} title={ui.deleteTitleAction} type="button"><Icon name="trash" className="size-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-4">
          <details className="rounded-xl border-2 border-black/20 bg-white p-3 dark:border-white/20 dark:bg-neutral-900">
            <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.16em]">{ui.systemLog} ({logs.length})</summary>
            <div className="mt-3 max-h-32 space-y-2 overflow-y-auto border-t border-black/10 pt-3 dark:border-white/10">
              {!logs.length && <p className="text-[10px] text-neutral-500">{ui.noLogs}</p>}
              {[...logs].reverse().slice(0, 6).map((log) => <div className="text-[10px] leading-relaxed" key={log.id}><span className="mr-2 font-mono text-neutral-500">{formatLogTime(log.timestamp, language)}</span><span className={log.level === 'error' ? 'font-black' : 'font-semibold'}>{log.message}</span></div>)}
            </div>
          </details>
        </div>
      </aside>
    </>
  )
}
