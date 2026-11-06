# tempo

A quiet Pomodoro timer and task list for the Linux desktop. Local-first, keyboard-first,
with small independent overlay windows that keep working when the main window is closed.

Built with Tauri 2 (Rust) and React. Arch Linux first, Ubuntu supported.

## What it does

- **Focus**: a timer that runs in Rust (not in the webview), so it stays correct across
  window switches, reloads, restarts and suspend. Profiles are Classic 25/5, Deep work
  50/10, Extended 90/15 and Custom. Long breaks come after a set number of sessions, and
  breaks or focus sessions can start automatically.
- **Tasks**: title, notes, project, priority, estimate, scheduled day and due date. Views
  for Today, Upcoming, Anytime, Completed and each project. Quick add understands
  `Write intro ~45m !h #thesis @tomorrow`.
- **Planning**: a week board. Drag tasks onto days, or use the keyboard. Unfinished tasks
  from earlier days are collected so you can move them forward.
- **Insights**: focus time by day or month, by project, estimate against actual, and the
  full session history.
- **Overlays**: floating timer (230×145), quick tasks (280×260) and mini session (190×85).
  Each is its own window with its own visibility, position, size, always-on-top and opacity.
- **Desktop**: tray menu, notifications with sound, global shortcuts, start on login,
  `.desktop` launcher actions, and JSON export/import.

## Keyboard

| Where        | Keys                                                                 |
|--------------|----------------------------------------------------------------------|
| Anywhere     | `1`–`5` switch section · `?` help                                    |
| Focus        | `Space` start/pause · `R` reset · `S` skip · `N` new task            |
| Task lists   | `J`/`K` move · `X` done · `F` focus on it · `E` edit · `Alt+↑/↓` reorder · `Del` |
| Planning     | `←`/`→` move a day · `T` today · `U` unschedule · `[` `]` change week |

Global defaults: `Ctrl+Alt+T` floating timer, `Ctrl+Alt+Q` quick tasks, `Ctrl+Alt+P`
pause/resume, `Ctrl+Alt+N` new focus session, `Ctrl+Alt+O` always-on-top,
`Ctrl+Shift+Space` open tempo. All of them can be changed in Settings, which also shows
any that failed to register.

### Wayland

Wayland doesn't let apps grab keys globally, so on a Wayland session bind these commands
in your desktop's shortcut settings instead. They are forwarded to the running instance:

```
tempo --action pause-resume     tempo --action toggle-floating
tempo --action new-focus        tempo --action quick-tasks
tempo --action toggle-on-top    tempo --action mini-session
tempo --action open-main
```

KDE: System Settings → Shortcuts → Add Command. GNOME: Settings → Keyboard → Custom
Shortcuts. Hyprland: `bind = CTRL ALT, P, exec, tempo --action pause-resume`.

## Linux notes and limitations

- **Window position on Wayland**: Wayland clients can't place their own windows or read
  where they are, so saved overlay positions only apply on X11 or XWayland. On Wayland the
  compositor chooses where they go. A KDE window rule, or a Hyprland `windowrulev2` on the
  titles `tempo — timer`, `tempo — tasks` and `tempo — mini`, can pin them.
- **Always-on-top** is a hint. KWin and most wlroots compositors honour it; GNOME/Mutter
  on Wayland may not.
- **System tray** needs StatusNotifierItem support. KDE and most panels have it. On stock
  GNOME, install the *AppIndicator and KStatusNotifierItem Support* extension. With no tray,
  closing the main window really quits, so you can't lose the app.
- **Notification sound** is played by your notification server from the freedesktop sound
  theme (`complete` by default). Some servers ignore sounds.
- **Transparent overlays** need a compositor. Without one they render opaque.

## Install

### Arch Linux

```sh
# from the repo
cd packaging/arch && makepkg -si
```

Runtime dependencies: `webkit2gtk-4.1 gtk3 libayatana-appindicator`. The package is
called `tempo-focus` because `tempo` is already taken on the AUR; the command is `tempo`.

### Ubuntu 22.04+ / Debian 12+

```sh
sudo apt install ./tempo_0.1.0_amd64.deb
```

### AppImage

```sh
chmod +x tempo_0.1.0_amd64.AppImage && ./tempo_0.1.0_amd64.AppImage
```

## Build from source

System packages:

```sh
# Arch
sudo pacman -S --needed webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg base-devel rust nodejs pnpm

# Ubuntu / Debian
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev build-essential curl file
# plus Rust (rustup.rs) and Node 20+ with pnpm
```

Then:

```sh
pnpm install
pnpm tauri dev          # run in development
pnpm test               # Rust tests: timer transitions, persistence, tasks, backup
pnpm typecheck
pnpm tauri build        # .deb, .rpm and AppImage in src-tauri/target/release/bundle
```

If the AppImage step fails with "Failed to download runtime", fetch the runtime once and
point the bundler at it. On Arch, also skip linuxdeploy's strip, which can't read newer
system libraries:

```sh
curl -fLo ~/.cache/tauri/runtime-x86_64 \
  https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64
LDAI_RUNTIME_FILE=~/.cache/tauri/runtime-x86_64 NO_STRIP=true pnpm tauri build --bundles appimage
```

## Data

Everything is stored in SQLite at `~/.local/share/dev.tempo.app/tempo.db`. Nothing is sent
anywhere and nothing needs an account. Settings → Data exports and imports JSON backups.

## Layout

```
src/                     React UI. One bundle; each window picks its view by label
  components/            common · timer · tasks · navigation
  windows/               dashboard (5 pages) · floating-timer · quick-tasks · mini-session
  stores/ hooks/ lib/ services/
src-tauri/src/
  timer/engine.rs        pure timer state machine, unit-tested
  timer/service.rs       persistence, ticker, broadcasts
  database/              connection and migrations
  tasks/ stats/ settings/ windows/ shortcuts/ notifications/ tray.rs actions.rs backup.rs
docs/ARCHITECTURE.md     how the timer, windows and actions fit together
packaging/               .desktop entry, Arch PKGBUILD
```

## Licence

MIT
