import { describeAssetError } from '../assets/assetErrors'

export const MATCH_ERROR = {
  IN_PROGRESS: 'MATCHING_IN_PROGRESS',
  FAILED: 'MATCHING_FAILED',
}

/** Copy for matching failures; shared codes fall back to the asset / organization copy. */
export function describeMatchError(error, action = 'load matches') {
  switch (error?.code) {
    case MATCH_ERROR.IN_PROGRESS:
      return { title: 'Already running', body: 'Someone started a recalculation a moment ago. It will finish shortly.' }
    case MATCH_ERROR.FAILED:
      return { title: 'Matching did not finish', body: 'The run stopped before it completed. Try again; nothing was left half-applied.' }
    case 'NOT_FOUND':
      return { title: 'Match not found', body: 'It may have been recalculated away, or the component no longer exists.' }
    default:
      return describeAssetError(error, action)
  }
}
