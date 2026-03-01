## Packages
socket.io-client | Required for real-time WebSocket communication with the backend
lucide-react | Icons for the dashboard

## Notes
- The application relies heavily on WebSockets for real-time updates (QR codes, logs, alerts).
- The frontend connects to the Socket.io server at the root path `/` with a `userId` query parameter.
- Browser Notification API is used for desktop alerts.
- RTL (Right-to-Left) layout is enforced via `dir="rtl"` in the main App wrapper.
- All styles use logical CSS properties (e.g., `ms-`, `pe-`) for perfect RTL support.
