import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, CopyX } from 'lucide-react'
import { useState } from 'react'
import { SelectField, TextField } from '@/design-system/components'
import { duration, ease } from '@/design-system/motion/tokens'
import { ASSET_IDENTIFIER_KINDS } from '@/features/assets/assetCatalog'
import { SAMPLE_ASSETS } from '../data/sampleInventory'
import { previewIdentifier } from '../lib/identifierPreview'
import { Reveal, SectionHeading } from './primitives'

/** identifier key → sample asset name, built with the same rules. */
const SAMPLE_KEYS = new Map(
  SAMPLE_ASSETS.flatMap((asset) =>
    asset.identifiers.map((identifier) => [previewIdentifier(identifier.kind, identifier.value).key, asset.name]),
  ),
)

const PRESETS = [
  { kind: 'url', value: 'HTTPS://Pay.Halcyon.example:443/v2/?utm_source=mail#pricing', label: 'Messy URL' },
  { kind: 'repository', value: 'git@github.com:Halcyon-Labs/payments-api.git', label: 'SSH remote' },
  { kind: 'hostname', value: 'APP.Halcyon.example.', label: 'Hostname' },
  { kind: 'ip_address', value: '2001:DB8::10/64', label: 'IPv6 range' },
  { kind: 'url', value: 'javascript:alert(1)', label: 'Unsafe URL' },
]

function Outcome({ result }) {
  if (result.error) {
    return (
      <p className="flex items-start gap-2 text-body text-warning">
        <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
        <span>Rejected: {result.error}</span>
      </p>
    )
  }
  const duplicateOf = SAMPLE_KEYS.get(result.key)
  if (duplicateOf) {
    return (
      <p className="flex items-start gap-2 text-body text-fg">
        <CopyX aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-sev-high" />
        <span>
          Same system as <strong className="font-medium">{duplicateOf}</strong> in the sample inventory. A second live asset
          with this identifier is refused.
        </span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-2 text-body text-fg-muted">
      <CircleCheck aria-hidden="true" size={17} className="mt-0.5 shrink-0 text-success" />
      <span>New to this organization — it can be recorded.</span>
    </p>
  )
}

/**
 * Interactive demo of identifier normalization, using a browser copy of the
 * server's rules and the sample inventory. Nothing leaves the page.
 */
export function IdentifierPlayground() {
  const [kind, setKind] = useState(PRESETS[0].kind)
  const [value, setValue] = useState(PRESETS[0].value)
  const result = previewIdentifier(kind, value)

  return (
    <section id="identifiers" aria-labelledby="identifiers-title" className="relative z-[1] bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[84rem] gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:px-10">
        <SectionHeading index="03" eyebrow="Identifiers" title={<span id="identifiers-title">One system. One record.</span>}>
          <p>
            An asset is recognised by what identifies it: URLs, hostnames, IP addresses and ranges, repositories, cloud
            resource IDs, container images and packages. Each kind is validated and reduced to a canonical form, so casing,
            default ports, trailing slashes, query strings and <code className="font-mono text-caption">.git</code> suffixes
            can’t create a duplicate.
          </p>
          <p className="mt-4">
            Identifiers are records, not scan targets: saving one never triggers a network request.
          </p>
        </SectionHeading>

        <Reveal delay={0.1} className="relative rounded-2xl bg-ink-900 p-4 ring-1 ring-line sm:p-6">
          <span aria-hidden="true" className="brackets pointer-events-none absolute -inset-2 hidden opacity-40 sm:block" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow text-fg-subtle">Try it</p>
            <p className="text-caption text-fg-subtle">Runs in your browser · compared with the sample inventory</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Examples">
            {PRESETS.map((preset) => {
              const current = preset.kind === kind && preset.value === value
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={current}
                  onClick={() => {
                    setKind(preset.kind)
                    setValue(preset.value)
                  }}
                  className={
                    'h-9 rounded-full px-3 text-caption ring-1 ring-inset transition-colors ' +
                    (current ? 'bg-ion-dim text-ion ring-ion/40' : 'bg-surface-raised text-fg-muted ring-line hover:text-fg')
                  }
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <SelectField label="Kind" options={ASSET_IDENTIFIER_KINDS} value={kind} onChange={(event) => setKind(event.target.value)} />
            <TextField
              label="Value"
              required={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              inputClassName="font-mono text-label"
            />
          </div>

          <div className="mt-2 rounded-lg bg-surface ring-1 ring-line">
            <div className="border-b border-line-subtle px-4 py-3">
              <p className="eyebrow text-fg-subtle">Canonical key</p>
              <div className="mt-2 min-h-7 overflow-hidden" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={result.key ?? 'error'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.enter } }}
                    exit={{ opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.exit } }}
                    className="break-all font-mono text-body text-ion"
                  >
                    {result.key ?? <span className="text-fg-subtle">—</span>}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <div className="px-4 py-3.5">
              <Outcome result={result} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
