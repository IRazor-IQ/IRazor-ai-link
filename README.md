# IRazor AI — transformation Version

## Requirements
- Node.js 18+ → https://nodejs.org

## Setup (one time)
```bash
npm install
```

## Run (development)
```bash
npm start
```

## Build EXE / DMG / AppImage
```bash
# Windows only (.exe installer + portable)
npm run build:win

# Mac only (.dmg)
npm run build:mac

# Linux only (.AppImage + .deb)
npm run build:linux

# All platforms at once
npm run build:all
```

Output goes to: `dist/`

---

## File access on PC
The PC version has full file system access:
- Read/write any file on the computer
- Run shell commands (cmd / bash)
- List directories recursively
- Search inside files

## Notes
- API key: go to Settings → Custom API Key
- GitHub token: go to Settings → GitHub Token
- No Android bridge needed — uses Node.js file system directly
