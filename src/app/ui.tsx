import type { ButtonHTMLAttributes, ReactNode } from 'react'

const tones = {
  neutral: 'bg-[#1c2e26] text-[#f3f6f4]',
  gold: 'bg-[#e4c36a] text-[#1a1408]',
  blue: 'bg-[#24507a] text-[#f3f8ff]',
  green: 'bg-[#1f6b45] text-[#f3fff8]',
  ghost: 'bg-transparent text-[#d5e4db] ring-1 ring-[#345445]',
  danger: 'bg-[#6a3030] text-[#ffe8e4]',
} as const

export type Tone = keyof typeof tones

export function Button({
  tone = 'neutral',
  selected = false,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; selected?: boolean }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl px-3 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 ${tones[tone]} ${selected ? 'ring-2 ring-[#e4c36a]' : ''} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[#9bb0a6]">
      <span>{label}</span>
      {children}
    </label>
  )
}

export const controlClass =
  'min-h-12 w-full rounded-2xl bg-[#102019] px-3 text-base text-[#f3f6f4] ring-1 ring-[#345445]'
