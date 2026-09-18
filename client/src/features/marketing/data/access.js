/**
 * Mirror of the grants in server/src/config/roles.js that back shipped
 * features (organization, members, assets). Permissions reserved for later
 * phases are deliberately left out of the marketing matrix.
 */

export const ROLES = [
  { value: 'owner', label: 'Owner', summary: 'Full control, including other owners.' },
  { value: 'admin', label: 'Admin', summary: 'Runs the organization, but cannot manage owners.' },
  { value: 'security_analyst', label: 'Security Analyst', summary: 'Maintains the inventory and can see the team.' },
  { value: 'developer', label: 'Developer', summary: 'Reads the inventory.' },
  { value: 'viewer', label: 'Viewer', summary: 'Read-only access.' },
]

const EVERYONE = ['owner', 'admin', 'security_analyst', 'developer', 'viewer']
const SECURITY_TEAM = ['owner', 'admin', 'security_analyst']
const MANAGERS = ['owner', 'admin']

export const CAPABILITY_GROUPS = [
  {
    label: 'Assets',
    rows: [
      { label: 'View, search and filter the inventory', roles: EVERYONE },
      { label: 'Create and edit assets', roles: SECURITY_TEAM },
      { label: 'Archive, restore and delete assets', roles: MANAGERS },
    ],
  },
  {
    label: 'People',
    rows: [
      { label: 'See members and invitations', roles: SECURITY_TEAM },
      { label: 'Invite members', roles: MANAGERS },
      { label: 'Change roles and remove members', roles: MANAGERS },
    ],
  },
  {
    label: 'Organization',
    rows: [
      { label: 'View the organization', roles: EVERYONE },
      { label: 'Rename and edit settings', roles: MANAGERS },
    ],
  },
]
