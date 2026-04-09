# Demo App

This demo shows the full flow:

1. upload files to MinIO/S3-compatible storage
2. send their bucket-relative keys to the sandbox executor service
3. run Python against those staged files
4. download transformed outputs

## Ports

- Demo frontend: `5173`
- Demo API: `8787`
- Sandbox service: `3000`
- MinIO API: `9000`
- MinIO console: `9001`

## Quick start

1. Review the shared root [.env.example](../.env.example) and copy it to `.env` with any necessary adjustments (e.g. MinIO credentials).
2. `just infra-up`
3. `just install-service`
4. `just install-demo`
5. In separate terminals run:
   - `just sandbox-dev`
   - `just demo-api-dev`
   - `just frontend-dev`

## Notes

- Both the sandbox service and the demo API load the shared repo-root `.env` by default.
- You can still point either process at a different file with `ENV_FILE=/path/to/file just sandbox-dev` or `ENV_FILE=/path/to/file just demo-api-dev`.
- Default ports are still code-driven:
  - sandbox service: `3000`
  - demo API: `8787`
  - demo frontend: `5173`
