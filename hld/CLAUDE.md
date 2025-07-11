This is the humanlayer Daemon (HLD) that powers the WUI (humanlayer-wui)

The logs are probably ~/.humanlayer/daemon.log

It uses a database at ~/.humanlayer/daemon.db - you can access it with sqlite3 to inspect progress and debug things

You cannot run this process, you cannot restart it. If you make changes, you must ask the user to rebuild it.

You can test RPC calls with nc:

```
echo '{"jsonrpc":"2.0","method":"getSessionLeaves","params":{},"id":1}' | nc -U ~/.humanlayer/daemon.sock | jq '.'
```
