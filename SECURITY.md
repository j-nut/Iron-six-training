# Security reporting

Do not publish tokens, signing keys, account exports or exploitable account/data-access details in public issues.

Use the repository Security tab's **Report a vulnerability** when private vulnerability reporting is enabled. If that button is unavailable, contact the repository owner through an existing private channel to arrange a private report; do not include the exploit in a public issue.

The current main branch is maintained. Include the affected commit/build, reproduction steps, impact and a sanitized proof. The owner triages reports; no guaranteed response SLA is currently established.

CodeQL scans JavaScript and GitHub Actions on pull requests, main pushes and weekly. Dependabot proposes npm, Gradle and Actions updates. Treat findings as work to investigate; a green scan is not proof that the app is free of vulnerabilities.
