# OmniForge v0.7.1 Local Worker Protocol

## Isolation

Long-running work does not execute inside the renderer or Electron main process. The Job Manager starts a versioned Node sidecar process and passes one encoded request containing only controlled paths and job data.

## Request fields

- Job and provider IDs
- Operation
- Inputs
- Prompt
- Settings
- Authoritative state-file path
- Asset root
- Runtime root
- Active project root

Workers receive controlled directories; they are not granted a general shell or unrestricted project mutation interface.

## Event stream

Workers emit newline-delimited JSON events:

- `progress` — stage, normalized progress, optional message
- `log` — level and message
- `error` — structured failure message
- `result` — outputs, warnings, errors, validation, and optional provider status

The Job Manager validates and persists these events.

## Failure behavior

- Worker crashes do not crash the editor.
- Nonzero exits become failed, retryable jobs.
- Shutdown interrupts active jobs and records that state.
- Cancellation terminates the worker and retains the audit trail.
- Temporary output must remain inside controlled staging directories.

## Hardware reporting

The health worker reports platform, architecture, Node version, CPU, logical cores, memory, and detected display adapters. Detection does not prove that an AI model can use the GPU. Each future model worker must report the backend that completes a real inference health test.
