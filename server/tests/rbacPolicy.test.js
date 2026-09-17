import { describe, expect, it } from 'vitest'
import { PERMISSIONS, permissionsForRole, roleHasPermission, ROLE_VALUES } from '../src/config/roles.js'
import {
  assignableRoles,
  decideInvitation,
  decideRemoval,
  decideRoleChange,
  memberActions,
} from '../src/services/organizationPolicy.js'

const m = (userId, role) => ({ userId, role })

describe('permission matrix', () => {
  it('matches the documented matrix for every role and permission', () => {
    const everyone = ROLE_VALUES
    const managers = ['owner', 'admin']
    const securityTeam = ['owner', 'admin', 'security_analyst']
    const expected = {
      'organization:read': everyone,
      'organization:update': managers,
      'members:read': securityTeam,
      'members:invite': managers,
      'members:update_role': managers,
      'members:remove': managers,
      'assets:read': everyone,
      'assets:create': securityTeam,
      'assets:update': securityTeam,
      'assets:delete': managers,
      'vulnerabilities:read': everyone,
      'findings:read': everyone,
      'findings:create': securityTeam,
      'findings:update': securityTeam,
      'remediation:manage': securityTeam,
      'scans:run': securityTeam,
    }
    expect(Object.values(PERMISSIONS).sort()).toEqual(Object.keys(expected).sort())
    for (const [permission, roles] of Object.entries(expected)) {
      for (const role of ROLE_VALUES) {
        expect(roleHasPermission(role, permission), `${role} → ${permission}`).toBe(roles.includes(role))
      }
    }
  })

  it('denies by default for unknown roles and permissions', () => {
    expect(roleHasPermission('superuser', 'organization:read')).toBe(false)
    expect(roleHasPermission('owner', 'organization:delete')).toBe(false)
    expect(roleHasPermission(undefined, 'organization:read')).toBe(false)
    expect(permissionsForRole('superuser')).toEqual([])
  })

  it('lists permissions per role in a stable order', () => {
    expect(permissionsForRole('viewer')).toEqual([
      'assets:read',
      'findings:read',
      'organization:read',
      'vulnerabilities:read',
    ])
  })
})

describe('role hierarchy policy', () => {
  it('owners can grant any role; others only roles below their own', () => {
    expect(assignableRoles('owner')).toEqual(['owner', 'admin', 'security_analyst', 'developer', 'viewer'])
    expect(assignableRoles('admin')).toEqual(['security_analyst', 'developer', 'viewer'])
  })

  it('blocks self-changes, managing equal or higher roles and granting unassignable roles', () => {
    const owner = m('o1', 'owner')
    const admin = m('a1', 'admin')

    expect(decideRoleChange(owner, owner, 'admin')).toEqual({ allowed: false, reason: 'self' })
    expect(decideRoleChange(admin, admin, 'owner')).toEqual({ allowed: false, reason: 'self' })
    expect(decideRoleChange(admin, m('o2', 'owner'), 'viewer')).toEqual({ allowed: false, reason: 'outranked' })
    expect(decideRoleChange(admin, m('a2', 'admin'), 'viewer')).toEqual({ allowed: false, reason: 'outranked' })
    expect(decideRoleChange(admin, m('d1', 'developer'), 'admin')).toEqual({ allowed: false, reason: 'role_not_assignable' })
    expect(decideRoleChange(admin, m('d1', 'developer'), 'owner')).toEqual({ allowed: false, reason: 'role_not_assignable' })
    expect(decideRoleChange(m('v1', 'viewer'), m('d1', 'developer'), 'viewer')).toEqual({ allowed: false, reason: 'no_permission' })
    expect(decideRoleChange(m('s1', 'security_analyst'), m('v1', 'viewer'), 'developer')).toEqual({
      allowed: false,
      reason: 'no_permission',
    })

    expect(decideRoleChange(admin, m('d1', 'developer'), 'security_analyst')).toEqual({ allowed: true })
    expect(decideRoleChange(owner, m('o2', 'owner'), 'admin')).toEqual({ allowed: true })
    expect(decideRoleChange(owner, m('a1', 'admin'), 'owner')).toEqual({ allowed: true })
  })

  it('applies the same hierarchy to removals and invitations', () => {
    expect(decideRemoval(m('a1', 'admin'), m('o1', 'owner')).allowed).toBe(false)
    expect(decideRemoval(m('a1', 'admin'), m('v1', 'viewer')).allowed).toBe(true)
    expect(decideRemoval(m('o1', 'owner'), m('o1', 'owner'))).toEqual({ allowed: false, reason: 'self' })

    expect(decideInvitation('admin', 'admin')).toEqual({ allowed: false, reason: 'role_not_assignable' })
    expect(decideInvitation('admin', 'viewer')).toEqual({ allowed: true })
    expect(decideInvitation('owner', 'owner')).toEqual({ allowed: true })
    expect(decideInvitation('security_analyst', 'viewer')).toEqual({ allowed: false, reason: 'no_permission' })
  })

  it('treats user ids as equal regardless of type (ObjectId vs string)', () => {
    const id = { toString: () => '64b000000000000000000001' }
    expect(memberActions(m(id, 'owner'), m('64b000000000000000000001', 'owner'))).toEqual({ updateRole: false, remove: false })
  })
})
