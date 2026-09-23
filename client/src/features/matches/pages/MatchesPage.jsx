import { AnimatePresence } from 'framer-motion'
import { RefreshCw, SearchX, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Pagination } from '@/features/assets/components/AssetResults'
import { PageHeader, Panel, Readouts, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { handleSessionLoss, useApiResource } from '@/features/organization/hooks/useApiResource'
import { useLatestSearchParams } from '@/features/organization/hooks/useLatestSearchParams'
import { can, useOrganization } from '@/features/organization/organizationContext'
import { timeAgo } from '@/features/vulnerabilities/vulnerabilityFormat'
import { getMatchSummary, listMatches, recalculateMatches } from '@/services/matches/matchApi'
import { describeMatchError } from '@/services/matches/matchErrors'
import { paced } from '@/services/organization/organizationApi'
import { MatchResults } from '../components/MatchResults'
import { MatchToolbar } from '../components/MatchToolbar'
import { labelOf, MATCH_LIMITS, MATCH_SORTS } from '../matchCatalog'
import { activeFilterCount, nextMatchParams, readMatchQuery } from '../matchQuery'

/**
 * Where the catalogue meets the inventory: advisories that may affect software
 * this organization records. Potential matches, not findings — there is no
 * status workflow, owner or risk score here.
 */
export function MatchesPage() {
  const { details } = useOrganization()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const [searchParams, setSearchParams] = useLatestSearchParams()
  const query = readMatchQuery(searchParams)
  const queryKey = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  const summary = useApiResource(getMatchSummary, `${organizationId}:match-summary`)
  const results = useApiResource(
    () => listMatches({ ...query, page: query.page || 1, pageSize: MATCH_LIMITS.pageSize }),
    `${organizationId}:matches:${queryKey}`,
  )
  const [lastResults, setLastResults] = useState(null)
  if (results.data && results.data !== lastResults) setLastResults(results.data)
  const shown = results.data ?? (results.status === 'loading' ? lastResults : null)

  const update = useCallback(
    (changes) => setSearchParams((latest) => nextMatchParams(readMatchQuery(latest), changes), { replace: !('page' in changes) }),
    [setSearchParams],
  )

  const counts = summary.data
  const canRecalculate = can(details, 'findings:create')
  const filtered = Boolean(query.q) || activeFilterCount(query) > 0
  const sortLabel = labelOf(MATCH_SORTS, query.sort || 'severity')

  const recalculate = async () => {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const run = await paced(recalculateMatches())
      const { created, removed, components } = run.counts
      setFlash({
        key: run.id,
        title: 'Matching finished',
        body: `${components} ${components === 1 ? 'component' : 'components'} checked · ${created} new ${created === 1 ? 'match' : 'matches'}${removed ? `, ${removed} no longer apply` : ''}.`,
      })
      results.reload({ quiet: true })
      summary.reload({ quiet: true })
    } catch (err) {
      handleSessionLoss(err)
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stagger>
      <PageHeader
        eyebrow={`${details?.organization.name ?? 'Organization'} · Exposure`}
        title="Matches"
        aside={
          canRecalculate && (
            <Button size="md" loading={busy} loadingLabel="Matching…" leadingIcon={<RefreshCw aria-hidden="true" size={15} />} onClick={recalculate}>
              Recalculate
            </Button>
          )
        }
      >
        Advisories from the catalogue that may affect the software your assets run, with the version comparison behind each one.
        These are potential matches to review, not confirmed findings.
      </PageHeader>

      <AnimatePresence initial={false}>
        {flash && (
          <Alert key={flash.key} tone="success" title={flash.title} className="mb-6">
            {flash.body}
          </Alert>
        )}
        {error && (
          <Alert key="error" tone="danger" title={describeMatchError(error, 'recalculate matches').title} className="mb-6">
            {describeMatchError(error, 'recalculate matches').body}
          </Alert>
        )}
      </AnimatePresence>

      <StaggerItem className="mb-6">
        <Readouts
          items={[
            { label: 'Affected', value: counts ? counts.byStatus.affected.toLocaleString() : '—' },
            { label: 'Assets affected', value: counts ? counts.affectedAssets.toLocaleString() : '—' },
            { label: 'Known exploited', value: counts ? counts.knownExploited.toLocaleString() : '—' },
            { label: 'Needs a version', value: counts ? counts.byStatus.unknown_version.toLocaleString() : '—' },
          ]}
        />
      </StaggerItem>

      {counts?.lastRun && (
        <StaggerItem className="mb-4">
          <p className="text-caption text-fg-subtle">
            {counts.lastRun.status === 'succeeded' ? 'Last matched' : `Last run ${counts.lastRun.status}`}{' '}
            <time dateTime={counts.lastRun.finishedAt ?? undefined}>{timeAgo(counts.lastRun.finishedAt ?? counts.lastRun.startedAt)}</time> ·{' '}
            {counts.components.toLocaleString()} {counts.components === 1 ? 'component' : 'components'} in the live inventory
            {counts.lastRun.trigger === 'cli' ? ' · run by an operator' : ''}
          </p>
        </StaggerItem>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {counts && counts.total > 0 && (
          <StaggerItem>
            <MatchToolbar query={query} onChange={update} />
          </StaggerItem>
        )}

        <StaggerItem>
          <Panel
            headingId="matches-heading"
            eyebrow="Exposure"
            title="Potential matches"
            description={shown ? `${shown.total.toLocaleString()} ${shown.total === 1 ? 'result' : 'results'} · sorted by ${sortLabel.toLowerCase()}` : 'Loading matches'}
            actions={
              filtered && (
                <Button variant="ghost" size="md" onClick={() => setSearchParams(new URLSearchParams())}>
                  Clear filters
                </Button>
              )
            }
          >
            {results.status === 'error' && !shown && (
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

            {!shown && results.status === 'loading' && <SkeletonRows rows={6} label="Loading matches" />}

            {shown && shown.total === 0 && (counts?.total === 0 && !filtered ? <NoMatchesYet canRecalculate={canRecalculate} lastRun={counts?.lastRun} /> : <NoResults onClear={() => setSearchParams(new URLSearchParams())} />)}

            {shown && shown.matches.length > 0 && (
              <>
                <MatchResults matches={shown.matches} busy={results.status === 'loading'} caption={`Potential matches, sorted by ${sortLabel.toLowerCase()}, page ${shown.page} of ${shown.totalPages}`} />
                <Pagination
                  page={shown.page}
                  totalPages={shown.totalPages}
                  total={shown.total}
                  pageSize={shown.pageSize}
                  busy={results.status === 'loading'}
                  noun={['match', 'matches']}
                  onPage={(page) => {
                    update({ page: page > 1 ? String(page) : '' })
                    document.getElementById('matches-heading')?.focus()
                  }}
                />
              </>
            )}
          </Panel>
        </StaggerItem>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {results.status === 'loading' ? 'Loading matches' : shown ? `${shown.total} matches found` : ''}
      </p>
    </Stagger>
  )
}

function NoResults({ onClear }) {
  return (
    <div className="flex flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-6">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-raised text-fg-subtle ring-1 ring-inset ring-line">
        <SearchX size={20} strokeWidth={1.75} />
      </span>
      <div className="flex-1">
        <p className="text-label text-fg">No matches with these filters</p>
        <p className="mt-1 text-body text-fg-muted">Try a broader search, or clear the filters.</p>
      </div>
      <Button variant="secondary" size="md" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}

function NoMatchesYet({ canRecalculate, lastRun }) {
  return (
    <div className="px-5 py-12 sm:px-10">
      <div className="max-w-lg">
        <p className="eyebrow mb-3 flex items-center gap-2.5 text-ion">
          <Sparkles aria-hidden="true" size={14} />
          {lastRun ? 'Nothing matched' : 'Not matched yet'}
        </p>
        <h3 className="text-title-2 text-fg">{lastRun ? 'No advisory matches your software' : 'Match your software against the catalogue'}</h3>
        <p className="mt-2 text-body text-fg-muted">
          {lastRun
            ? 'Every recorded component was checked against the advisories in the catalogue, and none of them applied. Matching again after a catalogue sync, or after adding software, may change that.'
            : 'Matching compares each component’s version against the affected ranges published for that package. It runs on demand, so results are always explainable.'}
        </p>
        <p className="mt-4 flex flex-wrap gap-4 text-caption text-fg-subtle">
          <Link to="/organization/software" className="underline underline-offset-4 hover:text-fg">
            Review the software inventory
          </Link>
          <Link to="/organization/vulnerabilities" className="underline underline-offset-4 hover:text-fg">
            Browse the advisory catalogue
          </Link>
        </p>
        {!canRecalculate && <p className="mt-4 text-caption text-fg-subtle">Security analysts, admins and owners can run matching.</p>}
      </div>
    </div>
  )
}
