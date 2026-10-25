---
name: prod-sql-cloud
description: Read buoy.fish production databases from a CLOUD Claude session (claude.ai/code, `claude --cloud`, scheduled tasks), as the read-only claude_ro, through sql-api. Use when a question needs real prod rows and there is no ssh (no buoy plugin, no OpenBao). On a laptop, use buoy:prod-sql instead.
---

# prod-sql-cloud

```sh
.claude/skills/prod-sql-cloud/prod-sql-cloud <target> <<'SQL'
select count(*) from devices
SQL
```

Same targets, output and exit status as `buoy:prod-sql` (its SKILL.md in
buoy-fish/skills has the per-engine notes):

| target | what |
|---|---|
| `app` | app.buoy.fish (Supabase), schema `public` |
| `chirpstack` | ChirpStack + Helium console tables |
| `mappers` | map.buoy.fish |
| `analyzer` | the LoRaWAN analyzer (TimescaleDB) |
| `cal`, `chat`, `docuseal`, `immich`, `papermark` | the OSS services' Postgres |
| `bigcapital`, `bookstack` | MariaDB: qualify tables as `db.table`; BigCapital names are UPPER CASE |
| `clickhouse`, `trigger-clickhouse` | Papermark analytics, trigger.dev runs |
| `librechat` | Mongo: the query is ONE EJSON command, e.g. `{"find": "messages", "limit": 5}` |

- Read-only by privilege: writes fail with "permission denied"; secret
  columns are withheld. A write is a human's call, never a workaround.
- 50s deadline per call (`stopped at the 50s deadline`: narrow the query);
  results over 10 MB are refused (add a LIMIT); at most 4 queries at once.
- "Access refused (401/403)": this cloud environment lacks the `sql-api`
  network secret. Say so; don't retry.

The script is a copy of buoy-fish/skills `skills/prod-sql/gateway/prod-sql-cloud/`;
change it there.
