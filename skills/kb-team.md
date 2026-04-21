---
name: kb-team
description: Configure and manage team knowledge base sharing via Git or S3 — sync, merge, and collaborate
---

Set up and manage team collaboration for the OMYKB knowledge base.

## Usage

`/kb:team` — show team status
`/kb:team --setup` — configure team sharing interactively
`/kb:team --push` — push local changes to shared storage
`/kb:team --pull` — pull remote changes from shared storage
`/kb:team --invite <name>` — generate an invite config snippet for a teammate

## Team Backends

### Git-based (recommended for small teams)
- The knowledge storage directory is a git repo.
- Team members clone the repo and push/pull changes.
- Works with GitHub, GitLab, Gitea, or any git host.
- Conflict resolution: last-write-wins on document level.

### S3-based (recommended for large teams / enterprises)
- Documents stored in a shared S3 bucket.
- Each team member reads/writes to the same bucket.
- Uses file modification timestamps for sync decisions.
- Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2.

## Steps

### Setup (`--setup`)

1. Ask team backend: `git` or `s3`.

2. **Git setup**:
   - Ask for remote repo URL.
   - Check if `config.storage.path` is already a git repo.
   - If not: `git init <storage.path>`, `git remote add origin <url>`.
   - If yes: `git remote set-url origin <url>`.
   - Update `config.json`: `storage.type = "git"`, `storage.repo = <url>`.
   - Show team members how to clone: 
     ```bash
     git clone <url> knowledge/
     # Then copy your .omykb/config.json to their project
     ```

3. **S3 setup**:
   - Ask: bucket name, region, prefix (e.g. `team-kb/`).
   - Ask: AWS credentials (env var names, not values).
   - Update `config.json` with S3 settings.
   - Verify access: `aws s3 ls s3://<bucket>/<prefix>` via Bash.

4. Ask: team name (shown in status), sync interval.
5. Enable team mode in config: `team.enabled = true`.

### Push (`--push`)

For **git backend**:
1. `cd <storage.path> && git add -A && git commit -m "KB update: $(date)"` 
2. `git push origin <branch>`
3. Show: `OMYKB> Pushed <n> changes to <remote>`

For **s3 backend**:
1. Get list of locally modified files (compare mtimes vs last push timestamp).
2. `aws s3 sync <storage.path> s3://<bucket>/<prefix> --exclude "*.tmp"` via Bash.
3. Show: `OMYKB> Synced <n> files to s3://<bucket>/<prefix>`

### Pull (`--pull`)

For **git backend**:
1. `cd <storage.path> && git pull origin <branch>` via Bash.
2. Show new/changed files.
3. Update `.omykb/index.json` to reflect pulled documents.

For **s3 backend**:
1. `aws s3 sync s3://<bucket>/<prefix> <storage.path>` via Bash.
2. Detect new/changed files, update index.

### Invite (`--invite <name>`)

Generate a shareable config snippet for a new teammate:
```
OMYKB> Invite config for <name>

Share this config with your teammate:

{
  "storage": {
    "type": "git",
    "repo": "<repo-url>",
    "branch": "main",
    "path": "./knowledge"
  },
  "ai": {
    "provider": "<provider>",
    "chat_model": "<model>"
  },
  "team": {
    "enabled": true,
    "member": "<name>"
  }
}

They should:
1. Run: /kb:init (paste this config when prompted)
2. Clone: git clone <repo-url> knowledge/
3. Run: /kb:pull
```
