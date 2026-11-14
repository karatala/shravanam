import json
import os
import shutil
import subprocess
from pathlib import Path

directory = Path(__file__).resolve().parent
executable = str(directory / "shravanam")
if not os.access(executable, os.X_OK):
    raise SystemExit("Cannot find the executable. Keep this script next to shravanam and run it again.")
if "\n" in executable or "\r" in executable:
    raise SystemExit("Cannot register this folder. Move the app to a folder without line breaks in its name.")
# Desktop Entry escaping, not shell escaping. Follow the Rachana registration pattern.
for source, target in [("\\", "\\\\\\\\"), ('"', '\\\\"'), ("`", "\\\\`"), ("$", "\\\\$"), ("%", "%%")]:
    executable = executable.replace(source, target)
mime_types = json.loads((directory / "file-types.json").read_text())
data_home = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
applications = data_home / "applications"
applications.mkdir(parents=True, exist_ok=True)
(applications / "org.karatala.shravanam.desktop").write_text(f'[Desktop Entry]\nType=Application\nName=Shravanam\nExec="{executable}" %F\nTerminal=false\nCategories=AudioVideo;Player;\nMimeType={";".join(mime_types)};\n')
updater = shutil.which("update-desktop-database")
if updater:
    subprocess.run([updater, str(applications)], check=True)
print("Shravanam is available in Open With. Keep this folder at its current location. Choose the default app in your file manager.")
