# Security

Do not open public issues for vulnerabilities or include credentials, customer
data, or tenant identifiers in reports.

## Supported versions

| Version | Supported | Notes                                                                                                                                                                                                                                     |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.2.x` | Yes       | Current release.                                                                                                                                                                                                                          |
| `0.1.0` | No        | Replays a write once after an HTTP 401, and on React Native's default XHR-backed Fetch can follow a redirect with the bearer token attached. Upgrade to `0.2.x`; see the [changelog](CHANGELOG.md) for the native transport setup change. |

## How to report

Use GitHub's private vulnerability reporting on this repository: open the
**Security** tab and choose **Report a vulnerability**. If that is unavailable
to you, contact the SkyPorch maintainers privately through your existing
SkyPorch support channel. Include the affected version, reproduction steps, and
impact.

## Coordinated disclosure

Please give maintainers a chance to ship a fix before publishing details, and
tell us when you intend to publish so a fix and an advisory can be prepared
alongside it. Reporters who want credit in the advisory should say so in the
report. No acknowledgement time, status-update cadence, or disclosure deadline
is promised yet.
