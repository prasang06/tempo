# tempo

A quiet Pomodoro timer and task list for the desktop. Local-first and keyboard-first, with
small overlay windows that keep running when the main window is closed.

Built with Tauri 2 (Rust) and React. Made for Linux first; Windows is supported too.

## Features

- **Focus timer** that lives in the Rust backend, not the UI, so it stays correct across
  window switches, reloads, restarts and sleep. Profiles: Classic 25/5, Deep work 50/10,
  Extended 90/15, or Custom. Long breaks after a set number of sessions, and breaks or
  focus can start on their own.
- **Tasks** with notes, project, priority, estimate, scheduled day and due date. Views for
  Today, Upcoming, Anytime, Completed and each project.
- **Quick add** that reads the line as you type: `Write intro ~45m !h #thesis @tomorrow`
  means a 45-minute estimate, high priority, the *thesis* project, scheduled tomorrow.
- **Planning**: a week board. Drag tasks onto days or use the keyboard. Unfinished tasks
  from earlier days collect in one place so you can move them forward.
- **Insights**: focus time per day or month, time by project, estimate against actual, and
  the full session history.
- **Overlays**: a floating timer, a quick-tasks list and a mini session strip. Each is its
  own window with its own position, size, opacity and always-on-top setting (off by default).
- **Desktop**: tray menu, notifications with sound, global shortcuts, start on login, and
  JSON export/import. No account, no cloud. Your data stays on your machine.

## Platform support

| | Linux (X11) | Linux (Wayland) | Windows 10/11 |
|---|---|---|---|
| Timer, tasks, planning, insights | ✓ | ✓ | ✓ |
| Overlays | ✓ | ✓ | ✓ |
| Overlay remembers its position | ✓ | compositor decides | ✓ |
| Always-on-top | ✓ | most compositors | ✓ |
| Global shortcuts | ✓ | via desktop settings | ✓ |
| Tray | ✓ | ✓ | ✓ |
| Notification sound | sound theme | sound theme | Windows toast sounds |
| Packages | AUR, .deb, .rpm, AppImage | same | .msi, setup .exe |

## Install

**Arch Linux**

```sh
cd packaging/arch && makepkg -si
```

The package is called `tempo-focus` because `tempo` is already taken on the AUR. The command
is still `tempo`.

**Ubuntu 22.04+ / Debian 12+**

```sh
sudo apt install ./tempo_0.1.0_amd64.deb
```

**Any Linux (AppImage)**

```sh
chmod +x tempo_0.1.0_amd64.AppImage && ./tempo_0.1.0_amd64.AppImage
```

**Windows**

Run `tempo_0.1.0_x64-setup.exe` (installs for your user only, no admin needed) or the
`.msi`. Both need Microsoft Edge WebView2, which ships with Windows 10 and 11; the
installer fetches it if it's missing.

Installers are produced by the GitHub Actions build (see [Building](#building)).

## Keyboard

| Where | Keys |
|---|---|
| Anywhere | `1`–`5` switch section · `?` show all shortcuts |
| Focus | `Space` start/pause · `R` reset · `S` skip · `N` new task |
| Task lists | `J`/`K` move · `X` done · `F` focus on it · `E` edit · `Alt+↑/↓` reorder · `Del` delete |
| Planning | `←`/`→` move a day · `T` today · `U` unschedule · `[` `]` change week |

Global shortcuts (all changeable in Settings → Shortcuts):

| Default | Action |
|---|---|
| `Ctrl+Alt+T` | Show/hide floating timer |
| `Ctrl+Alt+Q` | Show/hide quick tasks |
| `Ctrl+Alt+P` | Pause / resume |
| `Ctrl+Alt+N` | New focus session |
| `Ctrl+Alt+O` | Toggle always-on-top for open overlays |
| `Ctrl+Shift+Space` | Open tempo |

### Commands

A running tempo also takes commands, which is how shortcuts work on Wayland and how to
script it anywhere:

```sh
tempo --action pause-resume     # also: new-focus, toggle-floating, quick-tasks,
                                #       mini-session, toggle-on-top, open-main
```

- **KDE**: System Settings → Shortcuts → Add New → Command.
- **GNOME**: Settings → Keyboard → Custom Shortcuts.
- **Hyprland**: `bind = CTRL ALT, P, exec, tempo --action pause-resume`.
- **Windows**: `"%LOCALAPPDATA%\tempo\tempo.exe" --action pause-resume`, from
  AutoHotkey, a Stream Deck, or a desktop shortcut.

The Linux launcher also has these as right-click actions.

## Platform notes

### Linux

- **Wayland and window position.** Wayland doesn't let apps place their own windows or
  read where they are, so on Wayland the compositor chooses where overlays open. To pin
  them, use a KDE window rule or a Hyprland `windowrulev2` on the window titles
  `tempo — timer`, `tempo — tasks` and `tempo — mini`.
- **Wayland and shortcuts.** Apps can't grab keys globally on Wayland, so the built-in
  shortcuts only fire while a tempo window has focus. Bind the commands above instead.
- **Always-on-top** is only a request. KWin and most wlroots compositors honour it; GNOME
  on Wayland may not.
- **Tray.** KDE and most panels show it. Stock GNOME needs the *AppIndicator and
  KStatusNotifierItem Support* extension. With no tray, closing the main window quits the
  app instead of hiding it, so you can't lose it.
- **Notification sound** comes from your sound theme (`complete` by default). Some
  notification servers don't play sounds.
- **See-through overlays** need a compositor; without one they're drawn solid.

### Windows

- **Ctrl+Alt is AltGr** on many non-US keyboard layouts (German, French, Polish…). A
  default like `Ctrl+Alt+Q` can stop you typing `@` while tempo runs. If that happens,
  change it in Settings → Shortcuts.
- **Notification sound** is one of Windows' toast sounds: `Default`, `Reminder` (the
  default), `IM`, `Mail` or `SMS`. Focus Assist / Do Not Disturb silences them.
- **Notifications in dev builds** show up as coming from PowerShell. Installed builds use
  tempo's own name and icon.
- **Data** lives in `%APPDATA%\dev.tempo.app\tempo.db`.

## Building

You need Rust (stable), Node 20+ and pnpm.

**Linux system packages**

```sh
# Arch
sudo pacman -S --needed webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg base-devel rust nodejs pnpm

# Ubuntu / Debian
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev build-essential curl file
```

**Windows**: install the *Visual Studio Build Tools* with the "Desktop development with
C++" workload, then Rust from [rustup.rs](https://rustup.rs) (the default MSVC toolchain).
WebView2 is already part of Windows 10/11.

**Then, on either platform**

```sh
pnpm install
pnpm tauri dev      # run in development
pnpm test           # Rust tests: timer transitions, persistence, tasks, backup
pnpm typecheck
pnpm tauri build    # Linux: .deb .rpm .AppImage — Windows: .msi and setup .exe
```

Output goes to `src-tauri/target/release/bundle/`.

**Without a Windows machine**, use GitHub Actions: Actions → *build* → *Run workflow*
builds and tests on Ubuntu and Windows and attaches the installers to the run. It also runs
on pull requests and `v*` tags.

**AppImage on Arch.** If the AppImage step fails with "Failed to download runtime", fetch
the runtime once. Also turn off stripping, because the bundler's `strip` can't read newer
Arch libraries:

```sh
curl -fLo ~/.cache/tauri/runtime-x86_64 \
  https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64
LDAI_RUNTIME_FILE=~/.cache/tauri/runtime-x86_64 NO_STRIP=true pnpm tauri build --bundles appimage
```

## Data

Everything is in one SQLite file: `~/.local/share/dev.tempo.app/tempo.db` on Linux,
`%APPDATA%\dev.tempo.app\tempo.db` on Windows. Settings → Data exports and imports JSON
backups.

## Project layout

```
src/                     React UI. One bundle; each window picks its view by label
  components/            common · timer · tasks · navigation
  windows/               dashboard (5 pages) · floating-timer · quick-tasks · mini-session
  stores/ hooks/ lib/ services/
src-tauri/src/
  timer/engine.rs        timer state machine (pure, unit-tested)
  timer/service.rs       saves timer state, completes sessions, notifies windows
  database/              connection and migrations
  tasks/ stats/ settings/ windows/ shortcuts/ notifications/ tray.rs actions.rs backup.rs
docs/ARCHITECTURE.md     how the timer, windows and actions fit together
packaging/               Linux .desktop entry, Arch PKGBUILD
.github/workflows/       Linux + Windows build
```

## Licence

MIT
