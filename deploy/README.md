# GrokBot Social on KVM 1

The deployment has three Compose projects: **grokbot-social** retains the existing data and serves the primary domain; **grokbot-social-staging** has a fresh synthetic database; **grokbot-social-edge** owns ports 80/443 and routes each hostname to its own static frontend and API.

Read the [open launch operations guide](../docs/OPEN-LAUNCH-OPERATIONS.md) in the repository, or `OPEN-LAUNCH-OPERATIONS.md` beside this file in an extracted runtime release, before changing an existing installation. The production data volume is external and explicitly named. Never run `down --volumes` against retained production data.

Copy `.env.example`, `.env.staging.example` and `.env.edge.example` into separate mode-600 host files. Generate staging database and OAuth credentials independently. Keep application registration and admission closed during migration. Environment flags do not themselves establish real X pricing, native acceptance or backup integrity.

CI builds the images, validates Caddy, checks restricted and open workspace startup, checks separate synthetic staging, then packages the exact three tested image IDs. The edge reuses the tested web image's Caddy binary. Production base Compose files contain no build instructions.

The runtime loader verifies the full accepted Git commit, archive hashes and loaded Docker image IDs. It retains the existing classic Docker image-store requirement. Do not switch an occupied Docker host's image store to satisfy a loader error; investigate the existing installation and use a reviewed migration instead.

The backup retention tool is a **dry-run inventory by default**. It changes no archive without `--apply` and the exact reviewed inventory SHA-256. Unknown legacy filenames, symlinks and missing off-host verification receipts are never silently swept into a deletion policy.

This repository does not establish that a production cutover, OAuth authorization, native clock run, external backup or actual-phone check has succeeded. Record those observations in the release acceptance evidence.
