# Social sign-in activation

The application supports Google, Apple, Microsoft (Supabase provider ID `azure`), and GitHub. As checked on September 5, 2026, all four providers are disabled in the hosted project. The UI reads Supabase's public Auth settings and enables each button only when that provider is enabled. No redeployment is needed after activating a provider.

## Shared configuration

Use this callback in each provider's OAuth application:

```text
https://btfrkfbxyowglrdwclei.supabase.co/auth/v1/callback
```

In [Supabase Auth providers](https://supabase.com/dashboard/project/btfrkfbxyowglrdwclei/auth/providers), enter each provider's credentials and enable it. Credentials belong only in the provider settings, never in client JavaScript, this repository, or chat.

In [Auth URL configuration](https://supabase.com/dashboard/project/btfrkfbxyowglrdwclei/auth/url-configuration), set the site URL to the production application and allow the exact return URLs used:

- `https://iron-six-training-jordman55-3386s-projects.vercel.app/`
- `https://iron-six-training-jordman55-3386s-projects.vercel.app/live`
- `https://iron-six-training.vercel.app/`
- `https://iron-six-training.vercel.app/live`

If serving the HTML filenames directly, allow those exact URLs too. Preview URLs need their own explicit allowlist entry. The callback returns to the origin/path where sign-in began; user-controlled query parameters cannot choose a different destination.

## Provider setup

| Provider | Configuration |
| --- | --- |
| Google | Register a Web OAuth client in Google Auth Platform. Configure consent/audience and authorized app origins, register the Supabase callback, then copy its client ID and secret into Supabase. Use only the identity/email/profile scopes. |
| Apple | Configure Sign in with Apple, a Services ID for the website, and the Supabase callback. Configure the signing key and generated client secret through Apple's setup process, then add the resulting credentials in Supabase. Track the secret's expiration and renew it before expiry. |
| Microsoft | Register an application in Microsoft Entra, choose the intended personal/work account audience, configure the Web callback, and create a client secret. Enter its client ID and secret under Azure in Supabase. The app explicitly requests the required email scope. |
| GitHub | Create a GitHub OAuth App with the app homepage and Supabase callback; enter its client ID and client secret in the GitHub provider settings. No repository-access scopes are requested by the app. |

Official instructions: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [Microsoft](https://supabase.com/docs/guides/auth/social-login/auth-azure), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github).

## Existing accounts

Supabase handles eligible automatic identity linking for matching verified emails. The app does not merge accounts by email itself. For a different email (including Apple's private relay), sign in to the existing Iron Six account first and use **Connect**. Enable **Allow manual linking** in Supabase Auth to support that flow. An identity already attached to another account cannot be silently moved. See [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Release check

After credentials are configured, test with a provider account permitted by its consent/audience settings:

1. Open Sign in and check that the provider becomes available.
2. Complete sign-in and verify return to the same app origin.
3. Confirm the existing account/profile and workout records are intact.
4. Cancel a second attempt and verify the app offers retry/email without losing local entries.
5. For manual linking, sign in first, connect the second provider, then verify both methods reach the same Supabase user ID.

Provider redirects and identity linking have automated contract tests. A real provider round trip cannot be verified until credentials and audience settings are configured. Vercel's separate deployment-access gate still applies before users reach Iron Six.
