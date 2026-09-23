import { Link } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { buttonBase, buttonSizes, buttonVariants } from '@/design-system/components/buttonStyles'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Panel, SkeletonRows } from '@/features/organization/components/PagePrimitives'
import { useApiResource } from '@/features/organization/hooks/useApiResource'
import { cn } from '@/lib/cn'
import { listMatches } from '@/services/matches/matchApi'
import { describeMatchError } from '@/services/matches/matchErrors'
import { MATCH_LIMITS } from '../matchCatalog'
import { MatchResults } from './MatchResults'

/**
 * The matches for one asset (on the asset page) or one advisory (on the
 * advisory page). A window onto the Matches list, not a second implementation:
 * the same rows, the same API, filtered to one thing, with a link to the rest.
 */
export function MatchesPanel({ assetId, vulnerabilityId, title, empty, includeArchived = false }) {
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  // Exactly one filter, always: without it the list would quietly show every match in the
  // organization, which is not what either host page is asking for.
  const filter = assetId ? { assetId } : vulnerabilityId ? { vulnerabilityId } : null
  const scope = assetId ? `asset:${assetId}` : `vulnerability:${vulnerabilityId}`

  const results = useApiResource(
    () => (filter ? listMatches({ ...filter, ...(includeArchived ? { archived: 'true' } : {}), pageSize: MATCH_LIMITS.assetPageSize }) : Promise.resolve({ matches: [], total: 0 })),
    `${organizationId}:matches:${scope}:${includeArchived}`,
  )
  const data = results.data
  const query = new URLSearchParams(filter ? Object.entries(filter) : [])
  if (includeArchived) query.set('archived', 'true')

  return (
    <Panel
      headingId="matches-heading"
      eyebrow="Exposure"
      title={title}
      description={data ? `${data.total} potential ${data.total === 1 ? 'match' : 'matches'}` : 'Loading matches'}
      actions={
        data && data.total > data.matches.length ? (
          <Link to={`/organization/matches?${query}`} className={cn(buttonBase, buttonVariants.secondary, buttonSizes.md)}>
            View all {data.total}
          </Link>
        ) : null
      }
    >
      {results.status === 'error' && !data && (
        <div className="p-5 sm:p-6">
          <Alert
            tone="danger"
            title={describeMatchError(results.error).title}
            action={
              <Button variant="secondary" size="md" onClick={() => results.reload()}>
                Try again
              </Button>
            }
          >
            {describeMatchError(results.error).body}
          </Alert>
        </div>
      )}

      {!data && results.status === 'loading' && <SkeletonRows rows={2} label="Loading matches" />}

      {data && data.total === 0 && (
        <div className="px-5 py-6 sm:px-6">
          <p className="text-body text-fg-muted">{empty}</p>
          <p className="mt-2 text-caption text-fg-subtle">
            Matching runs on demand from the{' '}
            <Link to="/organization/matches" className="underline underline-offset-4 hover:text-fg">
              Matches page
            </Link>
            .
          </p>
        </div>
      )}

      {data && data.matches.length > 0 && (
        <MatchResults matches={data.matches} showAsset={Boolean(vulnerabilityId)} busy={results.status === 'loading'} caption={title} />
      )}
    </Panel>
  )
}
