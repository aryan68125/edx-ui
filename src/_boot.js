const signale = require("signale");
const {app, BrowserWindow, dialog, shell} = require("electron");

process.on("uncaughtException", e => {
    signale.fatal(e);
    dialog.showErrorBox("eDEX-UI crashed", e.message || "Cannot retrieve error message.");
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    process.exit(1);
});

signale.start(`Starting eDEX-UI v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    signale.fatal("Error: Another instance of eDEX is already running. Cannot proceed.");
    app.exit(1);
}

signale.time("Startup");

const electron = require("electron");
require('@electron/remote/main').initialize()
const ipc = electron.ipcMain;
const path = require("path");
const url = require("url");
const fs = require("fs");
const which = require("which");
const color = require("color");
const Terminal = require("./classes/terminal.class.js").Terminal;

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

var win, tty, extraTtys;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const themesDir = path.join(electron.app.getPath("userData"), "themes");
const innerThemesDir = path.join(__dirname, "assets/themes");
const kblayoutsDir = path.join(electron.app.getPath("userData"), "keyboards");
const innerKblayoutsDir = path.join(__dirname, "assets/kb_layouts");
const fontsDir = path.join(electron.app.getPath("userData"), "fonts");
const innerFontsDir = path.join(__dirname, "assets/fonts");
const binDir = path.join(electron.app.getPath("userData"), "bin");
const shellInitDir = path.join(electron.app.getPath("userData"), "shell_init");
const superfileConfigHome = path.join(electron.app.getPath("userData"), "superfile", "config_home");
const superfileDataHome = path.join(electron.app.getPath("userData"), "superfile", "data_home");
const superfileStateHome = path.join(electron.app.getPath("userData"), "superfile", "state_home");

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist, trading a bit of stability for a great deal of performance, mostly on Linux
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
    fs.mkdirSync(electron.app.getPath("userData"));
    signale.info(`Created config dir at ${electron.app.getPath("userData")}`);
} catch(e) {
    signale.info(`Base config dir is ${electron.app.getPath("userData")}`);
}
// Create default settings file
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
        shell: (process.platform === "win32") ? "powershell.exe" : "bash",
        shellArgs: '',
        cwd: electron.app.getPath("userData"),
        keyboard: "en-US",
        theme: "tron",
        termFontSize: 15,
        audio: true,
        audioVolume: 1.0,
        disableFeedbackAudio: false,
        clockHours: 24,
        pingAddr: "1.1.1.1",
        port: 3000,
        nointro: false,
        nocursor: false,
        forceFullscreen: true,
        allowWindowed: false,
        excludeThreadsFromToplist: true,
        hideDotfiles: false,
        fsListView: false,
        experimentalGlobeFeatures: false,
        experimentalFeatures: false
    }, "", 4));
    signale.info(`Default settings written to ${settingsFile}`);
}
// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
    fs.writeFileSync(shortcutsFile, JSON.stringify([
        { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
        { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+F", action: "FUZZY_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
        { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
        { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false }
    ], "", 4));
    signale.info(`Default keymap written to ${shortcutsFile}`);
}
//Create default window state file
if(!fs.existsSync(lastWindowStateFile)) {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify({
        useFullscreen: true
    }, "", 4));
    signale.info(`Default last window state written to ${lastWindowStateFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
try {
    fs.mkdirSync(themesDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerThemesDir).forEach(e => {
    fs.writeFileSync(path.join(themesDir, e), fs.readFileSync(path.join(innerThemesDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(kblayoutsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerKblayoutsDir).forEach(e => {
    fs.writeFileSync(path.join(kblayoutsDir, e), fs.readFileSync(path.join(innerKblayoutsDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(fontsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerFontsDir).forEach(e => {
    fs.writeFileSync(path.join(fontsDir, e), fs.readFileSync(path.join(innerFontsDir, e)));
});

// Mirror a bundled CLI tool's binary for this platform/arch, if one is
// shipped. Absence is not an error: the feature depending on it just stays
// off and the shell behaves exactly as before.
function mirrorBundledBinary(name) {
    let innerDir = path.join(__dirname, "assets/bin", name, `${process.platform}-${process.arch}`);
    let exeName = process.platform === "win32" ? `${name}.exe` : name;
    if (!fs.existsSync(path.join(innerDir, exeName))) return null;

    try {
        fs.mkdirSync(binDir);
    } catch(e) {
        // Folder already exists
    }
    let dest = path.join(binDir, exeName);
    fs.writeFileSync(dest, fs.readFileSync(path.join(innerDir, exeName)));
    if (process.platform !== "win32") fs.chmodSync(dest, 0o755);
    return dest;
}

let lsdBin = mirrorBundledBinary("lsd");
let spfBin = mirrorBundledBinary("spf");

// Version history logging
const versionHistoryPath = path.join(electron.app.getPath("userData"), "versions_log.json");
var versionHistory = fs.existsSync(versionHistoryPath) ? require(versionHistoryPath) : {};
var version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
	versionHistory[version] = {
		firstSeen: Date.now(),
		lastSeen: Date.now()
	};
} else {
	versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), {encoding:"utf-8"});

function createWindow(settings) {
    signale.info("Creating window...");

    let display;
    if (!isNaN(settings.monitor)) {
        display = electron.screen.getAllDisplays()[settings.monitor] || electron.screen.getPrimaryDisplay();
    } else {
        display = electron.screen.getPrimaryDisplay();
    }
    // On Linux, a framed fullscreen window can still get drawn over by the
    // shell's panel/dock. Pin to the reported work area (already excludes
    // panel/dock space) instead of fighting the window manager for true
    // exclusive fullscreen.
    const pinToWorkArea = settings.forceFullscreen && process.platform === "linux";
    let {x, y, width, height} = pinToWorkArea ? display.workArea : display.bounds;
    if (!pinToWorkArea) { width++; height++; }
    // An auto-hide dock doesn't reserve space in workArea, so it can still
    // overlay the window's bottom edge. Shave off extra clearance for it.
    if (pinToWorkArea) {
        height -= 70;
        let narrowedWidth = Math.round(width * 0.9);
        x += Math.round((width - narrowedWidth) / 2);
        width = narrowedWidth;
    }
    win = new BrowserWindow({
        title: "eDEX-UI",
        x,
        y,
        width,
        height,
        show: false,
        resizable: true,
        movable: settings.allowWindowed || true,
        fullscreen: pinToWorkArea ? false : (settings.forceFullscreen || false),
        autoHideMenuBar: true,
        frame: settings.allowWindowed || true,
        backgroundColor: '#000000',
        webPreferences: {
            devTools: true,
	    enableRemoteModule: true,
            contextIsolation: false,
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: settings.experimentalFeatures || false
        }
    });

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'ui.html'),
        protocol: 'file:',
        slashes: true
    }));

    signale.complete("Frontend window created!");
    win.show();
    if (!settings.allowWindowed) {
        win.setResizable(false);
    } else if (!require(lastWindowStateFile)["useFullscreen"]) {
        win.setFullScreen(false);
    }

    signale.watch("Waiting for frontend connection...");
}

// Alias definitions for bundled CLI tools, scoped to eDEX-UI's own terminal.
// Single-quoted outer wrapping with double-quoted inner paths works
// identically in both bash and zsh, and survives spaces in paths (e.g. macOS's
// "Application Support").
function buildAliasLines(lsdBinPath, spfBinPath) {
    let lines = [];
    if (lsdBinPath) {
        lines.push(`alias ls='"${lsdBinPath}" --icon=always'`);
    }
    if (spfBinPath) {
        // Superfile's config/data/state are redirected into eDEX-UI's own
        // folder via XDG env vars, scoped to this one alias invocation only,
        // so it never touches (or is confused with) a standalone superfile
        // install the user might have.
        lines.push(`alias spf='XDG_CONFIG_HOME="${superfileConfigHome}" XDG_DATA_HOME="${superfileDataHome}" XDG_STATE_HOME="${superfileStateHome}" "${spfBinPath}"'`);
    }
    return lines;
}

// Enable icon-capable `ls` and the `spf` file manager (via the bundled
// binaries) scoped to eDEX-UI's own terminal only, without touching the
// user's real shell rc files. Backs off entirely if the user has already
// customized shellArgs, or if neither tool is bundled for this shell/platform.
function getShellInit(shellPath, userShellArgs, lsdBinPath, spfBinPath) {
    if (userShellArgs) return null;
    let aliasLines = buildAliasLines(lsdBinPath, spfBinPath);
    if (aliasLines.length === 0) return null;

    let shellName = path.basename(shellPath).toLowerCase().replace(/\.exe$/, "");
    try {
        fs.mkdirSync(shellInitDir, {recursive: true});
    } catch(e) {
        // Folder already exists
    }

    if (shellName === "bash") {
        let rcPath = path.join(shellInitDir, "bashrc");
        fs.writeFileSync(rcPath, ['[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"'].concat(aliasLines).concat(['']).join("\n"));
        return { params: ["--rcfile", rcPath, "-i"] };
    }

    if (shellName === "zsh") {
        let zdotdir = path.join(shellInitDir, "zsh");
        try {
            fs.mkdirSync(zdotdir, {recursive: true});
        } catch(e) {
            // Folder already exists
        }
        fs.writeFileSync(path.join(zdotdir, ".zshrc"), ['[ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc"'].concat(aliasLines).concat(['']).join("\n"));
        return { env: { ZDOTDIR: zdotdir } };
    }

    return null;
}

// Convert a theme's {r,g,b} channel numbers into a "#rrggbb" hex string.
function themeAccentHex(theme) {
    return color(`rgb(${theme.colors.r}, ${theme.colors.g}, ${theme.colors.b})`).hex();
}

// Generate a superfile config + color theme that mirrors the active eDEX-UI
// theme, written into eDEX-UI's own scoped superfile config folder (never
// the user's real ~/.config/superfile). Regenerated on every boot so it
// always tracks whichever theme is currently selected.
function generateSuperfileFiles(theme) {
    let accent = themeAccentHex(theme);
    let bg = theme.colors.light_black || "#000000";
    let bg2 = theme.colors.black || "#000000";
    let muted = theme.colors.grey || "#444444";
    let accentColor = color(`rgb(${theme.colors.r}, ${theme.colors.g}, ${theme.colors.b})`);
    let colorify = base => color(base).grayscale().mix(accentColor, 0.3).hex();

    let correct = theme.colors.green || colorify("#4e9a06");
    let error = theme.colors.red || colorify("#cc0000");
    let hint = theme.colors.blue || colorify("#3465a4");
    let cancel = theme.colors.yellow || colorify("#c4a000");
    let gradientEnd = colorify("#ffffff");

    let themeToml = [
        `code_syntax_highlight = "monokai"`,
        ``,
        `full_screen_fg = "${accent}"`,
        `full_screen_bg = "${bg}"`,
        ``,
        `gradient_color = ["${accent}", "${gradientEnd}"]`,
        `directory_icon_color = "${accent}"`,
        ``,
        `file_panel_fg = "${accent}"`,
        `file_panel_bg = "${bg}"`,
        `file_panel_border = "${muted}"`,
        `file_panel_border_active = "${accent}"`,
        `file_panel_top_directory_icon = "${accent}"`,
        `file_panel_top_path = "${accent}"`,
        `file_panel_item_selected_fg = "${bg2}"`,
        `file_panel_item_selected_bg = "${accent}"`,
        ``,
        `footer_fg = "${accent}"`,
        `footer_bg = "${bg}"`,
        `footer_border = "${muted}"`,
        `footer_border_active = "${accent}"`,
        ``,
        `sidebar_fg = "${accent}"`,
        `sidebar_bg = "${bg}"`,
        `sidebar_title = "${accent}"`,
        `sidebar_border = "${muted}"`,
        `sidebar_border_active = "${accent}"`,
        `sidebar_item_selected_fg = "${bg2}"`,
        `sidebar_item_selected_bg = "${accent}"`,
        `sidebar_divider = "${muted}"`,
        ``,
        `modal_fg = "${accent}"`,
        `modal_bg = "${bg}"`,
        `modal_border_active = "${accent}"`,
        `modal_cancel_fg = "${bg2}"`,
        `modal_cancel_bg = "${cancel}"`,
        `modal_confirm_fg = "${bg2}"`,
        `modal_confirm_bg = "${accent}"`,
        ``,
        `help_menu_hotkey = "${accent}"`,
        `help_menu_title = "${accent}"`,
        ``,
        `cursor = "${accent}"`,
        `correct = "${correct}"`,
        `error = "${error}"`,
        `hint = "${hint}"`,
        `cancel = "${cancel}"`,
        ``
    ].join("\n");

    let configToml = [
        `editor = ""`,
        `dir_editor = ""`,
        `auto_check_update = false`,
        `cd_on_quit = false`,
        `default_open_file_preview = true`,
        `show_image_preview = true`,
        `show_panel_footer_info = true`,
        `default_directory = "."`,
        `file_size_use_si = false`,
        `default_sort_type = 0`,
        `sort_order_reversed = false`,
        `case_sensitive_sort = false`,
        `shell_close_on_success = false`,
        `page_scroll_size = 0`,
        `debug = false`,
        `ignore_missing_fields = true`,
        `file_panel_extra_columns = 0`,
        `file_panel_name_percent = 50`,
        ``,
        `theme = "edex"`,
        `code_previewer = ""`,
        `nerdfont = true`,
        `show_select_icons = true`,
        `transparent_background = false`,
        `file_preview_width = 0`,
        `enable_file_preview_border = false`,
        `sidebar_width = 20`,
        `sidebar_sections = ["home", "pinned", "disks"]`,
        `border_top = '─'`,
        `border_bottom = '─'`,
        `border_left = '│'`,
        `border_right = '│'`,
        `border_top_left = '╭'`,
        `border_top_right = '╮'`,
        `border_bottom_left = '╰'`,
        `border_bottom_right = '╯'`,
        `border_middle_left = '├'`,
        `border_middle_right = '┤'`,
        ``,
        `metadata = false`,
        `enable_md5_checksum = false`,
        `zoxide_support = false`,
        ``,
        `[open_with]`,
        ``
    ].join("\n");

    let themeDir = path.join(superfileConfigHome, "superfile", "theme");
    fs.mkdirSync(themeDir, {recursive: true});
    fs.writeFileSync(path.join(superfileConfigHome, "superfile", "config.toml"), configToml);
    fs.writeFileSync(path.join(themeDir, "edex.toml"), themeToml);
}

app.on('ready', async () => {
    signale.pending(`Loading settings file...`);
    let settings = require(settingsFile);
    signale.pending(`Resolving shell path...`);
    settings.shell = await which(settings.shell).catch(e => { throw(e) });
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);

    if (!require("fs").existsSync(settings.cwd)) throw new Error("Configured cwd path does not exist.");

    // See #366
    let cleanEnv = await require("shell-env")(settings.shell).catch(e => { throw e; });

    Object.assign(cleanEnv, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "eDEX-UI",
        TERM_PROGRAM_VERSION: app.getVersion()
    }, settings.env);

    if (spfBin) {
        try {
            let activeTheme = require(path.join(themesDir, `${settings.theme}.json`));
            generateSuperfileFiles(activeTheme);
        } catch(e) {
            signale.warn(`Could not generate superfile theme, falling back to its default: ${e.message}`);
        }
    }
    let shellInit = getShellInit(settings.shell, settings.shellArgs, lsdBin, spfBin);

    signale.pending(`Creating new terminal process on port ${settings.port || '3000'}`);
    tty = new Terminal({
        role: "server",
        shell: settings.shell,
        params: (shellInit && shellInit.params) || settings.shellArgs || '',
        cwd: settings.cwd,
        env: Object.assign({}, cleanEnv, (shellInit && shellInit.env) || {}),
        port: settings.port || 3000
    });
    signale.success(`Terminal back-end initialized!`);
    tty.onclosed = (code, signal) => {
        tty.ondisconnected = () => {};
        signale.complete("Terminal exited", code, signal);
        app.quit();
    };
    tty.onopened = () => {
        signale.success("Connected to frontend!");
        signale.timeEnd("Startup");
    };
    tty.onresized = (cols, rows) => {
        signale.info("Resized TTY to ", cols, rows);
    };
    tty.ondisconnected = () => {
        signale.error("Lost connection to frontend");
        signale.watch("Waiting for frontend connection...");
    };

    // Support for multithreaded systeminformation calls
    signale.pending("Starting multithreaded calls controller...");
    require("./_multithread.js");

    createWindow(settings);

    // Support for more terminals, used for creating tabs (currently limited to 4 extra terms)
    extraTtys = {};
    let basePort = settings.port || 3000;
    basePort = Number(basePort) + 2;

    for (let i = 0; i < 4; i++) {
        extraTtys[basePort+i] = null;
    }

    ipc.on("ttyspawn", (e, arg) => {
        let port = null;
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] === null && port === null) {
                extraTtys[key] = {};
                port = key;
            }
        });

        if (port === null) {
            signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
            e.sender.send("ttyspawn-reply", "ERROR: max number of ttys reached");
        } else {
            signale.pending(`Creating new TTY process on port ${port}`);
            let term = new Terminal({
                role: "server",
                shell: settings.shell,
                params: (shellInit && shellInit.params) || settings.shellArgs || '',
                cwd: tty.tty._cwd || settings.cwd,
                env: Object.assign({}, cleanEnv, (shellInit && shellInit.env) || {}),
                port: port
            });
            signale.success(`New terminal back-end initialized at ${port}`);
            term.onclosed = (code, signal) => {
                term.ondisconnected = () => {};
                term.wss.close();
                signale.complete(`TTY exited at ${port}`, code, signal);
                extraTtys[term.port] = null;
                term = null;
            };
            term.onopened = pid => {
                signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
            };
            term.onresized = () => {};
            term.ondisconnected = () => {
                term.onclosed = () => {};
                term.close();
                term.wss.close();
                extraTtys[term.port] = null;
                term = null;
            };

            extraTtys[port] = term;
            e.sender.send("ttyspawn-reply", "SUCCESS: "+port);
        }
    });

    // Backend support for theme and keyboard hotswitch
    let themeOverride = null;
    let kbOverride = null;
    ipc.on("getThemeOverride", (e, arg) => {
        e.sender.send("getThemeOverride", themeOverride);
    });
    ipc.on("getKbOverride", (e, arg) => {
        e.sender.send("getKbOverride", kbOverride);
    });
    ipc.on("setThemeOverride", (e, arg) => {
        themeOverride = arg;
    });
    ipc.on("setKbOverride", (e, arg) => {
        kbOverride = arg;
    });
});

app.on('web-contents-created', (e, contents) => {
    // Prevent creating more than one window
    contents.on('new-window', (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });

    // Prevent loading something else than the UI
    contents.on('will-navigate', (e, url) => {
        if (url !== contents.getURL()) e.preventDefault();
    });
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
    tty.close();
    Object.keys(extraTtys).forEach(key => {
        if (extraTtys[key] !== null) {
            extraTtys[key].close();
        }
    });
    signale.complete("Shutting down...");
});
