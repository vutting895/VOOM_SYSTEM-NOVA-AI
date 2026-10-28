# Voom_system Dashboard Notifications

Telegram notifications are not part of the current Voom_system source tree. The project-wide search found no Telegram bot token, chat ID, sendMessage call, or Telegram notification module.

Notification policy:
- Use the web dashboard as the user-facing notification surface; do not add Telegram credentials or send Telegram messages.
- A local Security Dashboard is now available from Dashboard/start_security_dashboard.ps1 at http://127.0.0.1:8765. It shows security knowledge, a not-yet-verified control checklist, and review-required security finding candidates.
- This is not yet embedded in the central trading web app. The actual frontend source was not present in this workspace; only a generated/backup preview HTML was found, so that backup was left untouched.
- Trading signals, risk blocks, errors, and trade lifecycle updates still need an authenticated event API and integration with the actual dashboard frontend.
- Until those event sources are implemented, the security dashboard must not be presented as a live production monitor or as a replacement for trading-event notifications.
