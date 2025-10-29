# Goat Battle - WebSocket Server (Socket.IO)

This is a minimal WebSocket (Socket.IO) server intended for the Goat Battle prototype.
It is **in-memory** and **not production ready** but is perfect for testing and small groups.

## What it does
- Create or join rooms
- Broadcast player states and actions (fire, hit)
- Simple host assignment and match start broadcast

## Deploy on Railway (step-by-step)

1. Create a Git repo with these files (or upload this ZIP to Railway).
2. Go to the Railway website: https://railway.com/ (official site).
3. Click "Start a Project" → "Deploy from GitHub" or "Deploy from Repo" (Railway UI may change; use the "New Project" / "Deploy" buttons).
4. Connect your GitHub repo (or upload the ZIP). Railway will detect `package.json` and build.
5. Railway will assign a `PORT` automatically. The server listens on `process.env.PORT`.
6. After deploy, Railway gives you a domain like `https://something.up.railway.app` — copy that URL.
7. Use the URL to connect from your client. Example Socket.IO connection URL: `wss://something.up.railway.app` (if using Socket.IO client, use `https://something.up.railway.app` as the host).

## Local testing
1. Install dependencies: `npm install`
2. Start: `npm start`
3. In browser or client, connect to `http://localhost:3000` (Socket.IO client example `io('http://localhost:3000')`).

## Notes on Railway free tier
- Railway gives compute (RAM + CPU) and a number of free hours. The "1 GB" often referenced is RAM size, not storage.
- This server keeps data in memory; restarting the container clears rooms.

## Next steps for integration with client
- In your client (Netlify), replace the placeholder SOCKET URL with the Railway deployment URL.
- Use the Socket.IO client to emit `create_room`, `join_room`, `player_state`, `fire`, `hit`, and listen to `room_update`, `player_state`, `fire`, `hit`, `match_started`.
