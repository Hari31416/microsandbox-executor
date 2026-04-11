# Demo App

This demo shows the full flow:

1. upload files to the executor-backed local session storage
2. run Python against those session files
3. download transformed outputs from the executor service

## Ports

- Demo frontend: `5173`
- Demo API: `8787`
- Sandbox service: `3000`

## Quick start

1. Review the shared root [.env.example](../.env.example) and copy it to `.env` with any necessary adjustments for the host-run sandbox service.
2. Optionally copy [`.env.docker.example`](./.env.docker.example) to `.env.docker` if you want custom demo container settings.
3. Start the sandbox service on the host:
   - `just sandbox-up`
4. Start the demo stack:
   - `just demo-up`
5. Open `http://127.0.0.1:5173`

## Notes

- The sandbox service runs on the host and loads the shared repo-root `.env`.
- The demo containers use `demo/.env.docker` when present, otherwise `demo/.env.docker.example`.
- The demo API reaches the host-run sandbox service at `http://host.docker.internal:3000`.
- Default ports are still code-driven:
  - sandbox service: `3000`
  - demo API: `8787`
  - demo frontend: `5173`
