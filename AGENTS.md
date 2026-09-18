# Repository rules

- GitHub `main` is the source of truth.
- Keep the project host-independent.
- Supabase is the database/auth/storage backend.
- Telegram Bot API is accessed directly; do not introduce hosted connector gateways.
- Never commit secrets, bot tokens, service-role keys, wallet private keys, or local `.env` files.
- Run typecheck, tests, build, and release preflight before production deployment.
- Preserve existing user data and Telegram channel/bot configuration during migrations.
