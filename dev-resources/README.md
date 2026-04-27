# Dev Resources

Project context, plans, decisions, and runbooks. The `src/` tree is the *what*; this directory is the *why* and the *next*.

## Layout

| Dir | Contents | Lifecycle |
| - | - | - |
| [architecture/](architecture/) | Source-of-truth design docs. The architecture is one document, deliberately stable. | Edited rarely; deviations require an ADR. |
| [research/](research/) | Background — feasibility studies, prior-art surveys, vendor comparisons. | Append-only; not load-bearing for implementation. |
| [plans/](plans/) | Phase-scoped implementation plans. One plan = one PR-sized chunk of work. | Written before a phase, archived after it ships. |
| [decisions/](decisions/) | Architecture Decision Records. Short, dated, immutable once accepted. | Numbered `NNNN-kebab-case-title.md`. Supersede via a new ADR, never edit accepted ones. |
| [runbooks/](runbooks/) | Operational how-tos: deploy, rotate secrets, run cron locally. | Stable across phases; updated when the underlying procedure changes. |

## When to write what

- **New work that touches multiple files** → write a plan first under `plans/NN-...md` using `plans/_template.md`.
- **Choice between viable alternatives that locks something in** → write an ADR using `decisions/_template.md`. ADRs are for decisions a future maintainer would reasonably question ("why Drizzle and not Knex?", "why Neon and not Supabase?").
- **Repeatable operational procedure** → write a runbook. If you'd write the same instructions twice, it belongs in a runbook.
- **Background reading or vendor research** → drop in `research/` and link from the relevant ADR or plan.
- **Source-of-truth design changes** → edit `architecture/` *and* write an ADR explaining the deviation.

## Index

### Architecture

- [community-asset-mapper-architecture.md](architecture/community-asset-mapper-architecture.md) — system design (database, OSM integration, SvelteKit structure, Kobo bridge, deployment).

### Research

- [osm-feasibility-study.md](research/osm-feasibility-study.md) — comparison of OSM-adjacent platforms; rationale for the hybrid OSM + private store pattern.

### Plans

*Populated as phases are scoped.*

### Decisions

- [0001-neon-over-supabase.md](decisions/0001-neon-over-supabase.md) — why Neon Postgres + PostGIS instead of Supabase.

### Runbooks

*Populated as operational procedures emerge.*
