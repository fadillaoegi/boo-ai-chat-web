import { useState, type FormEvent } from 'react'
import { Icon } from './Icon'
import type { UiText } from './i18n'

const SECONDARY_BUTTON = 'rounded-xl border-2 border-black bg-white px-4 py-2.5 text-xs font-black uppercase shadow-boo-md transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-boo-xl active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-white dark:bg-neutral-900'

export function RenameSessionDialog({
  initialTitle,
  onCancel,
  onSave,
  ui,
}: {
  initialTitle: string
  onCancel: () => void
  onSave: (title: string) => void
  ui: UiText
}) {
  const [title, setTitle] = useState(initialTitle)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (title.trim()) onSave(title)
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-5">
      <button aria-label={ui.closeRenameDialog} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCancel} type="button" />
      <section aria-describedby="rename-session-description" aria-labelledby="rename-session-title" aria-modal="true" className="relative z-10 w-full max-w-sm rotate-[0.5deg] rounded-2xl border-[3px] border-black bg-white p-5 shadow-boo-2xl dark:border-white dark:bg-[#171717]" role="dialog">
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex items-start gap-4">
            <div className="grid size-12 shrink-0 rotate-[5deg] place-items-center rounded-xl border-2 border-black bg-sky-300 text-sky-950 shadow-boo-md dark:border-white"><Icon name="pencil" className="size-5" /></div>
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">{ui.editHistory}</p>
              <h2 className="text-xl font-black leading-tight tracking-[-0.03em]" id="rename-session-title">{ui.renameConversation}</h2>
            </div>
          </div>
          <p className="mb-4 text-sm font-semibold leading-6 text-neutral-600 dark:text-neutral-300" id="rename-session-description">{ui.renameDescription}</p>
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em]">{ui.conversationTitle}</span>
            <input autoFocus className="w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-black outline-none shadow-boo-md transition focus:-translate-x-0.5 focus:-translate-y-0.5 focus:shadow-boo-xl dark:border-white dark:bg-neutral-900" maxLength={80} onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className={SECONDARY_BUTTON} onClick={onCancel} type="button">{ui.cancel}</button>
            <button className="rounded-xl border-2 border-black bg-sky-300 px-4 py-2.5 text-xs font-black uppercase text-sky-950 shadow-boo-md transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-sky-400 hover:shadow-boo-xl active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-white" disabled={!title.trim()} type="submit">{ui.save}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function DeleteSessionDialog({
  deleteDisabled,
  onCancel,
  onConfirm,
  title,
  ui,
}: {
  deleteDisabled: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  ui: UiText
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-5">
      <button aria-label={ui.closeDeleteDialog} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onCancel} type="button" />
      <section aria-describedby="delete-session-description" aria-labelledby="delete-session-title" aria-modal="true" className="relative z-10 w-full max-w-sm rotate-[-0.5deg] rounded-2xl border-[3px] border-black bg-white p-5 shadow-boo-2xl dark:border-white dark:bg-[#171717]" role="alertdialog">
        <div className="mb-4 flex items-start gap-4">
          <div className="grid size-12 shrink-0 rotate-[-5deg] place-items-center rounded-xl border-2 border-black bg-red-500 text-white shadow-boo-md dark:border-white"><Icon name="trash" className="size-5" /></div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{ui.deleteHistory}</p>
            <h2 className="text-xl font-black leading-tight tracking-[-0.03em]" id="delete-session-title">{ui.confirmDelete}</h2>
          </div>
        </div>
        <p className="text-sm font-semibold leading-6 text-neutral-600 dark:text-neutral-300" id="delete-session-description">{ui.deleteBefore} <strong className="break-words text-black dark:text-white">“{title}”</strong> {ui.deleteAfter}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button autoFocus className={SECONDARY_BUTTON} onClick={onCancel} type="button">{ui.cancel}</button>
          <button className="rounded-xl border-2 border-black bg-red-500 px-4 py-2.5 text-xs font-black uppercase text-white shadow-boo-md transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-boo-xl active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 dark:border-white" disabled={deleteDisabled} onClick={onConfirm} type="button">{ui.delete}</button>
        </div>
      </section>
    </div>
  )
}
