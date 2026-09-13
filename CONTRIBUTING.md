# Contributing

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope]: <description>
```

Examples:

```text
feat(gateway): add streaming chat completions
fix(auth): reject revoked gateway keys
docs(providers): record HKBU authentication behavior
test(protocol): cover OpenAI error responses
```

Allowed common types are `feat`, `fix`, `docs`, `test`, `refactor`, `build`,
`ci`, `chore`, and `perf`.

## Versions

The canonical application version is stored in `VERSION`. Releases use
Semantic Versioning (`MAJOR.MINOR.PATCH`) and must also update
`CHANGELOG.md`.

## Provider changes

Do not infer an upstream request or authentication field from a rendered
Swagger page alone. Record the source document, confidence, and a redacted
request/response example in `docs/providers.md` after validating it against
the upstream service.
