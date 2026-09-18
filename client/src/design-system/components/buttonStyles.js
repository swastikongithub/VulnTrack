/**
 * Button class recipes, shared by <Button> and link-styled buttons (marketing CTAs),
 * so a link that looks like a button is styled from the same source.
 */

export const buttonBase =
  'group/button relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ion ' +
  'disabled:opacity-45 aria-disabled:cursor-not-allowed'

export const buttonVariants = {
  primary:
    'sheen bg-ion text-on-ion shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_0_0_1px_rgb(124_220_255/0.4),0_8px_28px_-10px_rgb(124_220_255/0.55)] ' +
    'hover:bg-ion-hover active:bg-ion-press data-[state=success]:bg-success data-[state=success]:shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_0_0_1px_rgb(74_227_165/0.45),0_8px_28px_-10px_rgb(74_227_165/0.55)]',
  secondary:
    'bg-surface-raised text-fg shadow-e1 ring-1 ring-inset ring-line hover:bg-surface-hover hover:ring-line-strong',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  /** Destructive confirmations only (inside a Dialog), never as a screen's main action. */
  danger:
    'bg-danger text-ink-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_0_0_1px_rgb(255_115_133/0.45)] hover:bg-danger/90 active:bg-danger/80',
}

export const buttonSizes = {
  md: 'h-11 rounded-md px-4 text-label',
  lg: 'h-12 rounded-md px-5 text-body-lg',
}
