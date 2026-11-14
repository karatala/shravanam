import AppKit

// WebviewJS does not expose macOS open-document Apple events to Bun.
final class DocumentLauncher: NSObject, NSApplicationDelegate {
    private var host: Process?
    private var pending: [String] = []
    private var started = false

    private func runHost(_ files: [String], primary: Bool) {
        let process = Process()
        process.executableURL = Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("ShravanamHost")
        process.arguments = files
        if primary {
            self.host = process
            process.terminationHandler = { _ in DispatchQueue.main.async { NSApplication.shared.terminate(nil) } }
        }
        do { try process.run() }
        catch {
            let alert = NSAlert()
            alert.messageText = "Cannot start Shravanam / Не удалось открыть Shravanam"
            alert.informativeText = "Extract the complete application and open it again. / Распакуйте приложение целиком и откройте его снова."
            alert.runModal()
            NSApplication.shared.terminate(nil)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        self.started = true
        self.runHost(self.pending, primary: true)
        self.pending.removeAll()
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        if self.started { self.runHost(filenames, primary: false) }
        else { self.pending.append(contentsOf: filenames) }
        sender.reply(toOpenOrPrint: .success)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if self.started { self.runHost([], primary: false) }
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if let host = self.host, host.isRunning { host.terminate() }
        return .terminateNow
    }
}

let application = NSApplication.shared
let delegate = DocumentLauncher()
application.delegate = delegate
application.run()
