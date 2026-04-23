# API Documentation

The complete contract for Budojo's `/api/v1` surface lives in [`v1.yaml`](./v1.yaml), written against **OpenAPI 3.0.3**.

## Viewing the spec

### Swagger UI — interactive browser

```bash
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/spec/v1.yaml \
  -v "$(pwd)/docs/api:/spec" \
  swaggerapi/swagger-ui
```

Then open <http://localhost:8080>.

### Redocly — nicer static rendering

```bash
npx -y @redocly/cli preview-docs docs/api/v1.yaml
```

### Import into Postman / Insomnia

Both accept OpenAPI 3.0 files directly — `File → Import → docs/api/v1.yaml`.
A Postman collection with pre-configured auth helpers also exists at `postman/budojo.postman_collection.json` in the repo root; prefer that for day-to-day API work.

## Linting

Spectral runs in CI on every PR via the `🔬 OpenAPI Lint (Spectral)` job (see `.github/workflows/pr-checks.yml`). To run the same check locally:

```bash
npx -y @stoplight/spectral-cli lint docs/api/v1.yaml
```

Spectral catches:

- Malformed YAML
- `$ref` pointers to missing components
- Missing `operationId`, `summary`, or `description`
- Missing `security` on non-public endpoints

If the lint fails, fix the spec — don't disable the rule unless there's a specific justification, and document it in the commit if so.

## Update discipline

Any PR that changes a route, a request or response shape, a query parameter, a status code, or introduces a new endpoint must update `v1.yaml` in the same PR. Rule enforced by `CLAUDE.md` §"Documentation discipline" and by the CI Spectral job.

## OpenAPI version choice

We picked **3.0.3** over 3.1 for wider tooling support — Swagger UI, Redocly, Postman, Insomnia, and Stoplight Studio all consume 3.0 natively, whereas 3.1's JSON-Schema-aligned semantics are still hit-or-miss in older tools. The spec is intentionally conservative (no `oneOf` where `enum` suffices, no `webhooks`, no `const`) so that switching to 3.1 later is mechanical.

## Structure

Single-file monolite while the surface is small (~10 endpoints). Split into `paths/` + `components/schemas/` directories once the file crosses ~1500 lines.
