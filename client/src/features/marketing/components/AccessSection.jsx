import { motion } from 'framer-motion'
import { Check, Minus } from 'lucide-react'
import { useState } from 'react'
import { spring } from '@/design-system/motion/tokens'
import { cn } from '@/lib/cn'
import { CAPABILITY_GROUPS, ROLES } from '../data/access'
import { Reveal, SectionHeading } from './primitives'

const RULES = [
  { title: 'Hierarchy', body: 'Admins manage the roles below them, never an owner. Only owners can appoint owners.' },
  { title: 'Last owner', body: 'An organization always keeps at least one owner, even when changes race each other.' },
  { title: 'Invitations', body: 'Bound to one email address, single-use, and expire after 7 days.' },
  {
    title: 'Tenant isolation',
    body: 'Belong to several organizations and switch between them. Another organization’s records return “not found”.',
  },
]

function Mark({ allowed, emphasis }) {
  return allowed ? (
    <span className={cn('inline-grid size-6 place-items-center rounded-full', emphasis ? 'bg-ion text-on-ion' : 'bg-ion-dim text-ion')}>
      <Check aria-hidden="true" size={14} strokeWidth={2.5} />
      <span className="sr-only">Allowed</span>
    </span>
  ) : (
    <span className="inline-grid size-6 place-items-center text-fg-disabled">
      <Minus aria-hidden="true" size={14} />
      <span className="sr-only">Not allowed</span>
    </span>
  )
}

/** Role selector + permission matrix, mirrored from the server's grants. */
export function AccessSection() {
  const [role, setRole] = useState('security_analyst')
  const selected = ROLES.find((r) => r.value === role)

  return (
    <section id="access" aria-labelledby="access-title" className="relative z-[1] bg-ink-950 py-24 sm:py-32">
      <div className="mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-10">
        <SectionHeading index="04" eyebrow="Teams & access" title={<span id="access-title">Everyone sees what their role allows.</span>}>
          Five roles, one permission matrix, checked on the server for every request. The interface adapts to what you can do,
          but it’s never what enforces it.
        </SectionHeading>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Reveal className="min-w-0 rounded-2xl bg-ink-900 p-3 ring-1 ring-line sm:p-5">
            <fieldset>
              <legend className="eyebrow mb-3 px-1 text-fg-subtle">Choose a role</legend>
              <div className="relative flex flex-wrap gap-1 rounded-lg bg-surface-well p-1 ring-1 ring-inset ring-line">
                {ROLES.map((r) => {
                  const checked = r.value === role
                  return (
                    <label
                      key={r.value}
                      className={cn(
                        'relative flex h-10 flex-1 basis-[calc(50%-0.25rem)] cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 text-label transition-colors sm:basis-0',
                        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ion',
                        checked ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                      )}
                    >
                      <input
                        type="radio"
                        name="marketing-role"
                        value={r.value}
                        checked={checked}
                        onChange={() => setRole(r.value)}
                        className="sr-only"
                      />
                      {checked && (
                        <motion.span
                          layoutId="role-pill"
                          transition={spring.layout}
                          className="absolute inset-0 rounded-md bg-surface-hover ring-1 ring-line-strong"
                        />
                      )}
                      <span className="relative">{r.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <p className="mt-3 px-1 text-body text-fg-muted" aria-live="polite">
              <span className="text-fg">{selected.label}:</span> {selected.summary}
            </p>

            <table className="mt-5 w-full text-left md:table-fixed">
              <caption className="sr-only">Permissions by role. The selected role is highlighted.</caption>
              <thead>
                <tr className="eyebrow text-fg-subtle">
                  <th scope="col" className="w-full px-2 py-2 font-normal md:w-[40%]">
                    Capability
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r.value}
                      scope="col"
                      className={cn(
                        'px-1 py-2 text-center font-normal tracking-[0.06em]',
                        r.value === role ? 'w-24 whitespace-nowrap text-ion md:w-auto' : 'hidden md:table-cell',
                      )}
                    >
                      <span className="block truncate">{r.label.replace('Security ', '')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {CAPABILITY_GROUPS.map((group) => (
                <tbody key={group.label} className="border-t border-line-subtle">
                  <tr>
                    <th scope="colgroup" colSpan={6} className="eyebrow px-2 pb-1 pt-4 font-normal text-fg-subtle">
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-2 py-2 text-label font-normal text-fg-muted">
                        {row.label}
                      </th>
                      {ROLES.map((r) => (
                        <td
                          key={r.value}
                          className={cn('px-1 py-2 text-center', r.value === role ? 'bg-ion/[0.05]' : 'hidden md:table-cell')}
                        >
                          <Mark allowed={row.roles.includes(r.value)} emphasis={r.value === role} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </Reveal>

          <ul className="grid content-start gap-3">
            {RULES.map((rule, i) => (
              <Reveal as="li" key={rule.title} delay={0.06 * i} className="rounded-xl bg-surface/70 p-4 ring-1 ring-line">
                <h3 className="text-label text-fg">{rule.title}</h3>
                <p className="mt-1.5 text-body text-fg-muted">{rule.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
