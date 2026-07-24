# OmniForge v0.7.1 Job System

## Purpose

The Job Center owns all long-running provider operations. Jobs remain visible while the user changes panels and are persisted in authoritative project state.

## Job record

Every job records:

- Stable job ID
- Provider ID
- Operation and title
- Inputs, prompt, and settings
- State and current stage
- Progress from 0 to 1
- Creation, start, completion, and elapsed times
- Structured logs
- Warnings and errors
- Cancellation state
- Outputs
- Validation result
- Retry eligibility
- Cost metadata
- Attempt number and source job relationship

Job states are `queued`, `running`, `succeeded`, `failed`, `cancelled`, and `interrupted`.

## Scheduling

- The project setting `maxConcurrentJobs` controls concurrency from 1 through 8.
- Jobs run in isolated child processes with hidden windows on Windows.
- The main editor remains responsive while workers run.
- Structured worker events update progress, logs, validation, and provider health.
- Completed history is retained according to integration settings.

## Recovery

On startup, jobs left in `queued` or `running` state are marked `interrupted`, receive a useful error, and become retryable. OmniForge does not falsely resume a worker that no longer exists.

## Cancellation and retry

- Queued jobs can be cancelled before execution.
- Running jobs receive a process termination request and are marked cancelled.
- Failed, cancelled, and interrupted jobs can be retried as a new attempt linked to the original.
- The original audit record remains available.

## Current operations

- Provider health check
- Project asset index
- Project integrity validation
- Diagnostic delay used to verify progress, cancellation, and retry behavior

Future marketplace downloads, model generation, rigging, reconstruction, and animation processing must use this same job system.
