import booLogo from '../assets/logoBooAgent.png'
import type { UiText } from './i18n'

export function EmptyState({ imageMode, ui }: { imageMode: boolean; ui: UiText }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-10 sm:py-16">
      <div className="mb-8 max-w-3xl">
        <div className="mb-5 inline-flex rotate-[-2deg] items-center gap-2 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-boo-md dark:border-white/40 dark:bg-neutral-900"><span className="size-2 animate-pulse rounded-full bg-black dark:bg-white" /> {imageMode ? ui.imageStudioReady : ui.aiReady}</div>
        <div className="flex items-center gap-4 sm:gap-6">
          <img alt="" className="size-16 shrink-0 object-contain sm:size-20" src={booLogo} />
          <h1 className="text-5xl font-black leading-[0.93] tracking-[-0.065em] sm:text-7xl lg:text-8xl">{imageMode ? ui.imagine : ui.helloBoo}<br /><span className="text-neutral-400 dark:text-neutral-600">{imageMode ? ui.makeItReal : ui.whatToCreate}</span></h1>
        </div>
      </div>
    </div>
  )
}
