# Mobile workout UI and missing illustrations

Fixes reported from Android screenshots on October 3, 2026:

- Expanded recommendation details stack below a full-width target. The exercise header fills the card; nested recommendation text is no longer styled as the exercise title.
- Logging controls share bounded grid tracks. Bodyweight is identified by the target panel instead of repeating a clipped load field in every row.
- Bodyweight holds use seconds in targets, labels and accessible input names. Their RIR control is hidden. Existing journal field names and saved entries are preserved. Completing a hold no longer displays `null lb`.
- Native layouts use Capacitor 8 SystemBars CSS inset variables with CSS environment fallbacks. Sticky navigation sits below the status area; fixed navigation, modal padding, scrolling and bottom content spacing account for native insets. SystemBars uses light icons on the dark app background.
- Missing exact illustrations render a visible placeholder with an exercise-specific YouTube search link and available written cues. The link is explicitly a search, not a reviewed video. Broken image downloads get the same fallback, including the motion-demo renderer. Each missing superset movement gets its own fallback.

Automatic image generation is not included. A future supported implementation would use a server-side paid image API, a canonical exercise identity and shared reusable assets, with form review before publishing a generated illustration. ChatGPT free-session usage is not an API allowance.

Validation: 533 Node tests pass. Targeted checks cover saved hold durations through refresh, bodyweight recommendations, real fallback link queries, mixed supersets, and image errors in both renderers. Web build and Capacitor Android sync pass; changed JavaScript passes syntax checks. A packaging assertion now checks script ordering independently of the media script's cache version.

Local rendered verification was blocked: cloud Browser rejects localhost, Sites preview cannot mount proc, and local browser installation failed. Verify the deployed preview before merge if available. These automated checks do not establish physical Android installation, actual WebView insets, or authenticated cross-device syncing; #49/#50/#51 remain open.

Release through a focused PR from current main. Wait for validation and native build; inspect CodeQL for new findings without disabling existing scanners. Merge after verification, confirm the expected Vercel production SHA is READY, then confirm the signed release APK has the stable signing certificate and a higher version code than build1009. Update the PR's final release evidence with links and remaining limits.
