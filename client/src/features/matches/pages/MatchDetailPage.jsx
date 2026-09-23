import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Alert, Button } from '@/design-system/components'
import { useSessionStore } from '@/features/auth/sessionStore'
import { ArchivedChip } from '@/features/assets/components/AssetSignals'
import { PageHeader, Panel, SkeletonRows, Stagger, StaggerItem } from '@/features/organization/components/PagePrimitives'
import { useApiResource } from '@/features/organization/hooks/useApiResource'
import { EcosystemBadge } from '@/features/software/components/SoftwareSignals'
import { SeverityBadge, SourceTag } from '@/features/vulnerabilities/components/VulnerabilitySignals'
import { formatDate, rangeIntervals } from '@/features/vulnerabilities/vulnerabilityFormat'
import { getMatch } from '@/services/matches/matchApi'
import { describeMatchError } from '@/services/matches/matchErrors'
import { ConfidenceChip, FixedIn, MatchStatusChip } from '../components/MatchSignals'

/**
 * One match, and why the engine reached it: the installed version, the ranges
 * the source published, and the rule that decided. Everything here is
 * recomputed from scratch on every run, so it can be argued with.
 */
export function MatchDetailPage() {
  const { matchId } = useParams()
  const organizationId = useSessionStore((s) => s.session?.organization?.id)
  const resource = useApiResource(() => getMatch(matchId), `${organizationId}:match:${matchId}`)

  if (resource.status === 'loading' && !resource.data) {
    return (
      <>
        <BackToMatches />
        <div className="rounded-xl bg-surface/95 ring-1 ring-line">
          <SkeletonRows rows={3} label="Loading match" />
        </div>
      </>
    )
  }

  if (!resource.data) {
    const copy = describeMatchError(resource.error, 'load this match')
    const notFound = resource.error?.code === 'NOT_FOUND'
    return (
      <>
        <BackToMatches />
        <div className="max-w-xl">
          <Alert
            tone={notFound ? 'warning' : 'danger'}
            title={copy.title}
            action={
              !notFound && (
                <Button variant="secondary" size="md" onClick={() => resource.reload()}>
                  Try again
                </Button>
              )
            }
          >
            {copy.body}
          </Alert>
        </div>
      </>
    )
  }

  return <MatchDetail match={resource.data} />
}

function BackToMatches() {
  return (
    <Link
      to="/organization/matches"
      className="group mb-4 inline-flex h-11 items-center gap-2 rounded-sm pr-2 text-label text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
    >
      <span className="grid size-7 place-items-center rounded-full ring-1 ring-inset ring-line transition-transform duration-[var(--duration-base)] group-hover:-translate-x-0.5">
        <ArrowLeft aria-hidden="true" size={14} />
      </span>
      Matches
    </Link>
  )
}

function Fact({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5 sm:px-6">
      <dt className="eyebrow shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-right text-caption text-fg">{children}</dd>
    </div>
  )
}

function MatchDetail({ match }) {
  const { component, vulnerability, asset, advisory } = match
  return (
    <Stagger>
      <BackToMatches />
      <PageHeader eyebrow="Potential match" title={<span className="break-all font-mono">{vulnerability.sourceId}</span>}>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={vulnerability.severity} label={vulnerability.severityLabel} score={vulnerability.cvssScore} size="lg" />
          <MatchStatusChip status={match.status} label={match.statusLabel} />
          <ConfidenceChip confidence={match.confidence} label={match.confidenceLabel} />
        </span>
        <span className="mt-4 block max-w-3xl text-body text-fg">{vulnerability.summary}</span>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <StaggerItem>
            <Panel headingId="decision-heading" eyebrow="Decision" title="Why this matched" description="Recomputed from scratch on every run, from the installed version and the published ranges.">
              <div className="space-y-4 px-5 py-5 sm:px-6">
                <p className="text-body text-fg">{match.explanation}</p>
                <dl className="grid gap-x-6 gap-y-2 text-caption sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <dt className="text-fg-subtle">Installed version</dt>
                  <dd className="font-mono text-fg">{component.version ?? 'not recorded'}</dd>
                  <dt className="text-fg-subtle">Matched on</dt>
                  <dd className="text-fg">
                    {match.routeLabel}
                    {match.route === 'package' ? (
                      <span className="text-fg-subtle"> · {component.packageKey}</span>
                    ) : (
                      <span className="text-fg-subtle"> · CPE vendor and product</span>
                    )}
                  </dd>
                  <dt className="text-fg-subtle">Rule</dt>
                  <dd className="font-mono text-fg-muted">{match.reason.rule}</dd>
                  {match.reason.scheme && (
                    <>
                      <dt className="text-fg-subtle">Version scheme</dt>
                      <dd className="text-fg-muted">{match.reason.scheme}</dd>
                    </>
                  )}
                </dl>
                <FixedIn versions={match.fixedVersions} className="block" />
                {match.status === 'unknown_version' && (
                  <Alert tone="warning" title="Record the version to decide this">
                    Without a version, this advisory can’t be applied to the component either way.{' '}
                    <Link to={`/organization/assets/${asset.id}`} className="underline underline-offset-4">
                      Open the asset
                    </Link>{' '}
                    to add it.
                  </Alert>
                )}
              </div>
            </Panel>
          </StaggerItem>

          {advisory?.affected?.length > 0 && (
            <StaggerItem>
              <Panel headingId="ranges-heading" eyebrow="Source data" title="What the advisory published" description="The affected entries for this package, exactly as published.">
                <ul className="divide-y divide-line-subtle">
                  {advisory.affected.map((entry, i) => (
                    <li key={`${entry.name}:${i}`} className="px-5 py-4 sm:px-6">
                      <p className="font-mono text-label text-fg">{entry.name}</p>
                      {entry.ranges.map((range, r) => (
                        <p key={r} className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-caption">
                          <span className="eyebrow text-fg-subtle">{range.type === 'GIT' ? 'Commits' : range.type === 'SEMVER' ? 'SemVer' : 'Versions'}</span>
                          <span className="break-all font-mono text-fg-muted">{rangeIntervals(range).join(' · ')}</span>
                        </p>
                      ))}
                      {entry.versions.length > 0 && (
                        <p className="mt-1.5 text-caption text-fg-subtle">
                          Listed versions: <span className="font-mono">{entry.versions.join(', ')}</span>
                          {entry.versionsTruncated ? ' …' : ''}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            </StaggerItem>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <StaggerItem>
            <Panel headingId="component-heading" eyebrow="Your software" title="Component">
              <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
                <EcosystemBadge ecosystem={component.ecosystem} />
                <div className="min-w-0">
                  <p className="break-all font-mono text-label text-fg">
                    {component.name} {component.version ?? ''}
                  </p>
                  <p className="mt-0.5 text-caption text-fg-subtle">{component.ecosystemLabel}</p>
                  {component.purl && <p className="mt-1 break-all font-mono text-eyebrow text-fg-subtle">{component.purl}</p>}
                </div>
              </div>
              <dl className="divide-y divide-line-subtle border-t border-line-subtle">
                <Fact label="Asset">
                  <span className="inline-flex items-center gap-2">
                    <Link to={`/organization/assets/${asset.id}`} className="underline decoration-line-strong underline-offset-4 hover:text-ion">
                      {asset.name}
                    </Link>
                    {asset.archived && <ArchivedChip />}
                  </span>
                </Fact>
                <Fact label="First detected">{formatDate(match.firstDetectedAt)}</Fact>
                <Fact label="Last checked">{formatDate(match.lastEvaluatedAt)}</Fact>
              </dl>
            </Panel>
          </StaggerItem>

          <StaggerItem>
            <Panel headingId="advisory-heading" eyebrow="Advisory" title="Source record">
              <dl className="divide-y divide-line-subtle text-caption">
                <Fact label="Source">
                  <span className="inline-flex items-center gap-2">
                    <SourceTag source={vulnerability.source} label={vulnerability.sourceLabel} />
                    <Link
                      to={`/organization/vulnerabilities/${vulnerability.source}/${encodeURIComponent(vulnerability.sourceId)}`}
                      className="font-mono underline decoration-line-strong underline-offset-4 hover:text-ion"
                    >
                      {vulnerability.sourceId}
                    </Link>
                  </span>
                </Fact>
                {advisory?.cveIds?.length > 0 && <Fact label="CVE">{advisory.cveIds.join(', ')}</Fact>}
                {advisory?.weaknesses?.length > 0 && <Fact label="Weaknesses">{advisory.weaknesses.join(', ')}</Fact>}
                {advisory?.publishedAt && <Fact label="Published">{formatDate(advisory.publishedAt)}</Fact>}
                {advisory?.modifiedAt && <Fact label="Last modified">{formatDate(advisory.modifiedAt)}</Fact>}
                {vulnerability.knownExploited && <Fact label="Exploitation">Known exploited</Fact>}
              </dl>
            </Panel>
          </StaggerItem>
        </div>
      </div>
    </Stagger>
  )
}
