# 🤖 THE "NO SSH COMMANDS" PROTOCOL
**CRITICAL:** You must follow this invariant rule for ALL projects in this workspace:

## 1. NEVER RUN SSH COMMANDS AUTONOMOUSLY
- **NEVER** run or attempt to execute `ssh` commands (e.g., `ssh root@ip` or `ssh-keygen` or `ssh-copy-id`) using the local terminal `run_command` tool.
- The environment terminal is not suited for interactive remote connections and attempting to do so will cause the terminal to hang, freezing background tasks.
- If remote server status, commands, or configuration needs to be checked or modified, ask the user to run the specific commands in their own active SSH terminal and paste the output back to you.
