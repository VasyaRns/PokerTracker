import type { Hand, Position } from './types'

const STEAL_POSITIONS = new Set<Position>(['CO', 'BTN', 'SB'])

const POSITION_ORDER: readonly Position[] = [
  'UTG',
  'UTG+1',
  'UTG+2',
  'MP',
  'LJ',
  'HJ',
  'CO',
  'BTN',
  'SB',
  'BB',
]

export function isStealPosition(position: Position): boolean {
  return STEAL_POSITIONS.has(position)
}

export interface StatLine {
  hits: number
  opportunities: number
  /** Знаменатель меньше 100. */
  unreliable: boolean
  /** «x из y». Ноль возможностей — «0 из 0». */
  ratioText: string
  percentText: string | null
}

export interface Stats {
  vpip: StatLine
  pfr: StatLine
  threeBet: StatLine
  ats: StatLine
  foldTo3bet: StatLine
}

export interface PositionStats {
  position: Position
  hands: number
  stats: Stats
  /** false → ATS на экране «—»: с этой позиции стил невозможен. */
  atsApplies: boolean
}

function formatPercent(hits: number, opportunities: number): string {
  const rounded = Math.round((hits / opportunities) * 1000) / 10
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
  return `${text}%`
}

function line(hits: number, opportunities: number): StatLine {
  return {
    hits,
    opportunities,
    unreliable: opportunities < 100,
    ratioText: `${hits} из ${opportunities}`,
    percentText: opportunities === 0 ? null : formatPercent(hits, opportunities),
  }
}

function isWalk(hand: Hand): boolean {
  return hand.action === 'walk'
}

function isOpen(hand: Hand): boolean {
  return (
    !isWalk(hand) &&
    !hand.skipped &&
    hand.action === 'raise' &&
    (hand.facing === 'foldedToMe' || hand.facing === 'limp')
  )
}

/** VPIP, PFR, 3-bet, ATS, fold to 3-bet. Пропущенный фолд входит только в знаменатель VPIP и PFR. */
export function computeStats(hands: readonly Hand[]): Stats {
  let vpipHits = 0
  let vpipOpps = 0
  let pfrHits = 0
  let pfrOpps = 0
  let threeHits = 0
  let threeOpps = 0
  let atsHits = 0
  let atsOpps = 0
  let foldHits = 0
  let foldOpps = 0

  for (const hand of hands) {
    if (!isWalk(hand)) {
      vpipOpps += 1
      pfrOpps += 1
      if (hand.action === 'call' || hand.action === 'raise') vpipHits += 1
      if (hand.action === 'raise') pfrHits += 1
    }

    if (!isWalk(hand) && hand.facing === 'raise') {
      threeOpps += 1
      if (hand.action === 'raise') threeHits += 1
    }

    if (!isWalk(hand) && hand.facing === 'foldedToMe' && isStealPosition(hand.position)) {
      atsOpps += 1
      if (hand.action === 'raise') atsHits += 1
    }

    if (isOpen(hand) && hand.vsRaise != null) {
      foldOpps += 1
      if (hand.vsRaise === 'fold') foldHits += 1
    }
  }

  return {
    vpip: line(vpipHits, vpipOpps),
    pfr: line(pfrHits, pfrOpps),
    threeBet: line(threeHits, threeOpps),
    ats: line(atsHits, atsOpps),
    foldTo3bet: line(foldHits, foldOpps),
  }
}

export function statsByPosition(hands: readonly Hand[]): PositionStats[] {
  return POSITION_ORDER.map((position) => {
    const group = hands.filter((hand) => hand.position === position)
    return {
      position,
      hands: group.length,
      stats: computeStats(group),
      atsApplies: isStealPosition(position),
    }
  }).filter((row) => row.hands > 0)
}

export function isPosition(value: string): value is Position {
  return (POSITION_ORDER as readonly string[]).includes(value)
}
