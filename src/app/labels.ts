import type { Action, Facing, Format, VsRaise } from '../domain/types'

export const actionLabel: Record<Action, string> = {
  fold: 'Фолд',
  check: 'Чек',
  call: 'Колл',
  raise: 'Рейз',
  walk: 'Уок',
}

export const facingLabel: Record<Facing, string> = {
  foldedToMe: 'Фолд до меня',
  limp: 'Лимп',
  raise: 'Рейз',
  threeBetPlus: '3-бет+',
}

export const formatLabel: Record<Format, string> = {
  cash: 'Кэш',
  tournament: 'Турнир',
}

export const vsRaiseLabel: Record<VsRaise, string> = {
  fold: 'Фолд',
  call: 'Колл',
  raise: 'Рейз',
}

export const statLabels = [
  ['vpip', 'VPIP'],
  ['pfr', 'PFR'],
  ['threeBet', '3-bet'],
  ['ats', 'ATS'],
  ['foldTo3bet', 'Фолд на 3-бет'],
] as const
