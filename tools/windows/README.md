# Windows Runtime: Git-Managed MT5 Bridge

## Operating model

- **Development source of truth:** \`vutting895/VOOM_SYSTEM-NOVA-AI\` on GitHub, with changes reviewed and committed through Git.
- **Windows is a runtime host only:** keep the MT5 desktop terminal, a small bootstrap launcher, the Bridge runtime checkout, its isolated Python environment, and private tenant configuration.
- **Do not edit application source in \`C:\Program Files\voom_system\` or \`C:\Program Files\nova\`.** Edit in a Git branch and merge through the repository workflow instead.
- The launcher retrieves the Bridge from \`main\` each time it starts. It uses a shallow sparse checkout of only \`integrations/mt5-readonly-bridge\` under \`%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo\`.
- The launcher refuses to overwrite a dirty runtime checkout, refuses unexpected Git remotes, and does not put secrets in Git, command-line arguments, or logs.

## What must remain on Windows

1. The MT5 terminal logged in to the intended account. Cloudflare cannot run the Windows MT5 terminal.
2. Git for Windows and Python 3.11 (64-bit).
3. One bootstrap copy at \`%LOCALAPPDATA%\VOOM_SYSTEM\run-bridge-from-git.ps1\`.
4. Tenant secrets under \`%LOCALAPPDATA%\VOOM_SYSTEM\secrets\\\`: \`mt5-tenant-id.txt\` and \`mt5-bridge-<tenant-id>.token\`. These are private local files and must never be committed.
5. The generated runtime checkout and \`.venv\`, which the launcher refreshes from Git and reuses. They are runtime files, not the development workspace.

## One-time setup

1. Ensure Git Credential Manager can read the private repository. Authenticate using the normal Git Credential Manager sign-in flow; do not put a personal access token into this script, a URL, or chat.
2. Install Python 3.11 (64-bit) and ensure \`py -3.11\` works.
3. Copy \`run-bridge-from-git.ps1\` from this directory to \`%LOCALAPPDATA%\VOOM_SYSTEM\run-bridge-from-git.ps1\`. This one small copy is the bootstrap needed to retrieve the rest of the source from a private repository.
4. Confirm the private tenant files exist. Do not create placeholder tokens to bypass the safety checks.
5. Run the bootstrap from the same Windows user session as MT5:

\`\`\`powershell
& "$env:LOCALAPPDATA\VOOM_SYSTEM\run-bridge-from-git.ps1"
\`\`\`

The first run clones the repository and installs Bridge dependencies if needed. Later runs update to the latest \`main\` commit and reinstall dependencies only when \`requirements.txt\` changes. It reports the commit used before starting \`run-bridge.ps1\`.

## Cleanup rules

The legacy checkout found during the initial audit had local modifications and untracked directories. **Do not delete the whole legacy directory yet.** First compare those local-only items against GitHub and preserve or upload anything not already committed. Build caches and dependency folders may be removed only after the new launcher can refresh the Bridge and the Bridge starts correctly.

Do not remove the MT5 terminal, the \`%LOCALAPPDATA%\VOOM_SYSTEM\secrets\` folder, or the one-file bootstrap. Do not place \`.env\`, account credentials, tenant tokens, or terminal passwords in Git.

## Safety boundary

The Bridge remains GET-only, tenant-guarded, and read-only. This launcher does not submit orders and does not enable live trading. A successful process start is not proof the account is connected: verify the protected Bridge health request and the authenticated route end to end before reporting a connection as ready.
