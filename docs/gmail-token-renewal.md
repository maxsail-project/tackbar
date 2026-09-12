# TackBar — Gmail OAuth token renewal

Operational procedure for renewing the Gmail OAuth token used by TackBar production ingestion.

> **Scope:** renew an expired or revoked Gmail OAuth token without changing application code, persistent TackBar data, systemd, Caddy, or the production deployment.
>
> **Security:** `token.json` contains OAuth credentials. Never commit it, paste its contents into chat/issues, or store it in the repository.

## When to use this procedure

Use this procedure when **Admin → Ingestions → Review mailbox now** fails and Gmail authentication reports an error such as:

```text
google.auth.exceptions.RefreshError:
invalid_grant: Token has been expired or revoked.
```

Before renewing the token, confirm that the rest of Admin is working. If normal Admin refresh succeeds but mailbox review returns HTTP 503, Gmail authentication is a likely cause.

## Production token layout

TackBar production reads:

```text
/opt/tackbar/backend/token.json
```

which is a symbolic link to:

```text
/etc/tackbar/gmail-token.json
```

Expected production ownership and permissions:

```text
-rw------- tackbar tackbar /etc/tackbar/gmail-token.json
```

Do not replace or remove the symlink during a normal token renewal.

## 1. Work from the local backend

On the Windows development PC, open Git Bash:

```bash
cd /c/maxsail-project/tackbar/backend
```

Confirm the OAuth client credentials exist:

```bash
ls -l secrets/credentials.json
```

Do not display or share the contents of this file.

## 2. Preserve the revoked local token

If `token.json` exists, keep a temporary local copy and remove the active file:

```bash
cp token.json token.json.revoked
rm token.json
```

This is necessary because `GmailAdapter` first tries to refresh an existing token. A revoked token can fail before the interactive OAuth flow starts.

## 3. Generate a new token interactively

Run:

```bash
python -c "from app.email_providers.gmail import GmailAdapter; GmailAdapter(allow_interactive=True).authenticate(); print('GMAIL AUTH OK')"
```

A Google authorization page should open in the browser.

Authorize the Gmail account used by TackBar.

Expected terminal result:

```text
GMAIL AUTH OK
```

A new local file should now exist:

```bash
ls -l token.json
```

## 4. Validate the new token locally

Run a second authentication without interactive mode:

```bash
python -c "from app.email_providers.gmail import GmailAdapter; GmailAdapter().authenticate(); print('GMAIL TOKEN OK')"
```

Expected:

```text
GMAIL TOKEN OK
```

Do not continue if this check fails.

Optionally record the local checksum:

```bash
sha256sum token.json
```

The checksum is safe to compare; do not expose the token contents.

## 5. Copy the token to the VPS staging location

Use the TackBar production SSH key:

```bash
scp -i ~/.ssh/tackbar_prod_ed25519 token.json \
  ubuntu@51.75.250.157:/home/ubuntu/gmail-token.json
```

A successful transfer ends with output similar to:

```text
token.json    100% ...
```

## 6. Connect to the VPS

```bash
ssh -i ~/.ssh/tackbar_prod_ed25519 ubuntu@51.75.250.157
```

Confirm the staged file exists:

```bash
ls -l /home/ubuntu/gmail-token.json
sha256sum /home/ubuntu/gmail-token.json
```

If a checksum was recorded locally, confirm both checksums match before replacing production.

## 7. Install the token in production

On the VPS:

```bash
sudo cp /home/ubuntu/gmail-token.json /etc/tackbar/gmail-token.json
sudo chown tackbar:tackbar /etc/tackbar/gmail-token.json
sudo chmod 600 /etc/tackbar/gmail-token.json
```

Verify:

```bash
sudo ls -l /etc/tackbar/gmail-token.json
sudo sha256sum /etc/tackbar/gmail-token.json
```

The checksum must match the validated local token.

The existing symlink should remain:

```text
/opt/tackbar/backend/token.json -> /etc/tackbar/gmail-token.json
```

## 8. Validate Gmail as the production service user

Run:

```bash
cd /opt/tackbar/backend

sudo -u tackbar /opt/tackbar/.venv/bin/python -c \
'from app.email_providers.gmail import GmailAdapter; GmailAdapter().authenticate(); print("GMAIL AUTH OK")'
```

Expected:

```text
GMAIL AUTH OK
```

A service restart is not normally required because the next mailbox review reads the token from disk.

## 9. Functional production validation

Open:

```text
https://app.tackbar.eu/admin
```

Then:

```text
Ingestions → Review mailbox now
```

Confirm that the mailbox review completes and that new valid emails are processed or otherwise reported normally.

## Troubleshooting

### `Permission denied (publickey)` during `scp`

Use the production SSH key explicitly:

```bash
scp -i ~/.ssh/tackbar_prod_ed25519 token.json \
  ubuntu@51.75.250.157:/home/ubuntu/gmail-token.json
```

Validate SSH separately if needed:

```bash
ssh -i ~/.ssh/tackbar_prod_ed25519 ubuntu@51.75.250.157
```

### Production still reports `invalid_grant`

Compare the local and production checksums:

Local:

```bash
sha256sum token.json
```

Production:

```bash
sudo sha256sum /etc/tackbar/gmail-token.json
```

If they differ, the new token was not installed in production.

If they match and authentication still fails, generate a fresh token again from the interactive flow.

### `ls /etc/tackbar/gmail-token.json` gives permission denied

That can be normal for the `ubuntu` user because the token is intentionally restricted.

Use:

```bash
sudo ls -l /etc/tackbar/gmail-token.json
```

To test the permissions from TackBar's runtime account:

```bash
sudo -u tackbar test -r /etc/tackbar/gmail-token.json && echo "TOKEN READ OK" || echo "TOKEN READ FAIL"
sudo -u tackbar test -w /etc/tackbar/gmail-token.json && echo "TOKEN WRITE OK" || echo "TOKEN WRITE FAIL"
```

## Security notes

- Never commit `token.json`, `credentials.json`, or `/etc/tackbar/gmail-token.json`.
- Never paste OAuth token contents into logs, issues, chat, or documentation.
- Keep `/etc/tackbar/gmail-token.json` owned by `tackbar:tackbar` with mode `600`.
- Treat the local `token.json.revoked` copy as sensitive and delete it when no longer needed.
- Do not modify the production symlink unless the deployment layout itself changes.

## Follow-up

The current OAuth setup should be reviewed so that routine pilot operation does not depend on frequent manual token renewal. Any change to OAuth publication/verification status should be treated as a separate operational decision and validated independently.
