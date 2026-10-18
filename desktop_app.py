"""Night City Office desktop app: starts whatever is missing (Ollama, LiteLLM proxy, dashboard),
then opens the dashboard in a native window. Falls back to an Edge --app window if pywebview can't run.
Run with .venv\\Scripts\\pythonw.exe so no console appears."""
import ctypes
import ctypes.wintypes
import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
OLLAMA_DIR = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "Ollama"
DASH_URL = "http://127.0.0.1:8080"
LAPTOP = os.environ.get("LAPTOP_OLLAMA", "192.168.x.x:11434")  # set LAPTOP_OLLAMA to your second Ollama host
STATE_FILE = ROOT / "desktop_app.json"
WAIT_SECONDS = 30
TITLE = "Night City Office"

NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW
# Hidden console that child processes inherit (DETACHED_PROCESS made the venv launcher's child open a visible
# console). Own process group so it outlives this app.
BACKGROUND = NO_WINDOW | 0x00000200  # | CREATE_NEW_PROCESS_GROUP

MB_YESNO, MB_YESNOCANCEL, MB_ICONQUESTION, MB_ICONERROR = 0x4, 0x3, 0x20, 0x10
MB_TOPMOST, MB_SETFOREGROUND, IDYES, IDCANCEL = 0x40000, 0x10000, 6, 2


def msgbox(text, flags):
    return ctypes.windll.user32.MessageBoxW(0, text, TITLE, flags | MB_TOPMOST | MB_SETFOREGROUND)


def answers(url, timeout=2):
    """True if anything HTTP answers at url (an error status still means the server is up)."""
    try:
        urllib.request.urlopen(url, timeout=timeout).close()
        return True
    except urllib.error.HTTPError:
        return True
    except OSError:
        return False


def powershell(command):
    return subprocess.run(["powershell", "-NoProfile", "-Command", command],
                          capture_output=True, text=True, creationflags=NO_WINDOW)


def start_ollama():
    app = OLLAMA_DIR / "ollama app.exe"
    if app.exists():
        subprocess.Popen([str(app)], creationflags=BACKGROUND)
    else:
        subprocess.Popen([str(OLLAMA_DIR / "ollama.exe"), "serve"], creationflags=BACKGROUND,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def start_proxy():
    state = powershell("(Get-ScheduledTask -TaskName 'LiteLLM Proxy' -ErrorAction Stop).State").stdout.strip()
    if not state:
        return "scheduled task 'LiteLLM Proxy' not found"
    if state != "Running":  # Running but not answering yet = still starting; don't start it twice
        result = powershell("Start-ScheduledTask -TaskName 'LiteLLM Proxy'")
        if result.returncode:
            return "Start-ScheduledTask failed: " + result.stderr.strip()[:120]


def start_dashboard():
    log = open(ROOT / "dashboard.log", "a", encoding="utf-8")
    log.write(f"\n--- started by desktop_app.py {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    log.flush()
    subprocess.Popen([str(PYTHON), "-m", "uvicorn", "dashboard.app:app", "--host", "127.0.0.1", "--port", "8080",
                      "--no-access-log", "--no-server-header"],
                     cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                     env={**os.environ, "PYTHONIOENCODING": "utf-8"}, creationflags=BACKGROUND)


PIECES = [  # (name, url that answers when it's up, how to start it)
    ("Ollama (PC)", "http://127.0.0.1:11434/api/tags", start_ollama),
    ("LiteLLM proxy", "http://127.0.0.1:4000/health/liveliness", start_proxy),
    ("Dashboard", DASH_URL + "/api/roles", start_dashboard),
]


def ensure(url, start):
    """Start the piece only if nothing answers at url, then wait for it. Returns (ok, message)."""
    if answers(url):
        return True, "OK (already running)"
    try:
        error = start()
    except Exception as e:
        return False, f"FAILED: could not start ({e})"
    if error:
        return False, "FAILED: " + error
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        if answers(url):
            return True, "OK (started)"
        time.sleep(1)
    return False, f"FAILED: not answering after {WAIT_SECONDS}s"


def stop_services():
    powershell(
        "$p = (Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue).OwningProcess;"
        "if ($p) { Stop-Process -Id ($p | Sort-Object -Unique) -Force -ErrorAction SilentlyContinue };"
        "Stop-ScheduledTask -TaskName 'LiteLLM Proxy' -ErrorAction SilentlyContinue;"
        "$p = (Get-NetTCPConnection -State Listen -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess;"
        "if ($p) { Stop-Process -Id ($p | Sort-Object -Unique) -Force -ErrorAction SilentlyContinue }")


def ask_stop(allow_cancel):
    """Returns 'stop', 'leave' or 'cancel'."""
    flags = (MB_YESNOCANCEL if allow_cancel else MB_YESNO) | MB_ICONQUESTION
    r = msgbox("Stop the dashboard and LiteLLM proxy?\n\nYes = stop them\nNo = leave them running", flags)
    return "cancel" if r == IDCANCEL else "stop" if r == IDYES else "leave"


def load_geometry():
    try:
        g = json.loads(STATE_FILE.read_text())
        w, h, x, y = int(g["width"]), int(g["height"]), int(g["x"]), int(g["y"])
    except (OSError, ValueError, KeyError, TypeError):
        return {"width": 1400, "height": 900}
    # Only reuse the position if its top-left area is still on a connected monitor.
    on_screen = ctypes.windll.user32.MonitorFromPoint(ctypes.wintypes.POINT(x + 40, y + 10), 0)
    return {"width": w, "height": h, **({"x": x, "y": y} if on_screen else {})}


def save_geometry(window):
    try:
        STATE_FILE.write_text(json.dumps({"width": window.width, "height": window.height,
                                          "x": window.x, "y": window.y}))
    except Exception:
        pass  # losing the saved size is not worth blocking the close


BANNER_JS = """(function (show) {
  var b = document.getElementById('nco-laptop-banner');
  if (!show) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div');
  b.id = 'nco-laptop-banner';
  b.textContent = 'Laptop Ollama (%s) is unreachable. Roles that run on the laptop will fail until it is back.';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 14px;background:#ff4f4f;' +
    'color:#0b0614;font:bold 15px sans-serif;text-align:center;box-shadow:0 2px 10px #000';
  document.body.appendChild(b);
})(%s);"""

SPLASH_HTML = """<!doctype html><html><body style="margin:0;background:#0b0614;color:#e8e0ff;font:15px Consolas,monospace">
<div style="padding:18px 22px"><div style="color:#05d9e8;font-size:18px;margin-bottom:12px">NIGHT CITY OFFICE</div>
%s<div id="foot" style="margin-top:12px;color:#8a7aa8">Starting…</div></div></body></html>"""


def splash_rows(names):
    return "".join(f'<div style="margin:4px 0">{n}: <span id="r{i}" style="color:#f5d300">waiting…</span></div>'
                   for i, n in enumerate(names))


def set_row(splash, i, text, color):
    splash.evaluate_js(f"var e=document.getElementById('r{i}');e.textContent={json.dumps(text)};"
                       f"e.style.color={json.dumps(color)};")


def run_webview():
    import webview

    names = [p[0] for p in PIECES] + ["Laptop Ollama"]
    splash = webview.create_window(TITLE + " - starting", html=SPLASH_HTML % splash_rows(names),
                                   width=460, height=250, resizable=False, background_color="#0b0614")

    def boot():
        dashboard_ok = True
        for i, (name, url, start) in enumerate(PIECES):
            set_row(splash, i, "checking…", "#f5d300")
            ok, message = ensure(url, start)
            set_row(splash, i, message, "#39ff88" if ok else "#ff4f4f")
            if name == "Dashboard":
                dashboard_ok = ok
        laptop_up = answers(f"http://{LAPTOP}/api/tags", timeout=3)
        set_row(splash, len(PIECES), "OK" if laptop_up else "UNREACHABLE (not started from here)",
                "#39ff88" if laptop_up else "#ff4f4f")
        if not dashboard_ok:
            splash.evaluate_js("document.getElementById('foot').textContent="
                               + json.dumps(r"Dashboard did not start. See C:\agents\dashboard.log. Close this window."))
            return
        time.sleep(0.8)
        open_main(laptop_up)
        splash.destroy()

    def open_main(laptop_up):
        state = {"laptop_up": laptop_up, "closing": False}
        main = webview.create_window(TITLE, DASH_URL, background_color="#0b0614", **load_geometry())

        def apply_banner():
            try:
                main.evaluate_js(BANNER_JS % (LAPTOP, "false" if state["laptop_up"] else "true"))
            except Exception:
                pass

        def watch_laptop():
            while not state["closing"]:
                time.sleep(60)
                state["laptop_up"] = answers(f"http://{LAPTOP}/api/tags", timeout=3)
                apply_banner()

        def on_closing():
            save_geometry(main)
            choice = ask_stop(allow_cancel=True)
            if choice == "cancel":
                return False
            state["closing"] = True
            if choice == "stop":
                stop_services()

        main.events.loaded += apply_banner
        main.events.closing += on_closing
        threading.Thread(target=watch_laptop, daemon=True).start()

    webview.start(boot, gui="edgechromium", icon=str(ROOT / "night_city_office.ico"))


def find_edge():
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if base and (exe := Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe").exists():
            return exe


def run_edge(reason):
    problems = []
    for name, url, start in PIECES:
        ok, message = ensure(url, start)
        if not ok:
            problems.append(f"{name}: {message}")
    if not answers(f"http://{LAPTOP}/api/tags", timeout=3):
        problems.append(f"Laptop Ollama ({LAPTOP}): unreachable")
    if not answers(DASH_URL + "/api/roles"):
        msgbox("Dashboard did not start. See C:\\agents\\dashboard.log.\n\n" + "\n".join(problems), MB_ICONERROR)
        return
    if problems:
        msgbox("Opening anyway, but:\n\n" + "\n".join(problems), MB_ICONERROR)
    edge = find_edge()
    if not edge:
        msgbox(f"pywebview failed ({reason}) and Microsoft Edge was not found.", MB_ICONERROR)
        return
    # Own profile folder = separate Edge instance, so wait() returns when this window closes.
    subprocess.Popen([str(edge), f"--app={DASH_URL}", f"--user-data-dir={ROOT / '.edge-app'}",
                      "--no-first-run"]).wait()
    if ask_stop(allow_cancel=False) == "stop":
        stop_services()


def already_running():
    """Hold a named mutex for this process's lifetime; if another copy holds it, raise its window and say so."""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    global _instance_mutex  # keep the handle alive until exit
    _instance_mutex = kernel32.CreateMutexW(None, False, "Local\\NightCityOfficeDesktopApp")
    if ctypes.get_last_error() != 183:  # ERROR_ALREADY_EXISTS
        return False
    user32 = ctypes.windll.user32
    hwnd = find_app_window()
    if hwnd:
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE; only when minimized, so a maximized window stays maximized
        user32.SetForegroundWindow(hwnd)
    return True


def find_app_window():
    """The other copy's main window (or its splash). Checks the class because other windows can share the
    title, e.g. a File Explorer tab named 'Night City Office'."""
    find = ctypes.windll.user32.FindWindowExW
    find.argtypes = [ctypes.wintypes.HWND, ctypes.wintypes.HWND, ctypes.wintypes.LPCWSTR, ctypes.wintypes.LPCWSTR]
    find.restype = ctypes.wintypes.HWND
    cls = ctypes.create_unicode_buffer(64)
    for title in (TITLE, TITLE + " - starting"):
        hwnd = None
        while hwnd := find(None, hwnd, None, title):
            ctypes.windll.user32.GetClassNameW(hwnd, cls, 64)
            if cls.value.startswith("WindowsForms10."):  # pywebview's WinForms window
                return hwnd


def main():
    if already_running():
        return
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("NightCityOffice")  # own taskbar icon
    try:
        run_webview()
    except Exception as e:
        run_edge(f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
