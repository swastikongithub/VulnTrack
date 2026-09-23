import { Link } from 'react-router'
import { ArchivedChip } from '@/features/assets/components/AssetSignals'
import { EcosystemBadge } from '@/features/software/components/SoftwareSignals'
import { SeverityBadge, SourceTag } from '@/features/vulnerabilities/components/VulnerabilitySignals'
import { cn } from '@/lib/cn'
import { ConfidenceChip, FixedIn, MatchStatusChip } from './MatchSignals'

/**
 * Matches: a semantic table from 768px, stacked cards below. A row links to
 * the match, which explains the decision; the advisory and the asset are
 * separate links, because they are separate things.
 */
export function MatchResults({ matches, showAsset = true, busy, caption }) {
  return (
    <div aria-busy={busy || undefined} className={cn('@container transition-opacity duration-[var(--duration-base)]', busy && 'opacity-60')}>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-subtle">
            {[
              ['Advisory', 'pl-6 w-64'],
              ['Severity', 'w-36'],
              ['Component', ''],
              showAsset && ['Asset', 'w-[18%] @max-3xl:hidden'],
              ['Match', 'w-44'],
            ]
              .filter(Boolean)
              .map(([label, cls]) => (
                <th key={label} scope="col" className={cn('eyebrow py-2.5 pr-4 text-left font-normal text-fg-subtle', cls)}>
                  {label}
                </th>
              ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {matches.map((match) => (
            <tr key={match.id} className="group relative transition-colors duration-[var(--duration-fast)] hover:bg-surface-hover/60">
              <td className="py-3 pl-6 pr-4 align-top">
                <p className="flex min-w-0 items-center gap-2">
                  <SourceTag source={match.vulnerability.source} label={match.vulnerability.sourceLabel} />
                  <Link
                    to={`/organization/matches/${match.id}`}
                    className="truncate font-mono text-label text-fg after:absolute after:inset-0 group-hover:text-ion focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ion"
                  >
                    {match.vulnerability.sourceId}
                  </Link>
                </p>
                {match.vulnerability.knownExploited && <p className="mt-1 text-caption text-danger">Known exploited</p>}
              </td>
              <td className="py-3 pr-4 align-top">
                <SeverityBadge severity={match.vulnerability.severity} label={match.vulnerability.severityLabel} score={match.vulnerability.cvssScore} />
              </td>
              <td className="py-3 pr-4 align-top">
                <div className="flex min-w-0 items-start gap-2.5">
                  <EcosystemBadge ecosystem={match.component.ecosystem} className="size-7" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-label text-fg">
                      {match.component.name}
                      {match.component.version && <span className="text-fg-muted"> {match.component.version}</span>}
                    </p>
                    <FixedIn versions={match.fixedVersions} className="mt-0.5 block" />
                  </div>
                </div>
              </td>
              {showAsset && (
                <td className="py-3 pr-4 align-top @max-3xl:hidden">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      to={`/organization/assets/${match.asset.id}`}
                      className="relative z-[1] truncate text-caption text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-ion focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
                    >
                      {match.asset.name}
                    </Link>
                    {match.asset.archived && <ArchivedChip />}
                  </span>
                </td>
              )}
              <td className="py-3 pr-4 align-top">
                <div className="flex flex-col items-start gap-1.5">
                  <MatchStatusChip status={match.status} label={match.statusLabel} />
                  <ConfidenceChip confidence={match.confidence} label={match.confidenceLabel} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line-subtle md:hidden" aria-label={caption}>
        {matches.map((match) => (
          <li key={match.id} className="group relative px-4 py-4 transition-colors hover:bg-surface-hover/60">
            <div className="flex items-start justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2">
                <SourceTag source={match.vulnerability.source} label={match.vulnerability.sourceLabel} />
                <Link
                  to={`/organization/matches/${match.id}`}
                  className="truncate font-mono text-label text-fg after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ion"
                >
                  {match.vulnerability.sourceId}
                </Link>
              </p>
              <SeverityBadge severity={match.vulnerability.severity} label={match.vulnerability.severityLabel} score={match.vulnerability.cvssScore} />
            </div>
            <p className="mt-2 flex min-w-0 items-center gap-2 font-mono text-caption text-fg-muted">
              <EcosystemBadge ecosystem={match.component.ecosystem} className="size-6" />
              <span className="truncate">
                {match.component.name} {match.component.version ?? ''}
              </span>
            </p>
            {showAsset && <p className="mt-1 truncate text-caption text-fg-subtle">on {match.asset.name}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <MatchStatusChip status={match.status} label={match.statusLabel} />
              <ConfidenceChip confidence={match.confidence} label={match.confidenceLabel} />
            </p>
            <FixedIn versions={match.fixedVersions} className="mt-1.5 block" />
          </li>
        ))}
      </ul>
    </div>
  )
}
