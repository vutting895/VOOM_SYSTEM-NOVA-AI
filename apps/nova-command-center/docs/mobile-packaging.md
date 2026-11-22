# Mobile (Android / iOS)

**Status: no native apps are shipped.** NOVA AI is a responsive web app with a web manifest, so it can be added to the home screen (Android Chrome: "Install app"; iOS Safari: Share → Add to Home Screen). No offline service worker is included.

Path to store apps (not done):
1. Wrap the built site with Capacitor (`@capacitor/core`, `cap add android`, `cap add ios`) or a Trusted Web Activity (Android, via Bubblewrap).
2. Use secure storage for the session on native, keep PKCE, register deep-link redirect URLs in Supabase.
3. Build/sign with Android Studio / Xcode; store review is required. Trading-related apps face extra review.