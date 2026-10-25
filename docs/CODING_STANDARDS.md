# Coding standards

## TypeScript

- **Strict mode** enabled via `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- Prefer `type` imports for types-only: `import type { Foo } from "..."`
- Use Zod schemas in `@neochat/shared` and `@neochat/config`; infer types with `z.infer`
- Avoid `any`; use `unknown` + narrowing when needed

## Monorepo imports

- Use workspace package names: `@neochat/shared`, `@neochat/config` — **not** `@neochat/shared-types` or `@neochat/config-schema`
- Do not import across apps directly; share via packages
- Path aliases in `tsconfig.base.json` are for editor/tsc; runtime resolves via npm workspaces

## API (NestJS)

- Global prefix: `api/v1`
- Validate request bodies with Zod pipes using schemas from `@neochat/shared`
- Feature modules must **not** read `process.env`; inject configuration from the Configuration Service
- Use structured logging (Pino via nestjs-pino)
- Mark public routes explicitly (`@Public()`)

## Frontend (React)

- Functional components + hooks
- TanStack Query for server state; Zustand for local UI state
- i18n via `@neochat/i18n`; support RTL locales (FA, AR)
- Shared UI from `@neochat/ui`; Tailwind 4 with design tokens

## Formatting & linting

```bash
npm run lint      # ESLint (typescript-eslint flat config)
npm run format    # Prettier
```

- 2-space indent, LF line endings, semicolons (see `.editorconfig`, `.prettierrc`)
- ESLint runs on pre-commit via lint-staged

## Git commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint:

```
<type>(<scope>): <description>

feat(api): add retention policy endpoint
fix(web): correct setup redirect
docs(root): update installation guide
```

Allowed scopes: `api`, `web`, `admin`, `shared`, `config`, `crypto`, `i18n`, `ui`, `providers`, `plugins`, `sdk`, `deploy`, `docs`, `deps`, `ci`, `root`

## Testing

- `@neochat/crypto` has Node test runner unit tests
- Add tests when behavior is non-trivial; avoid testing framework boilerplate
- Run `npm run test` before opening a PR

## Security

- Never commit secrets; use `.env` (gitignored) from `.env.example`
- Sanitize admin audit metadata; admin must not access message plaintext
- Use parameterized queries (Drizzle); no raw string SQL with user input
