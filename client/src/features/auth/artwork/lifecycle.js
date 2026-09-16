/**
 * The vulnerability lifecycle from the product plan. The artwork's HUD ring
 * narrates these stages — real product concepts, not fake telemetry.
 */
export const LIFECYCLE = [
  { name: 'Discover', description: 'Inventory the assets and software your organization runs.' },
  { name: 'Identify', description: 'Match published vulnerabilities against that inventory.' },
  { name: 'Assess', description: 'Understand technical severity through CVSS and CWE.' },
  { name: 'Prioritize', description: 'Rank findings by organizational risk, not CVSS alone.' },
  { name: 'Assign', description: 'Route every finding to the team that owns the fix.' },
  { name: 'Remediate', description: 'Patch, upgrade or mitigate the weakness.' },
  { name: 'Verify', description: 'Confirm the fix actually landed.' },
  { name: 'Close', description: 'Resolve the finding with a complete audit trail.' },
]

export const STAGE = { VERIFY: 6, CLOSE: 7 }
