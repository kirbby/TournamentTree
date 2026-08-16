# Configuration

## Browser build

Copy `.env.example` to `.env.local` and set:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes for cloud mode | Project URL, such as `https://abc.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes for cloud mode | Publishable/anon key safe for a public browser bundle. |

Vite embeds these values at build time. Never use a secret/service-role key in any `VITE_` variable.

## Supabase

The Edge Function receives `SUPABASE_URL` and Supabase service credentials from its managed runtime. Do not add them to repository files. Public signup is disabled in `supabase/config.toml`; production Auth settings must also be checked in the dashboard.

Exactly one Auth user must be inserted into `public.app_admins`. Create or invite that user through a secure administrator workflow, then run:

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'organizer@example.com';
```

The database unique index refuses a second administrator row.

## AI access

Create tokens in the administrator dashboard. A token is displayed once and has the form `tt_live_...`. Store it in the AI tool's secret manager and send it as:

```http
Authorization: Bearer tt_live_...
```

Tokens can read and manage tournaments but cannot create tokens, force venue snapshots, or permanently delete data.

## Static FTP deployment

`scripts/deploy-static.sh` reads these environment variables:

| Variable | Purpose |
| --- | --- |
| `FTP_URL` | Full server URL, preferably `ftps://...` or `sftp://...`. |
| `FTP_USER` | Hosting account username. |
| `FTP_PASSWORD` | Hosting account password. |
| `FTP_PATH` | Remote directory that should mirror `dist/`. |

The script uses `mirror --reverse --delete`; verify `FTP_PATH` carefully because files present remotely but absent from `dist/` are removed.

## Supabase deployment

`scripts/deploy-supabase.sh` requires `SUPABASE_PROJECT_REF`. Supabase CLI authentication must already be available. Database passwords and personal access tokens belong in local environment/CLI storage, never the repository.
