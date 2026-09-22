import { describe, expect, it } from 'vitest'
import { normalizeComponent } from '../src/utils/softwareIdentity.js'

const ok = (input) => {
  const result = normalizeComponent(input)
  if (result.fields) throw new Error(`unexpected field errors: ${JSON.stringify(result.fields)}`)
  return result
}
const fails = (input) => normalizeComponent(input).fields

describe('software identity normalization', () => {
  it('derives package key, normalized version and purl per ecosystem', () => {
    const cases = [
      [{ ecosystem: 'npm', name: 'Express', version: 'v4.18.2' }, 'npm:express', '4.18.2', 'pkg:npm/express@4.18.2'],
      [{ ecosystem: 'npm', name: '@NestJS/Core', version: '10.0.0' }, 'npm:@nestjs/core', '10.0.0', 'pkg:npm/%40nestjs/core@10.0.0'],
      [{ ecosystem: 'pypi', name: 'Django_REST.framework', version: '3.14.0' }, 'pypi:django-rest-framework', '3.14.0', 'pkg:pypi/django-rest-framework@3.14.0'],
      [{ ecosystem: 'pypi', name: 'requests', version: '2.31.0RC1' }, 'pypi:requests', '2.31.0rc1', 'pkg:pypi/requests@2.31.0rc1'],
      [
        { ecosystem: 'maven', name: 'org.apache.logging.log4j:log4j-core', version: '2.14.1' },
        'maven:org.apache.logging.log4j:log4j-core',
        '2.14.1',
        'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1',
      ],
      [{ ecosystem: 'nuget', name: 'Newtonsoft.Json', version: '13.0.1' }, 'nuget:newtonsoft.json', '13.0.1', 'pkg:nuget/newtonsoft.json@13.0.1'],
      [
        { ecosystem: 'go', name: 'GitHub.com/gin-gonic/gin', version: '1.9.1' },
        'go:github.com/gin-gonic/gin',
        'v1.9.1',
        'pkg:golang/github.com/gin-gonic/gin@v1.9.1',
      ],
      [{ ecosystem: 'cargo', name: 'Serde_JSON', version: '1.0.108' }, 'cargo:serde-json', '1.0.108', 'pkg:cargo/serde-json@1.0.108'],
      [{ ecosystem: 'rubygems', name: 'rails', version: '7.1.2' }, 'rubygems:rails', '7.1.2', 'pkg:gem/rails@7.1.2'],
      [{ ecosystem: 'packagist', name: 'Laravel/Framework', version: 'v10.3.0' }, 'packagist:laravel/framework', '10.3.0', 'pkg:composer/laravel/framework@10.3.0'],
      [{ ecosystem: 'generic', name: '  nginx ', vendor: 'F5', version: '1.25.3' }, 'generic:f5/nginx', '1.25.3', 'pkg:generic/f5/nginx@1.25.3'],
      [{ ecosystem: 'generic', name: 'Windows Server', version: '2019' }, 'generic:windows server', '2019', 'pkg:generic/windows%20server@2019'],
    ]
    for (const [input, key, version, purl] of cases) {
      const result = ok(input)
      expect({ key: result.componentKey, version: result.versionNormalized, purl: result.purl }).toEqual({ key, version, purl })
    }
  })

  it('keeps what was entered for display', () => {
    const result = ok({ ecosystem: 'npm', name: ' Express ', version: ' v4.18.2 ' })
    expect(result).toMatchObject({ name: 'Express', version: 'v4.18.2', versionNormalized: '4.18.2', vendor: null })
  })

  it('treats a missing version as unknown, not as a guess', () => {
    const result = ok({ ecosystem: 'pypi', name: 'django', version: '' })
    expect(result).toMatchObject({ version: null, versionNormalized: null, purl: 'pkg:pypi/django' })
    expect(ok({ ecosystem: 'npm', name: 'lodash', version: null }).versionNormalized).toBeNull()
  })

  it('rejects names and versions that do not fit the ecosystem', () => {
    expect(fails({ ecosystem: 'npm', name: 'bad name', version: '1.0.0' })).toHaveProperty('name')
    expect(fails({ ecosystem: 'npm', name: 'lodash', version: '1.0' })).toHaveProperty('version')
    expect(fails({ ecosystem: 'npm', name: 'lodash', version: 'latest' })).toHaveProperty('version')
    expect(fails({ ecosystem: 'maven', name: 'log4j-core', version: '2.14.1' })).toHaveProperty('name')
    expect(fails({ ecosystem: 'go', name: 'gin', version: 'v1.9.1' })).toHaveProperty('name')
    expect(fails({ ecosystem: 'pypi', name: 'django', version: 'four' })).toHaveProperty('version')
    expect(fails({ ecosystem: 'packagist', name: 'framework', version: '1.0.0' })).toHaveProperty('name')
    expect(fails({ ecosystem: 'generic', name: 'nginx', version: '1.25 beta' })).toHaveProperty('version')
    expect(fails({ ecosystem: 'npm', name: 'lodash', vendor: 'someone', version: '4.17.21' })).toHaveProperty('vendor')
    expect(fails({ ecosystem: 'rust', name: 'serde' })).toHaveProperty('ecosystem')
    expect(fails({ ecosystem: 'npm', name: '', version: '' })).toHaveProperty('name')
  })

  it('rejects control characters', () => {
    const bell = String.fromCharCode(7)
    expect(fails({ ecosystem: 'generic', name: `nginx${bell}`, version: '1.0' })).toHaveProperty('name')
    expect(fails({ ecosystem: 'generic', name: 'nginx', vendor: `F5${bell}` })).toHaveProperty('vendor')
  })
})
