import { describeAssetError } from '../assets/assetErrors'

export const SOFTWARE_ERROR = {
  COMPONENT_EXISTS: 'SOFTWARE_COMPONENT_EXISTS',
  CONFLICT: 'SOFTWARE_CONFLICT',
  LIMIT_REACHED: 'SOFTWARE_LIMIT_REACHED',
}

/** Copy for software failures; falls back to asset / organization copy for shared codes. */
export function describeSoftwareError(error, action = 'save this component') {
  switch (error?.code) {
    case SOFTWARE_ERROR.COMPONENT_EXISTS:
      return { title: 'Already listed', body: 'This asset already lists this package at this version.' }
    case SOFTWARE_ERROR.CONFLICT:
      return { title: 'This component changed', body: 'Someone else updated or removed it after you opened it. The list has been refreshed.' }
    case SOFTWARE_ERROR.LIMIT_REACHED:
      return {
        title: 'Component limit reached',
        body: error.meta?.scope === 'asset' ? 'This asset has reached the maximum number of components.' : 'This organization has reached the maximum number of components.',
      }
    case 'ASSET_ARCHIVED':
      return { title: 'Asset is archived', body: 'Software of an archived asset is read-only. Restore the asset to make changes.' }
    case 'NOT_FOUND':
      return { title: 'Not found', body: 'The asset or component no longer exists. The list has been refreshed.' }
    default:
      return describeAssetError(error, action)
  }
}
