"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  addActivity,
  addEvidenceRecord,
  getEvidenceLog,
  removeEvidenceRecord,
  type EvidenceRecord,
  type EvidenceType,
} from "../lib/storage";

type FormState = {
  type: EvidenceType;
  itemName: string;
  referenceName: string;
  date: string;
  notes: string;
  imageDataUrl: string;
};

const TARGET_IMAGE_BYTES = 480_000;
const MAX_IMAGE_EDGE = 1600;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function loadImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read image"));
    image.src = objectUrl;
  });
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromObjectUrl(objectUrl);

    const longestEdge = Math.max(image.width, image.height);
    const baseScale = longestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longestEdge : 1;

    let scale = baseScale;
    let quality = 0.86;
    let attempts = 0;
    let dataUrl = "";

    while (attempts < 6) {
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas not available");
      }

      context.drawImage(image, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);

      if (estimateDataUrlBytes(dataUrl) <= TARGET_IMAGE_BYTES) {
        return dataUrl;
      }

      if (quality > 0.5) {
        quality -= 0.08;
      } else {
        scale *= 0.86;
      }

      attempts += 1;
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function EvidencePage() {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    type: "RECEIVED",
    itemName: "",
    referenceName: "",
    date: todayIsoDate(),
    notes: "",
    imageDataUrl: "",
  });

  useEffect(() => {
    setRecords(getEvidenceLog());
  }, []);

  const onImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    void (async () => {
      try {
        const compressed = await compressImageToDataUrl(file);
        if (!compressed) {
          setError("Could not process this image. Please try another photo.");
          return;
        }
        setForm((current) => ({ ...current, imageDataUrl: compressed }));
        setError(null);
      } catch {
        setError("Could not process this image. Please try another photo.");
      }
    })();
  };

  const resetForm = () => {
    setForm({
      type: "RECEIVED",
      itemName: "",
      referenceName: "",
      date: todayIsoDate(),
      notes: "",
      imageDataUrl: "",
    });
  };

  const saveRecord = () => {
    if (!form.itemName.trim() || !form.referenceName.trim() || !form.imageDataUrl) {
      setError("Item, reference name, and photo are required.");
      return;
    }

    setIsSaving(true);
    const updated = addEvidenceRecord({
      type: form.type,
      itemName: form.itemName.trim(),
      referenceName: form.referenceName.trim(),
      date: form.date || todayIsoDate(),
      notes: form.notes.trim(),
      imageDataUrl: form.imageDataUrl,
    });

    const verb = form.type === "RECEIVED" ? "received" : "used";
    addActivity(`Logged evidence: ${form.itemName.trim()} ${verb} (${form.referenceName.trim()})`);

    setRecords(updated);
    setError(null);
    setIsSaving(false);
    resetForm();
  };

  const deleteRecord = (id: number) => {
    const target = records.find((record) => record.id === id);
    const updated = removeEvidenceRecord(id);
    setRecords(updated);

    if (target) {
      addActivity(`Removed evidence record for ${target.itemName}`);
    }
  };

  const isReceived = form.type === "RECEIVED";

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Evidence Log</h1>
        <p className="mt-1 text-slate-600">
          Track delivery checks and consumable usage with photo proof for admin review.
        </p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, type: "RECEIVED" }))}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              isReceived
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Ordered + Received
          </button>
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, type: "USED" }))}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              !isReceived
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
            }`}
          >
            Consumable Used
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.itemName}
            onChange={(e) => setForm((current) => ({ ...current, itemName: e.target.value }))}
            placeholder="Item name"
            className="w-full rounded-2xl px-4 py-3 text-slate-900"
          />
          <input
            value={form.referenceName}
            onChange={(e) => setForm((current) => ({ ...current, referenceName: e.target.value }))}
            placeholder={isReceived ? "Delivery name / reference" : "Job name"}
            className="w-full rounded-2xl px-4 py-3 text-slate-900"
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
            className="w-full rounded-2xl px-4 py-3 text-slate-900"
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onImageUpload}
            className="w-full rounded-2xl px-4 py-3 text-slate-900"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="file"
            accept="image/*"
            onChange={onImageUpload}
            className="w-full rounded-2xl px-4 py-3 text-slate-900"
          />
          <p className="self-center text-sm text-slate-600">
            Use the first picker for direct camera capture on mobile, or the second to choose from gallery/files.
          </p>
        </div>

        <textarea
          value={form.notes}
          onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
          placeholder="Optional notes"
          rows={3}
          className="w-full rounded-2xl px-4 py-3 text-slate-900"
        />

        {form.imageDataUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 w-fit">
            <img src={form.imageDataUrl} alt="Preview" className="h-36 w-auto rounded-xl object-cover" />
          </div>
        ) : null}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}

        <button
          type="button"
          onClick={saveRecord}
          disabled={isSaving}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-white font-semibold transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save evidence record"}
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Recent Evidence</h2>
        {records.length === 0 ? (
          <div className="glass-card p-5 text-slate-500">No evidence logged yet.</div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="glass-card p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex gap-4">
                <img
                  src={record.imageDataUrl}
                  alt={`${record.itemName} evidence`}
                  className="h-20 w-20 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
                    {record.type === "RECEIVED" ? "Ordered + Received" : "Consumable Used"}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{record.itemName}</p>
                  <p className="text-sm text-slate-700">
                    {record.type === "RECEIVED" ? "Delivery" : "Job"}: {record.referenceName}
                  </p>
                  <p className="text-sm text-slate-500">Date: {record.date}</p>
                  {record.notes ? <p className="mt-1 text-sm text-slate-600">{record.notes}</p> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteRecord(record.id)}
                className="self-start rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
