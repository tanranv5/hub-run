# Hub-Run Agent Rules

## Language

- All responses, comments, commit messages, and documentation should be written in Chinese (中文).

## Restart Verification (Mandatory)

- After any code/config change that should affect runtime behavior, you must restart the `hub-run` service before claiming completion.
- Restart is not considered successful until both checks pass:
  - Process/port check: target port(s) are actively listening (for example with `lsof -iTCP:<port> -sTCP:LISTEN`).
  - HTTP health check: API responds successfully (for example `GET /api/auth/status` returns `HTTP 200`).
- If restart or verification fails, do not stop. Continue troubleshooting until restart verification is successful.
- Never report "done" when restart verification has not passed.
