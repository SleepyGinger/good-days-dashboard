import Foundation
import Capacitor
import Security

@objc(SessionPlugin)
public class SessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionPlugin"
    public let jsName = "Session"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearRefreshToken", returnType: CAPPluginReturnPromise),
    ]

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.dansalazar.gooddays.session",
            kSecAttrAccount as String: "firebase-refresh-token",
        ]
    }

    @objc func getRefreshToken(_ call: CAPPluginCall) {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve([:])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Unable to read the saved sign-in session.")
            return
        }
        call.resolve(["refreshToken": token])
    }

    @objc func setRefreshToken(_ call: CAPPluginCall) {
        guard let token = call.getString("refreshToken"), !token.isEmpty,
              let data = token.data(using: .utf8) else {
            call.reject("A refresh token is required.")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            for (key, value) in attributes { item[key] = value }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            call.reject("Unable to save the sign-in session securely.")
            return
        }
        call.resolve()
    }

    @objc func clearRefreshToken(_ call: CAPPluginCall) {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Unable to clear the saved sign-in session.")
            return
        }
        call.resolve()
    }
}
