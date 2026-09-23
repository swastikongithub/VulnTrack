# The matching engine

`server/src/services/matching/`. Pure, deterministic and independently testable: the engine is a
function of (component, advisory) with no database, clock or network in it. The runner is the only
part that touches storage.

## 1. Identity before versions

A version comparison is meaningless unless both sides mean the same package. Two routes:

| Route | Used for | Key |
|---|---|---|
| `package` | registry ecosystems (npm, PyPI, Maven, NuGet, Go, crates.io, RubyGems, Packagist) | `componentKey` — the canonical `ecosystem:normalized-name` **both sides already store** |
| `cpe` | `generic` software (nginx, PostgreSQL, an operating system) | NVD CPE vendor + product |

The canonical key is what makes naming differences a solved problem rather than a matching problem:
the inventory's `Express`, `Django_REST.framework` and `Serde_JSON` were normalized to
`npm:express`, `pypi:django-rest-framework` and `cargo:serde-json` when they were recorded
(Phase 5), and OSV's affected packages were normalized with **the same function** when they were
ingested (Phase 6). Matching is then an indexed equality join, not a fuzzy name comparison.

For the CPE route, product names are compared in both their plain and underscore forms
(`windows server` ≡ `windows_server`). A vendor on our side must also match; without one, the match
is possible but weaker, and its confidence says so.

## 2. Version comparison

`versionCompare.js` implements one comparator per scheme named in `config/software.js`:

| Scheme | Rules |
|---|---|
| `semver` (npm, crates.io) | SemVer precedence, prerelease identifiers compared piecewise, build metadata ignored |
| `go` | SemVer with the `v` prefix, including pseudo-versions |
| `pep440` (PyPI) | epoch, release, pre/post/dev segments, local versions |
| `maven` | Maven's ComparableVersion: nested lists, qualifier order `alpha < beta < milestone < rc < snapshot < release < sp` |
| `nuget` | four-part versions, case-insensitive prereleases |
| `composer` | release parts then stability (`dev < alpha < beta < RC < stable < patch`) |
| `rubygems` | Gem::Version segments; a letter segment is a prerelease |
| `generic` | **no order** — equality only |

Two rules make this safe:

- **Never compare as strings.** `1.9.0 < 1.10.0` is true for versions and false for strings; the
  tests assert both, so the distinction can't quietly regress.
- **Never guess.** A value that doesn't parse under its scheme returns `null`, which becomes an
  `undetermined` match, not a "not affected".

## 3. Range evaluation

`rangeEvaluator.js` reads OSV ranges as published:

| Event | Meaning |
|---|---|
| `introduced` | opens an interval; the literal `0` means "since the first release" |
| `fixed` | closes it, **exclusive** — affected while `version < fixed` |
| `lastAffected` | closes it, **inclusive** |
| `limit` | closes it, exclusive |

- A range's comparator follows its type: `SEMVER` ranges are ordered by SemVer whatever the
  ecosystem; `ECOSYSTEM` ranges use the ecosystem's own scheme.
- **`GIT` ranges are never evaluated**: they describe commits, not versions.
- An explicit `versions[]` list is checked by scheme-aware equality (so `4.2.1` matches `4.2.1.0`
  under PEP 440).
- Several intervals in one range are evaluated independently; the first that contains the version
  wins.
- **A fully evaluated version range settles the question**, even when a `GIT` range sits beside it —
  which is the normal shape of an OSV record. Only when nothing could be evaluated does the
  unevaluated range make the result `undetermined`.

## 4. Outcomes

| Status | When | Stored |
|---|---|---|
| `affected` | the installed version is inside a published range, or in the explicit version list | yes |
| `not_affected` | every applicable range was evaluated and excluded it | **no** |
| `unknown_version` | the package matches but the component has no recorded version | yes |
| `undetermined` | a version wouldn't parse, the scheme has no order, or only `GIT` data exists | yes |

`not_affected` is the overwhelming majority of pairs and carries no information a person can act
on, so it is derived rather than stored (an explicit decision in the phase plan).

**Confidence** qualifies the conclusion, and never borrows severity's meaning:

| Confidence | Meaning |
|---|---|
| `high` | canonical package identity **and** an ordered version comparison |
| `medium` | identity is solid but the version couldn't be compared (unknown version), or a vendor+product CPE equality match |
| `low` | product-name-only identity, or version data with no defined order |

**Reason** is structured, not prose: `{ rule, rangeType, scheme, introduced, end, endKind }`,
`{ rule: 'explicit_version', version }`, `{ rule: 'cpe_version', cpe }`… The API also returns a
rendered sentence, and the UI shows the rule, the scheme and the bounds so a person can check the
engine's work rather than trust it.

## 5. Runs

`matchRunner.js` recomputes **one organization at a time, in full**:

1. take the lock (one `running` run per organization; a stale run is failed first);
2. stream components in batches of 500;
3. per batch, fetch candidate advisories by `componentKey` (and by CPE product for `generic`
   components), considering **active** advisories only — withdrawn and rejected ones are not claims
   about anything;
4. evaluate each (component, advisory) pair with the pure engine;
5. upsert each match (unchanged rows only move `lastEvaluatedAt`), preserving `firstDetectedAt`;
6. prune every row this run did not re-confirm;
7. record counts and audit the run.

Recomputing everything keeps the result a pure function of the current inventory and catalogue:
there is no incremental state to drift, and a re-run always converges. Runs are therefore safe to
repeat, and a failed run leaves the previous matches in place.

**Triggers:** `POST …/matches/recalculate` from the UI (needs `findings:create`, rate-limited to 12
per hour per organization), or the operator CLI:

```bash
npm run matches:recompute -- --organization <id>
npm run matches:recompute -- --all
```

There is no scheduler in this phase (queues belong to the background-jobs phase); a host cron can
call the CLI after an ingestion sync.

## 6. What this phase deliberately does not decide

- **Risk.** Severity is copied from the advisory for sorting; nothing combines it with asset
  criticality, environment or exposure. The master plan keeps the risk model open (§32, §57).
- **Findings.** A match has no owner, status transition, due date or closure.
- **CPE configuration trees.** NVD's AND/platform conditions were flattened at ingestion, so the CPE
  route is product-level and reports low confidence.
- **Ordering for `generic` software.** Version *ranges* for it are reported as `undetermined`
  rather than compared under a scheme that doesn't exist.
