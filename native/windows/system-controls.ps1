$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
$source = @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Windows.Media;
using Windows.Media.Playback;

public sealed class ShravanamSystemControls : Form {
    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
    private static readonly object outputLock = new object();
    private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
    private readonly Dictionary<int, string> shortcuts = new Dictionary<int, string>();
    private readonly MediaPlayer mediaPlayer;
    private readonly SystemMediaTransportControls controls;
    private string lastTitle = null;
    private bool disposing = false;

    private static void Emit(object message) {
        lock (outputLock) { Console.WriteLine(new JavaScriptSerializer().Serialize(message)); Console.Out.Flush(); }
    }

    public ShravanamSystemControls() {
        SetCurrentProcessExplicitAppUserModelID("org.karatala.shravanam");
        this.Text = "Shravanam";
        this.ShowInTaskbar = false;
        this.FormBorderStyle = FormBorderStyle.FixedToolWindow;
        this.Opacity = 0;
        IntPtr windowHandle = this.Handle;
        this.mediaPlayer = new MediaPlayer();
        this.mediaPlayer.CommandManager.IsEnabled = false;
        this.controls = this.mediaPlayer.SystemMediaTransportControls;
        this.controls.IsEnabled = false;
        this.controls.IsPlayEnabled = true;
        this.controls.IsPauseEnabled = true;
        this.controls.IsStopEnabled = true;
        this.controls.IsNextEnabled = true;
        this.controls.IsPreviousEnabled = true;
        this.controls.IsFastForwardEnabled = true;
        this.controls.IsRewindEnabled = true;
        this.controls.ButtonPressed += (sender, args) => Emit(new { type = "action", action = args.Button.ToString().ToLowerInvariant() });
        this.controls.PlaybackPositionChangeRequested += (sender, args) => Emit(new { type = "action", action = "seek", position = args.RequestedPlaybackPosition.TotalSeconds });
        this.controls.PlaybackRateChangeRequested += (sender, args) => Emit(new { type = "action", action = "speed", value = args.RequestedPlaybackRate });
        this.FormClosed += (sender, args) => this.Release();
        var inputThread = new Thread(this.ReadInput);
        inputThread.IsBackground = true;
        inputThread.Start();
        Emit(new { type = "ready" });
    }

    protected override void SetVisibleCore(bool value) { base.SetVisibleCore(false); }

    private void ReadInput() {
        try {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Length > 65536) continue;
                string received = line;
                this.BeginInvoke(new Action(() => this.HandleLine(received)));
            }
        } catch (Exception) { }
        try { this.BeginInvoke(new Action(this.Close)); } catch (Exception) { }
    }

    private static double Number(Dictionary<string, object> input, string name, double fallback) {
        object value;
        if (!input.TryGetValue(name, out value)) return fallback;
        double number;
        if (!double.TryParse(Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out number) || double.IsInfinity(number) || double.IsNaN(number)) return fallback;
        return number;
    }

    private void HandleLine(string line) {
        if (this.disposing) return;
        try {
            var input = this.serializer.Deserialize<Dictionary<string, object>>(line);
            string type = Convert.ToString(input["type"]);
            if (type == "quit") { this.Close(); return; }
            if (type == "configure") { this.Configure(input); return; }
            if (type != "state") return;
            bool available = input.ContainsKey("available") && Convert.ToBoolean(input["available"]);
            this.controls.IsEnabled = available;
            if (!available) {
                this.controls.PlaybackStatus = MediaPlaybackStatus.Closed;
                this.lastTitle = null;
                return;
            }
            string title = input.ContainsKey("title") ? Convert.ToString(input["title"]) : "Shravanam";
            if (title.Length > 300) title = title.Substring(0, 300);
            if (title != this.lastTitle) {
                this.controls.DisplayUpdater.Type = MediaPlaybackType.Music;
                this.controls.DisplayUpdater.MusicProperties.Title = title;
                this.controls.DisplayUpdater.MusicProperties.Artist = "Shravanam";
                this.controls.DisplayUpdater.Update();
                this.lastTitle = title;
            }
            bool paused = input.ContainsKey("paused") && Convert.ToBoolean(input["paused"]);
            this.controls.PlaybackStatus = paused ? MediaPlaybackStatus.Paused : MediaPlaybackStatus.Playing;
            this.controls.PlaybackRate = Math.Min(3, Math.Max(0.25, Number(input, "speed", 1)));
            double duration = Math.Max(0, Number(input, "duration", 0));
            double position = Math.Max(0, Number(input, "position", 0));
            if (duration > 0) position = Math.Min(position, duration);
            var timeline = new SystemMediaTransportControlsTimelineProperties();
            timeline.StartTime = TimeSpan.Zero;
            timeline.MinSeekTime = TimeSpan.Zero;
            timeline.EndTime = TimeSpan.FromSeconds(Math.Max(duration, position));
            timeline.MaxSeekTime = timeline.EndTime;
            timeline.Position = TimeSpan.FromSeconds(position);
            this.controls.UpdateTimelineProperties(timeline);
        } catch (Exception error) { Emit(new { type = "error", error = error.GetType().Name }); }
    }

    private void Configure(Dictionary<string, object> input) {
        foreach (int id in this.shortcuts.Keys) UnregisterHotKey(this.Handle, id);
        this.shortcuts.Clear();
        var registered = new List<object>();
        var entries = input.ContainsKey("shortcuts") ? input["shortcuts"] as ArrayList : null;
        if (entries != null) for (int idx = 0; idx < Math.Min(16, entries.Count); idx++) {
            var entry = entries[idx] as Dictionary<string, object>;
            if (entry == null) continue;
            string action = Convert.ToString(entry["action"]);
            if (action != "toggle" && action != "back" && action != "forward" && action != "open") continue;
            int id = 2000 + idx;
            uint modifiers = Convert.ToUInt32(entry["modifiers"]);
            uint key = Convert.ToUInt32(entry["virtualKey"]);
            bool success = key > 0 && key <= 255 && RegisterHotKey(this.Handle, id, modifiers | 0x4000, key);
            if (success) this.shortcuts.Add(id, action);
            registered.Add(new { action = action, key = Convert.ToString(entry["key"]), registered = success });
        }
        Emit(new { type = "configured", shortcuts = registered });
    }

    protected override void WndProc(ref Message message) {
        if (message.Msg == 0x0312) {
            string action;
            if (this.shortcuts.TryGetValue(message.WParam.ToInt32(), out action)) Emit(new { type = "action", action = action });
            return;
        }
        base.WndProc(ref message);
    }

    private void Release() {
        if (this.disposing) return;
        this.disposing = true;
        foreach (int id in this.shortcuts.Keys) UnregisterHotKey(this.Handle, id);
        this.shortcuts.Clear();
        this.controls.IsEnabled = false;
        this.mediaPlayer.Dispose();
    }

    [STAThread] public static void Run() {
        Application.EnableVisualStyles();
        Application.Run(new ShravanamSystemControls());
    }
}
'@
$framework = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$references = @(
    "$env:windir\System32\WinMetadata\Windows.Media.winmd",
    "$env:windir\System32\WinMetadata\Windows.Foundation.winmd",
    (Join-Path $framework 'System.Runtime.WindowsRuntime.dll'),
    [System.Reflection.Assembly]::Load('System.Runtime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a').Location,
    [System.Reflection.Assembly]::Load('System.Runtime.InteropServices.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a').Location,
    [System.Windows.Forms.Form].Assembly.Location,
    [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location,
    [System.Uri].Assembly.Location
)
$compiler = [System.CodeDom.Compiler.CompilerParameters]::new()
foreach ($reference in $references) { $null = $compiler.ReferencedAssemblies.Add($reference) }
Add-Type -TypeDefinition $source -CompilerParameters $compiler
[ShravanamSystemControls]::Run()
