import { emptyWorkspace, normalizeWorkspace, versionOf, workspaceKey } from './workspaceData.ts';
import type { WorkspaceData } from './workspaceData.ts';

export type CloudDocument = Record<string, any> | null;
export type SaveStatus = 'loading' | 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
export interface SyncView { data: WorkspaceData; status: SaveStatus; editable: boolean; message: string }
export interface SyncAdapter {
  watch: (uid: string, next: (raw: CloudDocument) => void, error: (error: Error) => void) => () => void;
  save: (uid: string, data: WorkspaceData, expectedVersion: string) => Promise<Record<string, any>>;
}

// One instance belongs to exactly one account for its entire lifetime.
export class WorkspaceSync {
  uid: string | null;
  storage: Storage;
  adapter: SyncAdapter;
  notify: (view: SyncView) => void;
  view: SyncView;
  baseline = 'null';
  dirty = false;
  alive = true;
  initialized = false;
  inFlight = false;
  pendingRemote: CloudDocument | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  unsubscribe: (() => void) | undefined;
  delay: number;
  cacheUnreadable = false;

  constructor(uid: string | null, storage: Storage, adapter: SyncAdapter, notify: (view: SyncView) => void, delay = 800) {
    this.uid = uid; this.storage = storage; this.adapter = adapter; this.notify = notify; this.delay = delay;
    this.view = { data: emptyWorkspace(), status: uid ? 'loading' : 'idle', editable: !uid, message: '' };
    try {
      const cache = storage.getItem(workspaceKey(uid));
      if (cache) {
        const parsed = JSON.parse(cache);
        this.view.data = normalizeWorkspace(parsed.data);
        this.baseline = parsed.baseVersion || 'null';
        this.dirty = !!parsed.dirty;
      }
    } catch {
      this.cacheUnreadable = true;
      this.view = { ...this.view, status: 'error', editable: false, message: '本機快取無法讀取，已停止覆寫。請先下載原始快取備份。' };
    }
  }

  emit(patch: Partial<SyncView> = {}) {
    if (!this.alive) return;
    this.view = { ...this.view, ...patch };
    this.notify(this.view);
  }

  persist() {
    try {
      this.storage.setItem(workspaceKey(this.uid), JSON.stringify({ data: this.view.data, dirty: this.dirty, baseVersion: this.baseline, savedAt: Date.now() }));
      return true;
    } catch {
      this.emit({ status: 'error', editable: false, message: '本機備份空間不足，已暫停同步。請先下載目前資料備份。' });
      return false;
    }
  }

  archive() {
    // Keep a dated recovery copy before replacing a draft or accepting a server update.
    try {
      const raw = this.storage.getItem(workspaceKey(this.uid));
      this.storage.setItem(`${workspaceKey(this.uid)}:backup:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        this.cacheUnreadable && raw !== null ? raw : JSON.stringify({ data: this.view.data, baseVersion: this.baseline, dirty: this.dirty }));
      this.cacheUnreadable = false;
      return true;
    } catch {
      this.emit({ status: 'error', editable: false, message: '備份空間不足，已停止取代資料。請先下載備份並清理本機空間。' });
      return false;
    }
  }

  start() {
    this.emit();
    if (!this.uid) { if (this.cacheUnreadable) return; this.initialized = true; this.persist(); return; }
    this.unsubscribe = this.adapter.watch(this.uid, raw => this.receive(raw), error => {
      this.clearTimer();
      this.emit({ status: 'error', editable: false, message: `無法讀取此帳號的雲端資料，已停止寫入。${error.message}` });
    });
  }

  receive(raw: CloudDocument) {
    if (!this.alive) return;
    if (this.inFlight) { this.pendingRemote = raw; return; }
    try {
      const data = raw === null ? emptyWorkspace() : normalizeWorkspace(raw);
      const version = versionOf(raw);
      if (this.dirty && versionOf(this.view.data) !== versionOf(data)) {
        this.initialized = true;
        if (version !== this.baseline) {
          this.clearTimer();
          this.pendingRemote = raw;
          this.emit({ status: 'conflict', editable: false, message: '另一個裝置已有更新。這台裝置的未同步修改已保留，請先下載備份，再載入雲端版本。' });
          return;
        }
        this.emit({ status: 'pending', editable: true, message: '' });
        this.schedule();
        return;
      }
      if ((this.cacheUnreadable || (!this.initialized && versionOf(this.view.data) !== versionOf(data))) && !this.archive()) return;
      this.dirty = false;
      this.baseline = version;
      this.initialized = true;
      this.view = { data, status: 'saved', editable: true, message: '' };
      if (this.persist()) this.emit();
    } catch (error) {
      this.emit({ status: 'error', editable: false, message: error instanceof Error ? error.message : '資料讀取失敗' });
    }
  }

  update(updater: (data: WorkspaceData) => WorkspaceData) {
    if (!this.alive || !this.view.editable || !this.initialized) return;
    const data = normalizeWorkspace(updater(this.view.data));
    if (versionOf(data) === versionOf(this.view.data)) return;
    this.dirty = !!this.uid;
    this.view = { ...this.view, data, status: this.uid ? 'pending' : 'idle' };
    if (!this.persist()) return;
    this.emit();
    this.schedule();
  }

  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  schedule() {
    this.clearTimer();
    if (this.uid && this.dirty && !this.inFlight && this.view.editable) this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  async flush() {
    if (!this.uid || !this.alive || !this.initialized || !this.dirty || this.inFlight || !this.view.editable) return;
    this.clearTimer();
    const sent = this.view.data;
    const previousVersion = this.baseline;
    this.inFlight = true;
    this.emit({ status: 'saving' });
    try {
      const stored = await this.adapter.save(this.uid, sent, previousVersion);
      if (!this.alive) return;
      this.baseline = versionOf(stored);
      this.dirty = versionOf(this.view.data) !== versionOf(sent);
      this.inFlight = false;
      if (!this.persist()) return;
      this.emit({ status: this.dirty ? 'pending' : 'saved', message: '' });
      const pending = this.pendingRemote;
      this.pendingRemote = undefined;
      if (pending !== undefined && versionOf(pending) !== previousVersion) this.receive(pending);
      this.schedule();
    } catch (error) {
      if (!this.alive) return;
      this.inFlight = false;
      this.persist();
      this.emit({ status: (error as any)?.code === 'sync/conflict' ? 'conflict' : 'error', editable: false,
        message: (error as any)?.code === 'sync/conflict' ? '雲端資料已變更，已攔截覆蓋並保留本機修改。請下載備份後載入雲端版本。' : '同步未完成，本機修改已保留。請檢查連線後重試。' });
    }
  }

  reloadFromCloud(discardDraft = false) {
    if (this.inFlight) return;
    if (discardDraft) { if (!this.archive()) return; this.dirty = false; }
    this.unsubscribe?.(); this.clearTimer(); this.pendingRemote = undefined;
    this.initialized = false;
    this.emit({ status: 'loading', editable: false, message: '' });
    this.start();
  }

  stop() {
    this.alive = false;
    this.clearTimer();
    this.unsubscribe?.();
  }
}
