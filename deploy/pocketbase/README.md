# Kablan PocketBase (chats)

Separate Fly.io app that holds optional user accounts and chat data for Kablan.

## Deploy

```bash
cd deploy/pocketbase
fly apps create kablan-pocketbase   # once
fly volumes create pb_data --region ams --size 1
fly secrets set PB_ENCRYPTION_KEY="$(openssl rand -base64 32)"
fly deploy
```

Open the admin UI at `https://<app>.fly.dev/_/` and create the first superuser
(or use `fly ssh console` + `./pocketbase superuser upsert EMAIL PASS`).

Create a **service** PocketBase user (email/password) used only by the Kablan
server to post agent messages. Give it access by signing it into chats via
admin if needed, or rely on admin API auth from the server.

## Env for Kablan

Local / host running the Kablan server:

```bash
POCKETBASE_URL=https://kablan-pocketbase.fly.dev
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=...
```

Frontend (Vite):

```bash
VITE_POCKETBASE_URL=https://kablan-pocketbase.fly.dev
```

Production / npx builds default to `https://kablan-pocketbase.fly.dev` when the
env var is omitted. Local `pnpm run dev` reads `frontend/.env.development`
(same URL). Override if you run PocketBase yourself.

Without a URL in local/test, Chats stays in the sidebar but asks you to
configure PocketBase; the rest of Kablan works as before.

## Schema

Migrations in `pb_migrations/` create:

- `chats` — `self`, `dm`, or `group`; DMs use `dm_key` (`userA_userB`) so the same pair always reopens one thread
- `chat_members` — membership; owners can add the other person when starting a DM
- `messages` — user or agent authors, optional `task_id` / `task_project_id`
- Authenticated users may list other users (email lookup for starting a DM)

Phase 2: Chats **+** opens an email dialog. If that address already has a Chats
account, a 1:1 DM is created or reopened. There is no email invite — they must
sign up first. Lookup uses a PocketBase hook (`/api/kablan/lookup-user`) so the
Kablan app never needs admin credentials for invites.
