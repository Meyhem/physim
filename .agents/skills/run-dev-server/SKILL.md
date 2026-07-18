---
name: run-dev-server
description: Check, start, and verify the local Vite development server as a background task.
---

# Vite Development Server Workspace Skill

Use this skill when the user requests to run the local server, start the application, or test changes in a web browser.

## Step-by-Step Workflow

### 1. Check for Active Dev Tasks
*   Call `manage_task` with `Action: "list"` to see if a background server task is already active.
*   If a task running `npm run dev` or `vite` is found:
    *   Query its logs using `manage_task` with `Action: "status"`.
    *   Report the existing URL to the user (e.g. `http://localhost:5173/`).
    *   Do **NOT** start a new command.

### 2. Start the Server (Non-Blocking Mode)
*   If no active task is running, call `run_command` with the following parameters:
    *   `CommandLine`: `npm run dev`
    *   `Cwd`: `/home/meyhem/dev/physim`
    *   `BypassSandbox`: `true` (required for exposing port listener)
    *   `WaitMsBeforeAsync`: `500` (low value to launch in the background instantly without blocking the prompt interface)

### 3. Verify Server Logs & Expose URL
*   Once the task starts and returns the task ID, do **NOT** block or poll for server status.
*   Immediately report the background task ID and link `http://localhost:5173/` to the user to end your turn.
