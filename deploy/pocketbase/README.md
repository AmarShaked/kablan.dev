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

Migrations create a **service user** (`agent@kablan.service`) used by the Kablan
server to post agent replies. Credentials are baked into the server defaults;
self-hosters can override with env (below). No per-user PocketBase admin setup.

## Env for Kablan (optional — hosted defaults work out of the box)

The Kablan server defaults to:

```
POCKETBASE_URL=https://kablan-pocketbase.fly.dev
POCKETBASE_SERVICE_EMAIL=agent@kablan.service
POCKETBASE_SERVICE_PASSWORD=<same as migration 1730000002>
```

Override only when self-hosting PocketBase:

```bash
POCKETBASE_URL=https://your-pb.example
POCKETBASE_SERVICE_EMAIL=agent@kablan.service
POCKETBASE_SERVICE_PASSWORD=...
```

Frontend (Vite):

```bash
VITE_POCKETBASE_URL=https://kablan-pocketbase.fly.dev
```

Production / npx builds default to `https://kablan-pocketbase.fly.dev` when the
env var is omitted. Local `pnpm run dev` reads `frontend/.env.development`
(same URL). Override if you run PocketBase yourself.

## Schema

Migrations in `pb_migrations/` create:

- `chats` — `self`, `dm`, or `group`; DMs use `dm_key` (`userA_userB`) so the same pair always reopens one thread
- `chat_members` — membership; owners can add the other person when starting a DM
- `messages` — user or agent authors, optional `task_id` / `task_project_id`
- Service user may list messages and create/update/delete rows with `author_agent` set
- Authenticated users may list other users (email lookup for starting a DM)
- `users.last_seen` — client heartbeat for online status in the Chats sidebar

Phase 2: Chats **+** opens an email dialog. If that address already has a Chats
account, a 1:1 DM is created or reopened. There is no email invite — they must
sign up first. Lookup uses a PocketBase hook (`/api/kablan/lookup-user`) so the
Kablan app never needs admin credentials for invites.
