import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, Check, Globe } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useMotionPreference } from '@/design-system/motion/MotionPreferenceProvider'
import { ASSET_CRITICALITIES, ASSET_STATUSES } from '@/features/assets/assetCatalog'
import { CriticalityMeter, LifecycleChip, MetaChip } from '@/features/assets/components/AssetSignals'
import { cn } from '@/lib/cn'
import { requestSurfaceFrame, surfaceMotion } from '../artwork/surfaceStore'
import { SectionHeading } from './primitives'

gsap.registerPlugin(ScrollTrigger)

const IDENTIFIERS = [
  { kind: 'URL', value: 'https://pay.halcyon.example/v2' },
  { kind: 'Repository', value: 'github.com/halcyon-labs/payments-api' },
  { kind: 'IP address', value: '203.0.113.0/24' },
]

function IdentifierFragment() {
  return (
    <ul className="grid gap-2" aria-label="Example identifiers">
      {IDENTIFIERS.map((identifier) => (
        <li
          key={identifier.kind}
          className="flex min-w-0 items-center gap-3 rounded-md bg-surface-well/80 px-3 py-2 ring-1 ring-inset ring-line"
        >
          <span className="eyebrow w-[5.5rem] shrink-0 text-fg-subtle">{identifier.kind}</span>
          <span className="truncate font-mono text-caption text-fg">{identifier.value}</span>
        </li>
      ))}
      <li className="flex items-center gap-2 pt-1 text-caption text-fg-subtle">
        <Check aria-hidden="true" size={14} className="text-success" />
        Normalized and unique within your organization
      </li>
    </ul>
  )
}

function ClassifyFragment() {
  return (
    <div className="grid gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Criticality levels">
        {ASSET_CRITICALITIES.map((level) => (
          <li key={level.value}>
            <CriticalityMeter criticality={level.value} label={level.label} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <MetaChip icon={Globe} tone="signal">
          Internet-facing
        </MetaChip>
        <MetaChip>Internal</MetaChip>
        <MetaChip>Production</MetaChip>
        <MetaChip>Staging</MetaChip>
      </div>
      <p className="text-caption text-fg-subtle">
        In the artwork: bands are criticality levels, ringed points are internet-facing.
      </p>
    </div>
  )
}

function OwnFragment() {
  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Lifecycle">
        {ASSET_STATUSES.map((status, i) => (
          <li key={status.value} className="flex items-center gap-1.5">
            <LifecycleChip status={status.value} label={status.label} />
            {i < ASSET_STATUSES.length - 1 && <ArrowRight aria-hidden="true" size={13} className="text-fg-disabled" />}
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line-subtle ring-1 ring-line">
        <div className="bg-surface/90 px-3 py-2.5">
          <dt className="eyebrow text-fg-subtle">Team</dt>
          <dd className="mt-1 text-label text-fg">Payments</dd>
        </div>
        <div className="bg-surface/90 px-3 py-2.5">
          <dt className="eyebrow text-fg-subtle">Contact</dt>
          <dd className="mt-1 truncate text-label text-fg">Priya Raman</dd>
        </div>
      </dl>
    </div>
  )
}

const STEPS = [
  {
    key: 'record',
    label: 'Inventory',
    title: 'Every system, recorded once.',
    body: (
      <>
        Web apps, APIs, servers, databases, containers, repositories, cloud resources, mobile apps and network devices.
        Each asset carries typed identifiers, normalized so the same system can’t be entered twice.
      </>
    ),
    fragment: IdentifierFragment,
  },
  {
    key: 'classify',
    label: 'Context',
    title: 'Ranked by what it would cost you.',
    body: (
      <>
        Give every asset a business criticality, an environment and its internet exposure. Filter the inventory by any of
        them and sort by criticality, so the systems that matter most come first.
      </>
    ),
    fragment: ClassifyFragment,
  },
  {
    key: 'own',
    label: 'Ownership',
    title: 'Owned, with a lifecycle.',
    body: (
      <>
        Assign an owning team and a contact from your members, track each system from planned to retired, and archive what’s
        gone. Every change is written to the organization’s audit log.
      </>
    ),
    fragment: OwnFragment,
  },
]

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * The product story. Copy scrolls on the left while the fixed artwork (behind)
 * morphs Inventoried → Classified → Owned in step with it. No pinning: the
 * page scrolls normally; ScrollTrigger only reads the position.
 */
export function SurfaceStory() {
  const stepsRef = useRef(null)
  const [active, setActive] = useState(0)
  const { reducedMotion } = useMotionPreference()

  useLayoutEffect(() => {
    const steps = stepsRef.current
    if (!steps) return undefined
    let current = -1
    const trigger = ScrollTrigger.create({
      trigger: steps,
      start: 'top 55%',
      end: 'bottom 55%',
      onUpdate: (self) => {
        const raw = Math.min(2.999, self.progress * 3)
        const index = Math.floor(raw)
        // Each step holds its state; the morph happens in the first ~40% of the step.
        surfaceMotion.story = reducedMotion ? index : index === 0 ? 0 : index - 1 + smooth((raw - index) / 0.4)
        if (index !== current) {
          current = index
          setActive(index)
        }
        if (reducedMotion) requestSurfaceFrame()
      },
    })
    return () => trigger.kill()
  }, [reducedMotion])

  return (
    <section id="product" aria-labelledby="product-title" className="relative scroll-mt-16 lg:pb-[24vh]">
      <div className="mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-10">
        <div className="lg:max-w-[30rem] xl:max-w-[34rem]">
          <div className="rounded-xl bg-ink-950/85 p-5 ring-1 ring-line sm:p-7 lg:bg-transparent lg:p-0 lg:ring-0">
            <SectionHeading index="01" eyebrow="The inventory" title={<span id="product-title">From scattered systems to an accountable inventory.</span>}>
              Most teams can’t say with confidence what they run, how exposed it is, or who owns it. VulnTrack starts there.
            </SectionHeading>
          </div>

          <div className="relative mt-[30svh] lg:mt-[12vh]">
            {/* Progress rail (desktop) */}
            <span aria-hidden="true" className="absolute bottom-[15vh] left-0 top-[15vh] hidden w-px bg-line lg:block" />
            <ol ref={stepsRef}>
              {STEPS.map((step, i) => {
                const Fragment = step.fragment
                const isActive = active === i
                return (
                  <li
                    key={step.key}
                    aria-current={isActive ? 'step' : undefined}
                    className="relative flex min-h-[92svh] items-end pb-[6svh] lg:min-h-[80vh] lg:items-center lg:pb-0 lg:pl-10"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-[-3.5px] top-1/2 hidden size-2 -translate-y-1/2 rounded-full ring-4 ring-ink-950 transition-colors duration-500 lg:block',
                        isActive ? 'bg-ion' : 'bg-ink-600',
                      )}
                    />
                    <article
                      className={cn(
                        'w-full rounded-xl bg-ink-950/90 p-5 ring-1 ring-line transition-opacity duration-500 sm:p-7',
                        'lg:bg-transparent lg:p-0 lg:ring-0',
                        isActive ? 'lg:opacity-100' : 'lg:opacity-45',
                      )}
                    >
                      <p className="eyebrow flex items-center gap-2 text-fg-subtle">
                        <span className="tabular text-ion">{String(i + 1).padStart(2, '0')}</span>
                        <span aria-hidden="true">/</span>
                        <span className="tabular">03</span>
                        <span aria-hidden="true" className="mx-1 h-px w-4 bg-line-strong" />
                        {step.label}
                      </p>
                      <h3 className="mt-4 text-title-1 text-fg sm:text-[2.125rem]">{step.title}</h3>
                      <p className="mt-4 text-body-lg text-fg-muted">{step.body}</p>
                      <div className="mt-6">
                        <Fragment />
                      </div>
                    </article>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
