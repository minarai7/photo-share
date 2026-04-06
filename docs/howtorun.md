Backend terminal:

cd backend
go run ./cmd/server

Frontend terminal:

cd frontend
npm run dev

Disable firewall for app:

Run powershell as administrator and add following rule

New-NetFirewallRule `
  -DisplayName "Go Backend Server 8080" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8080 `
  -Program "D:\Main\Project\CS Self Study\photo-share\backend\bin\server.exe"