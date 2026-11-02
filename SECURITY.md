# Security

## Weaknesses in a recorder

A scan or an audit can show that a session recorder leaks data that no annotation or configuration protects. Report this privately. Do not open a public issue for it.

1. Report it to the recorder's maintainers through their own security contact first.
2. Also send it to this project through a [private security advisory](https://github.com/privacy-attribute/spec/security/advisories/new), so the scan and the audit can take it into account.

The `privacy-scan report` command writes such findings to `feedback/private-recorder-gaps.md` and leaves them out of the public scan report.

## Weaknesses in this project

To report a problem in the scanner or the audit runner themselves, for example a command that writes outside its session folder, use a [private security advisory](https://github.com/privacy-attribute/spec/security/advisories/new).
