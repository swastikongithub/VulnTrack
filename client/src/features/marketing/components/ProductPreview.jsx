import { motion, useScroll, useTransform } from 'framer-motion'
import { Boxes, Search, SearchX, Settings, Users, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { getSmoothScroll } from '@/design-system/motion/smoothScrollInstance'
import {
  ASSET_CRITICALITIES,
  ASSET_ENVIRONMENTS,
  ASSET_IDENTIFIER_KINDS,
  ASSET_STATUSES,
  ASSET_TYPES,
  labelOf,
} from '@/features/assets/assetCatalog'
import { AssetTypeIcon, CriticalityMeter, ExposureChip, LifecycleChip, MetaChip, TagList } from '@/features/assets/components/AssetSignals'
import { cn } from '@/lib/cn'
import { SAMPLE_ASSETS, SAMPLE_ORGANIZATION } from '../data/sampleInventory'
import { SectionHeading } from './primitives'

const RANK = { critical: 4, high: 3, medium: 2, low: 1 }
const FILTERS = [{ value: 'all', label: 'All' }, ...ASSET_CRITICALITIES]

const matches = (asset, q) => {
  if (!q) return true
  const needle = q.toLowerCase()
  return [asset.name, asset.team, ...asset.tags, ...asset.technologies, ...asset.identifiers.map((i) => i.value)].some((v) =>
    v?.toLowerCase().includes(needle),
  )
}

function useDesktopTilt(ref) {
  const { reducedMotion } = useMotionPreference()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.3'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1])
  const y = useTransform(scrollYProgress, [0, 1], [40, 0])
  const [wide] = useState(() => window.matchMedia('(min-width: 64rem)').matches)
  return reducedMotion || !wide ? undefined : { rotateX, scale, y, transformPerspective: 1800 }
}

function Readouts({ assets }) {
  const items = [
    { label: 'Live assets', value: assets.length },
    { label: 'Critical', value: assets.filter((a) => a.criticality === 'critical').length },
    { label: 'Internet-facing', value: assets.filter((a) => a.exposure === 'internet_facing').length },
    { label: 'Archived', value: 0 },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line-subtle ring-1 ring-line md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3">
          <dt className="eyebrow text-fg-subtle">{item.label}</dt>
          <dd className="mt-1 text-title-2 tabular text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AssetDetail({ asset, onClose, id }) {
  return (
    <motion.section
      key={asset.id}
      id={id}
      aria-label={`${asset.name} details`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg bg-surface ring-1 ring-line"
    >
      <header className="flex items-start gap-3 border-b border-line-subtle p-4">
        <AssetTypeIcon type={asset.type} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-body-lg font-medium text-fg">{asset.name}</h4>
          <p className="text-caption text-fg-subtle">
            {labelOf(ASSET_TYPES, asset.type)} · {labelOf(ASSET_ENVIRONMENTS, asset.environment)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-m-1 grid size-10 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-hover hover:text-fg xl:hidden"
        >
          <span className="sr-only">Close details</span>
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <div className="grid gap-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CriticalityMeter criticality={asset.criticality} label={labelOf(ASSET_CRITICALITIES, asset.criticality)} />
          <LifecycleChip status={asset.status} label={labelOf(ASSET_STATUSES, asset.status)} />
          <ExposureChip exposure={asset.exposure} label={asset.exposure === 'internet_facing' ? 'Internet-facing' : 'Internal'} />
        </div>
        <p className="text-body text-fg-muted">{asset.description}</p>
        <div>
          <h5 className="eyebrow mb-2 text-fg-subtle">Identifiers</h5>
          <ul className="grid gap-1.5">
            {asset.identifiers.map((identifier) => (
              <li key={identifier.value} className="flex min-w-0 items-center gap-2 rounded-md bg-surface-well px-2.5 py-1.5">
                <span className="eyebrow w-20 shrink-0 truncate text-fg-subtle">{labelOf(ASSET_IDENTIFIER_KINDS, identifier.kind)}</span>
                <span className="truncate font-mono text-caption text-fg">{identifier.value}</span>
              </li>
            ))}
          </ul>
        </div>
        {(asset.tags.length > 0 || asset.technologies.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TagList tags={asset.tags} />
            {asset.technologies.map((tech) => (
              <MetaChip key={tech}>{tech}</MetaChip>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-caption">
          <div>
            <dt className="text-fg-subtle">Owning team</dt>
            <dd className="mt-0.5 text-fg">{asset.team}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Contact</dt>
            <dd className="mt-0.5 text-fg">{asset.contact ?? <span className="text-fg-subtle">Not assigned</span>}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Source</dt>
            <dd className="mt-0.5 text-fg">Manual entry</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Updated</dt>
            <dd className="mt-0.5 text-fg">{asset.updated}</dd>
          </div>
        </dl>
      </div>
    </motion.section>
  )
}

/**
 * A working replica of the asset inventory, built from the real asset
 * components with a fictional organization. Search, filters and selection
 * run locally; nothing is sent to the API.
 */
export function ProductPreview() {
  const frameRef = useRef(null)
  const tilt = useDesktopTilt(frameRef)
  const { reducedMotion } = useMotionPreference()
  const [query, setQuery] = useState('')
  const [criticality, setCriticality] = useState('all')
  const [exposedOnly, setExposedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState('payments-api')
  const detailId = useId()
  const searchId = useId()

  const results = useMemo(
    () =>
      SAMPLE_ASSETS.filter(
        (asset) =>
          matches(asset, query.trim()) &&
          (criticality === 'all' || asset.criticality === criticality) &&
          (!exposedOnly || asset.exposure === 'internet_facing'),
      ).sort((a, b) => RANK[b.criticality] - RANK[a.criticality] || a.name.localeCompare(b.name)),
    [query, criticality, exposedOnly],
  )
  const selected = SAMPLE_ASSETS.find((asset) => asset.id === selectedId) ?? null
  const filtered = query || criticality !== 'all' || exposedOnly

  // Below 1280px the detail sits under the list: bring it into view on selection.
  const select = (id) => {
    setSelectedId(id)
    if (window.matchMedia('(min-width: 80rem)').matches) return
    requestAnimationFrame(() => {
      const detail = document.getElementById(detailId)
      if (!detail) return
      const lenis = getSmoothScroll()
      if (lenis) lenis.scrollTo(detail, { offset: -96 })
      else detail.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    })
  }

  const clear = () => {
    setQuery('')
    setCriticality('all')
    setExposedOnly(false)
  }

  return (
    <section id="preview" aria-labelledby="preview-title" className="relative z-[1] bg-ink-950 pt-24 sm:pt-32">
      {/* Soft edge where the page takes over from the artwork */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-40 bg-gradient-to-b from-transparent to-ink-950" />
      <div className="mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-10">
        <SectionHeading index="02" eyebrow="Product preview" title={<span id="preview-title">The inventory, as your team uses it.</span>}>
          Built from the same components as the app, filled with a fictional organization. Search it, filter it, open an asset —
          it all runs in your browser.
        </SectionHeading>

        <div className="mt-12 sm:mt-16">
          <motion.div
            ref={frameRef}
            style={tilt}
            className="relative origin-top rounded-2xl bg-ink-900 p-2 shadow-e3 ring-1 ring-line sm:p-3"
          >
            <span aria-hidden="true" className="brackets pointer-events-none absolute -inset-2 hidden opacity-50 sm:block" />
            {/* App chrome: organization + real navigation items */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-subtle px-3 pb-3 pt-1 sm:px-4">
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-ion-dim text-caption font-semibold text-ion ring-1 ring-ion/30">
                  H
                </span>
                <span className="text-label text-fg">{SAMPLE_ORGANIZATION}</span>
              </span>
              <ul aria-hidden="true" className="hidden items-center gap-1 text-caption sm:flex">
                <li className="flex items-center gap-1.5 rounded-md bg-surface-hover px-2.5 py-1.5 text-fg">
                  <Boxes size={14} /> Assets
                </li>
                <li className="flex items-center gap-1.5 px-2.5 py-1.5 text-fg-subtle">
                  <Users size={14} /> Members
                </li>
                <li className="flex items-center gap-1.5 px-2.5 py-1.5 text-fg-subtle">
                  <Settings size={14} /> Settings
                </li>
              </ul>
              <span className="eyebrow ml-auto rounded-full bg-surface-raised px-2.5 py-1 text-fg-subtle ring-1 ring-line">
                Sample data
              </span>
            </div>

            <div className="grid gap-4 p-2 pt-4 sm:p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-4">
                <Readouts assets={SAMPLE_ASSETS} />

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <label htmlFor={searchId} className="relative block lg:w-72">
                    <span className="sr-only">Search the sample inventory</span>
                    <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                    <input
                      id={searchId}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name, identifier, tag…"
                      autoComplete="off"
                      className="h-11 w-full rounded-md bg-surface-well pl-9 pr-3 text-body text-fg ring-1 ring-inset ring-line placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ion"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="Criticality" className="flex gap-0.5 rounded-md bg-surface-well p-1 ring-1 ring-inset ring-line xs:gap-1">
                      {FILTERS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={criticality === option.value}
                          onClick={() => setCriticality(option.value)}
                          className={cn(
                            'h-9 rounded-sm px-2 text-caption transition-colors xs:px-2.5',
                            criticality === option.value ? 'bg-surface-hover text-fg ring-1 ring-line-strong' : 'text-fg-subtle hover:text-fg',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-pressed={exposedOnly}
                      onClick={() => setExposedOnly((v) => !v)}
                      className={cn(
                        'inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-caption ring-1 ring-inset transition-colors',
                        exposedOnly ? 'bg-ion-dim text-ion ring-ion/40' : 'bg-surface-well text-fg-muted ring-line hover:text-fg',
                      )}
                    >
                      Internet-facing only
                    </button>
                  </div>
                </div>

                <div className="rounded-lg bg-surface ring-1 ring-line">
                  <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                    <p className="text-label text-fg">
                      Live assets <span className="ml-1 text-fg-subtle tabular" aria-live="polite">{results.length} results · sorted by criticality</span>
                    </p>
                    {filtered && (
                      <button type="button" onClick={clear} className="h-9 rounded-md px-2 text-caption text-ion hover:underline">
                        Clear filters
                      </button>
                    )}
                  </div>

                  {results.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                      <SearchX aria-hidden="true" size={22} className="text-fg-subtle" />
                      <p className="text-body text-fg-muted">No sample assets match.</p>
                    </div>
                  ) : (
                    <>
                      {/* ≥768: table */}
                      <table className="hidden w-full table-fixed text-left md:table">
                        <thead>
                          <tr className="eyebrow text-fg-subtle">
                            <th scope="col" className="w-[44%] px-4 py-2.5 font-normal">Asset</th>
                            <th scope="col" className="w-[20%] px-3 py-2.5 font-normal">Criticality</th>
                            <th scope="col" className="w-[16%] px-3 py-2.5 font-normal">Environment</th>
                            <th scope="col" className="w-[20%] px-3 py-2.5 font-normal">Lifecycle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((asset) => {
                            const isSelected = asset.id === selectedId
                            return (
                              <tr
                                key={asset.id}
                                className={cn(
                                  'relative border-t border-line-subtle transition-colors',
                                  isSelected ? 'bg-ion/[0.06]' : 'hover:bg-surface-hover/60',
                                )}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <AssetTypeIcon type={asset.type} />
                                    <div className="min-w-0">
                                      <button
                                        type="button"
                                        aria-pressed={isSelected}
                                        aria-controls={detailId}
                                        onClick={() => select(asset.id)}
                                        className={cn(
                                          'block max-w-full truncate text-left text-label after:absolute after:inset-0 after:content-[""] focus-visible:outline-offset-[-2px]',
                                          isSelected ? 'text-ion' : 'text-fg',
                                        )}
                                      >
                                        {asset.name}
                                      </button>
                                      <p className="truncate font-mono text-eyebrow text-fg-subtle">{asset.identifiers[0].value}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <CriticalityMeter compact criticality={asset.criticality} label={labelOf(ASSET_CRITICALITIES, asset.criticality)} />
                                </td>
                                <td className="px-3 py-3 text-caption text-fg-muted">
                                  {labelOf(ASSET_ENVIRONMENTS, asset.environment)}
                                  {asset.exposure === 'internet_facing' && <span className="block text-ion">Internet-facing</span>}
                                </td>
                                <td className="px-3 py-3">
                                  <LifecycleChip status={asset.status} label={labelOf(ASSET_STATUSES, asset.status)} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {/* <768: cards */}
                      <ul className="divide-y divide-line-subtle md:hidden">
                        {results.map((asset) => {
                          const isSelected = asset.id === selectedId
                          return (
                            <li key={asset.id} className={cn('relative p-4', isSelected && 'bg-ion/[0.06]')}>
                              <div className="flex min-w-0 items-start gap-3">
                                <AssetTypeIcon type={asset.type} />
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    aria-pressed={isSelected}
                                    aria-controls={detailId}
                                    onClick={() => select(asset.id)}
                                    className={cn(
                                      'block max-w-full truncate text-left text-label after:absolute after:inset-0 after:content-[""] focus-visible:outline-offset-[-2px]',
                                      isSelected ? 'text-ion' : 'text-fg',
                                    )}
                                  >
                                    {asset.name}
                                  </button>
                                  <p className="truncate font-mono text-eyebrow text-fg-subtle">{asset.identifiers[0].value}</p>
                                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <CriticalityMeter compact criticality={asset.criticality} label={labelOf(ASSET_CRITICALITIES, asset.criticality)} />
                                    <LifecycleChip status={asset.status} label={labelOf(ASSET_STATUSES, asset.status)} />
                                  </div>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                {selected ? (
                  <AssetDetail id={detailId} asset={selected} onClose={() => setSelectedId(null)} />
                ) : (
                  <div id={detailId} className="hidden h-full min-h-40 place-items-center rounded-lg border border-dashed border-line p-6 text-center text-caption text-fg-subtle xl:grid">
                    Select an asset to see its details.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          <p className="mt-4 text-center text-caption text-fg-subtle">
            Product preview · {SAMPLE_ORGANIZATION} is a fictional organization.
          </p>
        </div>
      </div>
    </section>
  )
}
