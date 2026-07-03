const CLOUD_UPDATED_AT_PREFIX = "mgb-cloud-updated-at";
const LEGACY_CLOUD_UPDATED_AT_KEY = "mgb-cloud-updated-at";

const STORAGE_KEYS = [
  "mgb-products",
  "mgb-inventory",
  "mgb-orders",
  "mgb-suppliers",
  "mgb-transactions",
  "mgb-activity-log",
] as const;

type Snapshot = Record<(typeof STORAGE_KEYS)[number], unknown[]>;

type RemoteRow = {
  id: string;
  payload: Snapshot;
  updated_at: string;
};

let bootstrapPromise: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 8000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function hasConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function getNamespace() {
  return (
    process.env.NEXT_PUBLIC_SYNC_NAMESPACE ||
    process.env.NEXT_PUBLIC_SNAPSHOT_NAMESPACE ||
    "default"
  );
}

function getCloudUpdatedAtKey() {
  return `${CLOUD_UPDATED_AT_PREFIX}:${getNamespace()}`;
}

function readCloudUpdatedAt() {
  const namespaced = localStorage.getItem(getCloudUpdatedAtKey());
  const legacy = localStorage.getItem(LEGACY_CLOUD_UPDATED_AT_KEY);
  return Number(namespaced || legacy || "0");
}

function writeCloudUpdatedAt(value: number) {
  const asString = String(value);
  localStorage.setItem(getCloudUpdatedAtKey(), asString);
  // Keep legacy key in sync so existing installs migrate without odd timestamp jumps.
  localStorage.setItem(LEGACY_CLOUD_UPDATED_AT_KEY, asString);
}

function getHeaders() {
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function readArray(key: (typeof STORAGE_KEYS)[number]): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalSnapshot(): Snapshot {
  return STORAGE_KEYS.reduce((acc, key) => {
    acc[key] = readArray(key);
    return acc;
  }, {} as Snapshot);
}

function writeLocalSnapshot(snapshot: Snapshot) {
  for (const key of STORAGE_KEYS) {
    localStorage.setItem(key, JSON.stringify(snapshot[key] || []));
  }

  window.dispatchEvent(new Event("mgb-storage-updated"));
}

function hasData(snapshot: Snapshot) {
  return STORAGE_KEYS.some((key) => (snapshot[key] || []).length > 0);
}

async function getRemoteRow(): Promise<RemoteRow | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  const namespace = encodeURIComponent(getNamespace());
  const url = `${baseUrl}/rest/v1/app_state?id=eq.${namespace}&select=id,payload,updated_at&limit=1`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud read failed (${response.status}): ${text}`);
  }

  const rows = (await response.json()) as RemoteRow[];
  return rows[0] || null;
}

async function upsertRemoteSnapshot(snapshot: Snapshot) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return;

  const body = {
    id: getNamespace(),
    payload: snapshot,
    updated_at: new Date().toISOString(),
  };

  const response = await fetchWithTimeout(`${baseUrl}/rest/v1/app_state`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud write failed (${response.status}): ${text}`);
  }

  writeCloudUpdatedAt(Date.now());
}

export async function pullCloudSnapshot() {
  if (typeof window === "undefined" || !hasConfig()) return;

  const remote = await getRemoteRow();
  if (!remote?.payload || !hasData(remote.payload)) return;

  const localSnapshot = readLocalSnapshot();
  const localHasData = hasData(localSnapshot);
  const remoteTs = Date.parse(remote.updated_at || "");
  const localTs = readCloudUpdatedAt();

  if (!localHasData || !localTs || remoteTs >= localTs) {
    writeLocalSnapshot(remote.payload);
    writeCloudUpdatedAt(remoteTs || Date.now());
  }
}

export async function bootstrapCloudSync() {
  if (typeof window === "undefined" || !hasConfig()) return;

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        const remote = await getRemoteRow();
        const localSnapshot = readLocalSnapshot();

        if (remote?.payload && hasData(remote.payload)) {
          const localHasData = hasData(localSnapshot);
          const remoteTs = Date.parse(remote.updated_at || "");
          const localTs = readCloudUpdatedAt();

          if (!localHasData || !localTs || remoteTs >= localTs) {
            writeLocalSnapshot(remote.payload);
            writeCloudUpdatedAt(remoteTs || Date.now());
            return;
          }
        }

        if (hasData(localSnapshot)) {
          await upsertRemoteSnapshot(localSnapshot);
        }
      } catch (error) {
        console.error(error);
        // Keep the app usable offline/local-only when cloud sync is unavailable.
      }
    })();
  }

  return bootstrapPromise;
}

export function queueCloudSync() {
  if (typeof window === "undefined" || !hasConfig()) return;

  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    const snapshot = readLocalSnapshot();
    void upsertRemoteSnapshot(snapshot).catch((error) => {
      console.error(error);
    });
  }, 1200);
}
