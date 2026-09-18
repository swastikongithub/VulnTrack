import { SectionHeading, Reveal } from './primitives'

/**
 * Security spec sheet. Every row describes a control that is implemented and
 * covered by the server test suite (see docs/authentication, docs/organization,
 * docs/assets). Wording avoids absolute claims on purpose.
 */
const SPEC = [
  {
    title: 'Passwords',
    body: 'Hashed with Argon2id at OWASP-recommended parameters. At least 12 characters, and never containing your name or email.',
  },
  {
    title: 'Sessions',
    body: 'Server-side sessions in httpOnly cookies. Only a hash of the session ID is stored, and sessions are revoked on sign-out and password reset.',
  },
  {
    title: 'Request forgery',
    body: 'State-changing requests must come from the app’s exact origin, as JSON, with SameSite cookies.',
  },
  {
    title: 'Brute force',
    body: 'Rate limits per IP address and per account, with temporary lockout. Sign-in and recovery responses don’t reveal whether an account exists.',
  },
  {
    title: 'Email links',
    body: 'Verification, password-reset and invitation tokens are stored hashed, work once, and expire.',
  },
  {
    title: 'Tenant isolation',
    body: 'Every query is scoped to your organization. Records from other organizations can’t be read or changed, even by ID.',
  },
  {
    title: 'Authorization',
    body: 'A central, default-deny permission matrix checked on the server for every request, plus hierarchy rules for managing people.',
  },
  {
    title: 'Audit logging',
    body: 'Sign-ins, membership and role changes, invitations and every asset change are recorded with who did it. A log viewer is on the roadmap.',
  },
  {
    title: 'Tested',
    body: 'Automated tests cover cross-tenant access, privilege escalation, token reuse, input injection and concurrent edits.',
  },
]

export function SecuritySpec() {
  return (
    <section id="security" aria-labelledby="security-title" className="relative z-[1] bg-ink-950 py-24 sm:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
      <div className="mx-auto max-w-[84rem] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading index="05" eyebrow="Security" title={<span id="security-title">Built the way a security product should be.</span>}>
              The foundations your inventory sits on. No product is ever “fully secure”; these are the controls in place today.
            </SectionHeading>
          </div>

          <ol className="border-t border-line">
            {SPEC.map((row, i) => (
              <Reveal
                as="li"
                key={row.title}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-b border-line py-5 sm:grid-cols-[3rem_11rem_minmax(0,1fr)] sm:py-6"
              >
                <span className="eyebrow pt-1 tabular text-ion">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-body-lg font-medium text-fg">{row.title}</h3>
                <p className="col-start-2 text-body text-fg-muted sm:col-start-3 sm:row-start-1">{row.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
