import SwiftRs
import Tauri
import UIKit
import WebKit

// `name` matches a key under CFBundleIcons.CFBundleAlternateIcons in
// project.yml ("Calculator" | "Notes" | "Weather"); nil/omitted restores the
// primary "Free Grind" icon. There is deliberately no equivalent for the
// app's *name* — CFBundleDisplayName can't be changed at runtime, only the
// icon (see setAlternateIconName below).
class SetAlternateIconArgs: Decodable {
    let name: String?
}

class AppDisguisePlugin: Plugin {
    @objc public func setAlternateIcon(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SetAlternateIconArgs.self)

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                // Older/unsupported configuration — treat as a silent no-op
                // rather than an error, same as the Android side falling
                // back to the default identity when disguises aren't
                // available.
                invoke.resolve()
                return
            }

            UIApplication.shared.setAlternateIconName(args.name) { error in
                if let error = error {
                    invoke.reject(error.localizedDescription)
                } else {
                    invoke.resolve()
                }
            }
        }
    }
}

@_cdecl("init_plugin_ios_app_disguise")
func initPlugin() -> Plugin {
    return AppDisguisePlugin()
}
