# Security policy

## Reporting a vulnerability

Please report security issues privately, through GitHub:
**[Report a vulnerability](https://github.com/RonRadtke/react-native-blob-util/security/advisories/new)**
(the *Security* tab of this repository, then *Report a vulnerability*).

Do not open a public issue or pull request for a vulnerability, and do not post details
elsewhere before a fix is released.

A useful report contains:

- the affected version(s) and platform(s) (Android, iOS, Windows);
- the API call and options involved, and what an attacker has to control for it to matter;
- steps to reproduce, or a minimal example;
- what you expected and what happened.

This project is maintained by one person in their spare time. You can expect an
acknowledgement within about a week, and an assessment once the issue has been reproduced.
There is no bug bounty.

## What happens next

1. The report is reproduced and assessed on the supported versions below.
2. A fix is prepared in private and released on every supported line at the same time.
3. The advisory is published once the fixed versions are on npm. It lists the affected and
   patched versions, and a CVE is requested for it. Reporters are credited unless they ask
   not to be.

## Supported versions

| Version | Supported |
|---|---|
| 1.x | yes |
| 0.25.x | security fixes only |
| 0.24.x | security fixes only |
| older | no |

0.25 is the last line that supports React Native's Old Architecture. Security fixes are made
there, and on 0.24, for apps that cannot move to 1.x yet. Other bug fixes only go into 1.x.

## Scope

The library runs inside your app, with your app's permissions. Issues where the library lets
input from outside the app - a server, a URL, another app, a file name - reach something it
should not are in scope. So are problems in how the library validates TLS certificates.

Using an option in a way the documentation warns against, such as `trusty: true` in
production, is not a vulnerability in the library.
