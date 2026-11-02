import Foundation
import Capacitor
import Photos
import UIKit

@objc(PhotoDayPlugin)
public class PhotoDayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoDayPlugin"
    public let jsName = "PhotoDay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPhotosForDate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getFullPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releasePhotos", returnType: CAPPluginReturnPromise),
    ]

    private let imageManager = PHCachingImageManager()
    private let pageSize = 50
    private var cacheRoot: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("goodDaysPhotos", isDirectory: true)
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["photos": permissionString(PHPhotoLibrary.authorizationStatus(for: .readWrite))])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(["photos": self.permissionString(status)])
        }
    }

    private func permissionString(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    private func cacheDirectory(_ name: String) throws -> URL {
        let directory = cacheRoot.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    @objc func getPhotosForDate(_ call: CAPPluginCall) {
        guard let dateString = call.getString("date") else {
            call.reject("Missing 'date' parameter (YYYY-MM-DD)")
            return
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        formatter.isLenient = false
        guard let startOfDay = formatter.date(from: dateString), formatter.string(from: startOfDay) == dateString else {
            call.reject("Invalid date format. Use YYYY-MM-DD.")
            return
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            call.reject("Failed to compute end of day")
            return
        }
        let fetchOptions = PHFetchOptions()
        fetchOptions.predicate = NSPredicate(format: "creationDate >= %@ AND creationDate < %@", startOfDay as NSDate, endOfDay as NSDate)
        fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        let assets = PHAsset.fetchAssets(with: .image, options: fetchOptions)
        let offset = min(max(0, call.getInt("offset") ?? 0), assets.count)
        let end = min(offset + pageSize, assets.count)
        guard offset < end else {
            call.resolve(["photos": [], "hasMore": false, "nextOffset": end])
            return
        }
        let tempDir: URL
        do { tempDir = try cacheDirectory("thumbs") }
        catch { call.reject("Failed to create photo cache"); return }

        let options = PHImageRequestOptions()
        options.isSynchronous = false
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        let group = DispatchGroup()
        let lock = NSLock()
        var results: [Int: [String: String]] = [:]
        var completed = Set<Int>()
        for index in offset..<end {
            let asset = assets.object(at: index)
            group.enter()
            imageManager.requestImage(for: asset, targetSize: CGSize(width: 200, height: 200), contentMode: .aspectFill, options: options) { image, info in
                if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
                lock.lock()
                let isFirst = completed.insert(index).inserted
                lock.unlock()
                guard isFirst else { return }
                defer { group.leave() }
                guard let image = image, let data = image.jpegData(compressionQuality: 0.7) else { return }
                let path = tempDir.appendingPathComponent("\(UUID().uuidString).jpg")
                do {
                    try data.write(to: path, options: .atomic)
                    lock.lock()
                    results[index] = ["id": asset.localIdentifier, "thumbnailPath": path.absoluteString]
                    lock.unlock()
                } catch {
                    // The remaining assets are still returned if one thumbnail fails.
                }
            }
        }
        group.notify(queue: .main) {
            let sorted = (offset..<end).compactMap { results[$0] }
            call.resolve(["photos": sorted, "hasMore": end < assets.count, "nextOffset": end])
        }
    }

    @objc func getFullPhoto(_ call: CAPPluginCall) {
        guard let assetId = call.getString("id") else {
            call.reject("Missing 'id' parameter")
            return
        }
        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
        guard let asset = fetchResult.firstObject else { call.reject("Photo not found"); return }
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = true
        options.isSynchronous = false
        // Uploads are compressed to 1200px in JavaScript; previews need no original-size export.
        imageManager.requestImage(for: asset, targetSize: CGSize(width: 1600, height: 1600), contentMode: .aspectFit, options: options) { image, info in
            if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
            guard let image = image, let data = image.jpegData(compressionQuality: 0.9) else {
                call.reject("Failed to export photo")
                return
            }
            do {
                let directory = try self.cacheDirectory("exports")
                let path = directory.appendingPathComponent("\(UUID().uuidString).jpg")
                try data.write(to: path, options: .atomic)
                call.resolve(["filePath": path.absoluteString])
            } catch { call.reject("Failed to write full photo: \(error.localizedDescription)") }
        }
    }

    @objc func releasePhotos(_ call: CAPPluginCall) {
        let rootPath = cacheRoot.standardizedFileURL.resolvingSymlinksInPath().path + "/"
        for path in call.getArray("filePaths", String.self) ?? [] {
            guard let url = URL(string: path), url.isFileURL else { continue }
            let candidate = url.standardizedFileURL.resolvingSymlinksInPath()
            // Never remove a device-library asset or anything outside our own JPEG cache.
            guard candidate.path.hasPrefix(rootPath), candidate.pathExtension.lowercased() == "jpg" else { continue }
            try? FileManager.default.removeItem(at: candidate)
        }
        call.resolve()
    }
}
