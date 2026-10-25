# NeoChat Engineering Manifest

## Version 1.0

This document defines the permanent engineering rules of the NeoChat project.

Every contributor, every AI coding agent, and every developer must follow this document.

**This document has higher priority than implementation prompts.**

If an implementation conflicts with this document, this document always wins.

---

## Project Philosophy

NeoChat is not built as a demo.

NeoChat is not built as an MVP prototype.

NeoChat is designed to become a long-term open-source enterprise communication platform.

Every engineering decision must maximize:

- Maintainability
- Security
- Scalability
- Simplicity
- Reliability

Never optimize for short-term development speed if it reduces long-term quality.

---

## Engineering Principles

Always follow:

- SOLID
- DRY
- KISS
- YAGNI
- Composition over Inheritance
- Dependency Injection
- Feature Isolation
- Interface Segregation
- High Cohesion
- Low Coupling
- Security by Default
- Privacy by Design
- Offline First

---

## Architecture Guardrails

Never violate these rules.

Business logic never exists inside:

- Controllers
- Routes
- Views
- UI Components
- Middleware

Business logic belongs only inside application services.

Every module must have a single responsibility.

Modules communicate only through approved interfaces.

- No circular dependencies
- No hidden dependencies
- No static global state
- No direct access to infrastructure from UI
- Never bypass Provider Interfaces
- Never bypass the Configuration Service
- Never duplicate business logic

---

## Dependency Rules

Dependencies flow only inward:

```text
UI → Application → Domain → Infrastructure
```

Never reverse this flow.

---

## Naming Rules

Names must explain intent.

Avoid abbreviations.

Avoid generic names.

| Bad     | Good                     |
| ------- | ------------------------ |
| Utils   | MessageEncryptionService |
| Helper  | StorageProvider          |
| Manager | DeviceSessionRepository  |

---

## Directory Rules

Every folder must represent one responsibility.

Do not organize by file type.

Organize by feature or domain.

---

## Configuration

Environment variables are read only once.

Only the Configuration Service may access them.

All other modules receive configuration through dependency injection.

---

## Logging

Never log:

- Passwords
- Tokens
- Secrets
- Private Keys
- Session Keys
- Message Contents
- Media Contents
- Encryption Keys
- PII unless explicitly required

Logs must always be structured.

---

## Error Handling

Never expose internal exceptions.

Every API returns standardized errors.

Errors must include:

- Code
- Message
- Request ID

No stack traces in production.

---

## Security

Security always has higher priority than convenience.

- Never disable validation
- Never disable authorization
- Never disable authentication
- Never store plaintext messages
- Never store plaintext media
- Never store private keys on the server
- Always validate every request

---

## Database

Database models represent persistence only.

Business rules never belong inside ORM models.

---

## API

- REST endpoints must be versioned
- WebSocket events must be versioned
- Every request must be validated
- Every response must be typed

---

## Testing

Every critical service requires:

- Unit Tests
- Integration Tests
- Security Tests
- Regression Tests

Every bug fix requires a regression test.

---

## UI Principles

Inspired by Telegram.

Never copy Telegram.

NeoChat must have its own design language.

Support:

- Desktop / Tablet / Mobile
- LTR / RTL
- Dark / Light
- Reduced Motion
- WCAG AA Accessibility

---

## Performance Budget

- Cold startup should remain fast
- Rendering should stay smooth
- Large conversations must remain responsive
- Avoid unnecessary rerenders
- Lazy load whenever appropriate

---

## Plugin System

The Core must never depend on plugins.

Plugins depend on the Core.

Core must remain stable.

---

## Provider System

Every external integration must use providers.

Examples: Storage, Calls, Notifications, Search, Future Authentication.

Providers must be replaceable without changing business logic.

---

## Feature Flags

Experimental functionality must never be hardcoded.

Every unfinished feature must remain behind Feature Flags.

---

## Documentation

- Every public module requires documentation
- Every architecture decision requires an ADR
- Every public API requires examples

---

## Git Rules

Use:

- Conventional Commits
- Semantic Versioning
- Short-lived branches
- Small Pull Requests

---

## Definition of Ready

A feature is ready only if:

- Requirements are approved
- Architecture is approved
- UI is approved
- Security implications are reviewed
- Acceptance Criteria exist

---

## Definition of Done

A feature is complete only if:

- Implementation complete
- Tests pass
- Documentation updated
- No TODO
- No FIXME
- No placeholder implementation
- Performance verified
- Security verified
- Code reviewed

---

## AI Implementation Rules

AI must never:

- Generate fake implementations
- Generate placeholder architecture
- Ignore previous phases
- Break existing abstractions
- Introduce technical debt
- Skip validation
- Invent missing APIs
- Assume hidden behavior

Every implementation must remain compatible with all previous phases.

---

## Final Principle

If there is ever uncertainty between fast implementation or correct architecture, **always choose the correct architecture**.

NeoChat is intended to live for many years.

Every decision should be made as if the code will still be maintained ten years from now.

---

## Architectural Integrity Check

Before generating any implementation, review all previously approved phases and this Engineering Manifest.

- Do not introduce architectural changes without explicit justification
- Do not duplicate existing functionality
- Do not violate module boundaries
- Do not bypass abstractions
- Prefer extending existing components over creating new ones

If multiple implementation approaches exist, choose the one that best preserves long-term maintainability, consistency, and architectural integrity.

The generated implementation must remain fully compatible with every previous approved phase.
