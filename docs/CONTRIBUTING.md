# Contributing

Thank you for contributing to NeoChat. This project is AGPL-3.0-or-later.

## Getting started

1. Fork / clone the repository
2. Follow [`INSTALLATION.md`](INSTALLATION.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md)
3. Create a feature branch from `main`

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm run test` passes (where applicable)
- [ ] Docs updated if behavior, env vars, or structure changed
- [ ] Conventional Commit messages
- [ ] No secrets in diff

## Scope guidance (v1.0.0-rc.1)

**In scope:**

- Messaging, E2E crypto, media, calls (LiveKit)
- Admin panel, backup/restore, TLS wizard, maintenance mode
- Plugin SDK (discovery + enable/disable)
- Docker deployment, offline bundles, release docs

**Out of scope (defer to later releases):**

- Re-introducing NestJS messaging modules (`MessagesModule`, `ChatsModule`, etc.)
- LiveKit as a default Compose dependency
- Breaking E2EE or admin isolation guarantees

## Code review

- Keep diffs focused; one concern per PR when possible
- Match existing patterns in the surrounding module
- Explain non-obvious design choices in the PR description

## Reporting issues

Include: NeoChat version, OS, Node version, repro steps, expected vs actual behavior, relevant logs
(redact secrets).

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0-or-later.
