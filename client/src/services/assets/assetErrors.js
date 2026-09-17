import { describeOrganizationError } from '../organization/organizationErrors'

export const ASSET_ERROR = {
  IDENTIFIER_EXISTS: 'ASSET_IDENTIFIER_EXISTS',
  CONFLICT: 'ASSET_CONFLICT',
  ARCHIVED: 'ASSET_ARCHIVED',
  NOT_ARCHIVED: 'ASSET_NOT_ARCHIVED',
  LIMIT_REACHED: 'ASSET_LIMIT_REACHED',
}

/** Copy for asset failures; falls back to the organization-area copy for shared codes. */
export function describeAssetError(error, action = 'save this asset') {
  switch (error?.code) {
    case ASSET_ERROR.IDENTIFIER_EXISTS:
      return { title: 'Identifier already in use', body: 'Another asset in this organization uses one of these identifiers.' }
    case ASSET_ERROR.CONFLICT:
      return { title: 'This asset changed', body: 'Someone else updated it after you opened it. Reload to see the latest version.' }
    case ASSET_ERROR.ARCHIVED:
      return { title: 'Asset is archived', body: 'Archived assets are read-only. Restore it to make changes.' }
    case ASSET_ERROR.NOT_ARCHIVED:
      return { title: 'Archive it first', body: 'Only archived assets can be deleted permanently.' }
    case ASSET_ERROR.LIMIT_REACHED:
      return { title: 'Asset limit reached', body: 'This organization has reached the maximum number of assets.' }
    default:
      return describeOrganizationError(error, action)
  }
}
