/**
 * Preview scenarios for the mock auth service (development only).
 * Rendered by the dev preview panel so every auth UI state is reachable.
 */
export const MOCK_SCENARIOS = {
  login: [
    { label: 'Successful sign-in', fill: { email: 'analyst@acme.io', password: 'correct horse battery' } },
    { label: 'Invalid credentials', fill: { email: 'analyst@acme.io', password: 'incorrect-password' } },
    { label: 'Email not verified', fill: { email: 'unverified@acme.io', password: 'correct horse battery' } },
    { label: 'Rate limited', fill: { email: 'locked@acme.io', password: 'correct horse battery' } },
    { label: 'Network failure', fill: { email: 'offline@acme.io', password: 'correct horse battery' } },
  ],
  signup: [
    {
      label: 'Create workspace',
      fill: {
        fullName: 'Ada Morgan',
        email: 'ada@acme.io',
        workspace: 'Acme Security',
        password: 'Lattice-Perimeter-42',
        confirmPassword: 'Lattice-Perimeter-42',
      },
    },
    {
      label: 'Server error',
      fill: {
        fullName: 'Ada Morgan',
        email: 'error@acme.io',
        workspace: 'Acme Security',
        password: 'Lattice-Perimeter-42',
        confirmPassword: 'Lattice-Perimeter-42',
      },
    },
  ],
  forgot: [
    { label: 'Request reset link', fill: { email: 'analyst@acme.io' } },
    { label: 'Service error', fill: { email: 'error@acme.io' } },
  ],
  links: [
    { label: 'Reset — valid link', to: '/reset-password?token=valid' },
    { label: 'Reset — expired link', to: '/reset-password?token=expired' },
    { label: 'Reset — server error on submit', to: '/reset-password?token=error' },
    { label: 'Verify — pending (inbox)', to: '/verify-email?email=ada%40acme.io' },
    { label: 'Verify — valid link', to: '/verify-email?token=valid' },
    { label: 'Verify — expired link', to: '/verify-email?token=expired' },
    { label: 'Verify — invalid link', to: '/verify-email?token=invalid' },
  ],
}
