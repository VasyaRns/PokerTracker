export type Position =
  | 'UTG'
  | 'UTG+1'
  | 'UTG+2'
  | 'MP'
  | 'LJ'
  | 'HJ'
  | 'CO'
  | 'BTN'
  | 'SB'
  | 'BB'

export type Facing = 'foldedToMe' | 'limp' | 'raise' | 'threeBetPlus'

export type Action = 'fold' | 'check' | 'call' | 'raise' | 'walk'

/** raise в ответ = 3-бет после лимпа или 4-бет после открытия */
export type VsRaise = 'fold' | 'call' | 'raise'

export type Format = 'cash' | 'tournament'

export interface Hand {
  id: string
  /** Порядок ввода и undo, не день игры. */
  createdAt: number
  updatedAt: number
  /** Всегда id существующей сессии. */
  sessionId: string
  /** Один тап = один batchId, undo снимает весь batch. */
  batchId: string
  position: Position
  /** null только у пропущенного фолда. */
  facing: Facing | null
  action: Action
  /** Пачка «+N фолдов». */
  skipped?: boolean
  resultBB?: number
  note?: string
  /** Ответ, если после лимпа или открытия прилетел рейз. */
  vsRaise?: VsRaise
}

export interface Session {
  id: string
  startedAt: number
  updatedAt: number
  /** YYYY-MM-DD, день игры, его выбрал пользователь. */
  date: string
  place: string
  format: Format
  /** Целое 2..10, в форме по умолчанию 9. */
  tableSize: number
  note?: string
  /** Нет поля = сессия открыта. */
  endedAt?: number
  /** Турнир. */
  buyIn?: number
  /** Турнир. */
  prize?: number
}

export interface Meta {
  id: 'app'
  lastExportAt?: number
  /** Сколько завершённых сессий уже «закрыто» напоминанием или экспортом. */
  reminderAnchor: number
}
