import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoUploadCoordinator, type PhotoUploadSnapshot } from "../src/lib/photoUploadCoordinator.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function draft() {
  let state: PhotoUploadSnapshot = { photoUrls: [], pending: false, error: null };
  const coordinator = createPhotoUploadCoordinator((next) => { state = next; });
  return { coordinator, state: () => state };
}

test("save cannot overtake a pending photo upload, even before React renders", async () => {
  const { coordinator, state } = draft();
  const file = deferred<string>();
  coordinator.beginDraft(["saved.jpg"]);
  const uploading = coordinator.upload([1], () => file.promise);
  assert.equal(state().pending, true);
  assert.throws(() => coordinator.getPhotosForSave(), /finish uploading/);
  file.resolve("uploaded.jpg");
  assert.equal(await uploading, true);
  assert.deepEqual(coordinator.getPhotosForSave(), ["saved.jpg", "uploaded.jpg"]);
  assert.equal(state().pending, false);
});

test("partial failures preserve every successful upload and expose a retry message", async () => {
  const { coordinator, state } = draft();
  const success = await coordinator.upload(["first", "failure", "last"], async (name) => {
    if (name === "failure") throw new Error("network interrupted");
    return `${name}.jpg`;
  });
  assert.equal(success, false);
  assert.deepEqual(coordinator.getPhotosForSave(), ["first.jpg", "last.jpg"]);
  assert.match(state().error ?? "", /1 photo could not be uploaded/);
  assert.equal(state().pending, false);
});

test("an old draft cannot append photos or clear a new draft's pending state", async () => {
  const { coordinator, state } = draft();
  const oldFile = deferred<string>();
  const newFile = deferred<string>();
  const oldUpload = coordinator.upload(["old"], () => oldFile.promise);
  coordinator.beginDraft(["other-day.jpg"]);
  const newUpload = coordinator.upload(["new"], () => newFile.promise);
  oldFile.resolve("wrong-day.jpg");
  assert.equal(await oldUpload, false);
  assert.deepEqual(state().photoUrls, ["other-day.jpg"]);
  assert.equal(state().pending, true);
  newFile.resolve("right-day.jpg");
  assert.equal(await newUpload, true);
  assert.deepEqual(coordinator.getPhotosForSave(), ["other-day.jpg", "right-day.jpg"]);
});

test("cancel or date change retains existing attachments and stops subsequent files", async () => {
  const { coordinator, state } = draft();
  coordinator.beginDraft(["existing.jpg"]);
  const file = deferred<string>();
  const calls: number[] = [];
  const uploading = coordinator.upload([1, 2], (item) => { calls.push(item); return file.promise; });
  coordinator.cancelPending();
  file.resolve("stale.jpg");
  assert.equal(await uploading, false);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(coordinator.getPhotosForSave(), ["existing.jpg"]);
  assert.equal(state().error, null);
});

test("a changed user/date identity rejects stale completion before a cancellation effect runs", async () => {
  const { coordinator, state } = draft();
  const file = deferred<string>();
  let current = true;
  const uploading = coordinator.upload([1], () => file.promise, () => current);
  current = false;
  file.resolve("wrong-user.jpg");
  assert.equal(await uploading, false);
  assert.deepEqual(coordinator.getPhotosForSave(), []);
  assert.equal(state().pending, false);
});

test("selection is capped at three and a concurrent batch cannot bypass that cap", async () => {
  const { coordinator } = draft();
  coordinator.beginDraft(["existing.jpg"]);
  const file = deferred<string>();
  const calls: number[] = [];
  const uploading = coordinator.upload([1, 2, 3], async (item) => {
    calls.push(item);
    return item === 1 ? file.promise : "second.jpg";
  });
  assert.equal(await coordinator.upload([4], async () => { throw new Error("must not start"); }), false);
  file.resolve("first.jpg");
  assert.equal(await uploading, true);
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(coordinator.getPhotosForSave(), ["existing.jpg", "first.jpg", "second.jpg"]);
});

test("cancelling during file preparation can prevent the remote upload entirely", async () => {
  const { coordinator } = draft();
  const preparation = deferred<void>();
  let remoteUploads = 0;
  const uploading = coordinator.upload([1], async (_item, isActive) => {
    await preparation.promise;
    if (!isActive()) throw new Error("Draft closed");
    remoteUploads += 1;
    return "photo.jpg";
  });
  coordinator.beginDraft();
  preparation.resolve();
  assert.equal(await uploading, false);
  assert.equal(remoteUploads, 0);
});
