# Intelligence fixtures

Real advisory payloads, trimmed (fewer references and configurations) so the
adapter tests run against the providers' actual formats without network access.

| File | Source | Content |
|---|---|---|
| `nvd-cve-2021-44228.json` | NVD CVE API 2.0 | Log4Shell: CVSS v3.1 + v2, CWEs, CPE configurations, CISA KEV fields |
| `nvd-page.json` | NVD CVE API 2.0 | CVE-2021-23337 (lodash, "Modified") and CVE-2021-45046 |
| `osv-GHSA-35jh-r3h4-6jhm.json` | OSV API | GitHub advisory aliasing two CVEs; SEMVER ranges with `last_affected` |
| `osv-query-lodash.json` | OSV API `/v1/query` | Three lodash advisories, one with no CVSS vector (label-only severity) |
| `osv-PYSEC-2021-19.json` | OSV API | PyPI advisory with GIT and ECOSYSTEM ranges and an explicit version list |

Licensing: NVD data is a work of the U.S. Government (public domain). OSV
records from the GitHub Advisory Database and the PyPA advisory database are
CC-BY 4.0; they are included unmodified apart from trimming, for testing only.
