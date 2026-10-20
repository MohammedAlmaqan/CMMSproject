// ============================================================
// Equipment Form — create and edit master data (G4)
//
// Covers the equipmentCreateSchema / equipmentUpdateSchema field set.
// POST /equipment and PUT /equipment/{id} are both authorizeMinRole('Technician'),
// so the caller decides which role floor applies to the call site; this
// component only renders and submits.
// ============================================================

import { useState } from 'react';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { equipmentService } from '@/services/equipmentService';
import { ApiError } from '@/lib/api';
import type { Equipment, FunctionalLocation } from '@/types';

interface EquipmentFormProps {
  locations: FunctionalLocation[];
  /** Absent = create mode. Present = edit mode (fields prefilled). */
  initial?: Equipment | null;
  onCancel: () => void;
  onSaved: (equipment: Equipment) => void;
}

const inputCls =
  'px-2 py-1.5 rounded text-sm text-primary outline-none border border-subtle focus:border-highlight w-full';
const labelCls = 'flex flex-col gap-1 text-xs text-secondary';

const CRITICALITIES = ['S', 'A', 'B', 'C'] as const;
const STATUSES = ['Active', 'Inactive', 'Decommissioned'] as const;

export default function EquipmentForm({
  locations,
  initial,
  onCancel,
  onSaved,
}: EquipmentFormProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    equipmentCode: initial?.equipmentCode ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    functionalLocationId: initial?.functionalLocationId ?? '',
    equipmentClass: initial?.equipmentClass ?? '',
    criticality: initial?.criticality ?? 'B',
    manufacturer: initial?.manufacturer ?? '',
    model: initial?.model ?? '',
    serialNumber: initial?.serialNumber ?? '',
    assetTag: initial?.assetTag ?? '',
    installationDate: initial?.installationDate ? initial.installationDate.slice(0, 10) : '',
    warrantyExpiryDate: initial?.warrantyExpiryDate ? initial.warrantyExpiryDate.slice(0, 10) : '',
    operationalStatus: initial?.operationalStatus ?? 'Active',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        equipmentCode: form.equipmentCode.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        functionalLocationId: form.functionalLocationId,
        equipmentClass: form.equipmentClass.trim(),
        criticality: form.criticality,
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        assetTag: form.assetTag.trim(),
        installationDate: form.installationDate || null,
        warrantyExpiryDate: form.warrantyExpiryDate || null,
        operationalStatus: form.operationalStatus,
      };
      const saved = isEdit
        ? await equipmentService.update(initial!.equipmentId, payload)
        : await equipmentService.create(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="industrial-card rounded p-4 mb-4 space-y-3">
      <h3 className="text-primary text-sm font-semibold flex items-center gap-2">
        {isEdit ? (
          <>
            <Pencil className="w-4 h-4 text-amber" /> Edit Equipment — {initial!.equipmentCode}
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 text-amber" /> New Equipment
          </>
        )}
      </h3>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <label className={labelCls}>
          Equipment Code
          <input
            value={form.equipmentCode}
            onChange={(e) => setForm({ ...form, equipmentCode: e.target.value })}
            required
            aria-label="Equipment code"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            aria-label="Equipment name"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Description
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            aria-label="Equipment description"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Functional Location
          <select
            value={form.functionalLocationId}
            onChange={(e) => setForm({ ...form, functionalLocationId: e.target.value })}
            required
            aria-label="Equipment functional location"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          >
            <option value="">Select...</option>
            {locations.map((loc) => (
              <option key={loc.functionalLocationId} value={loc.functionalLocationId}>
                {loc.locationCode} — {loc.description}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Class
          <input
            value={form.equipmentClass}
            onChange={(e) => setForm({ ...form, equipmentClass: e.target.value })}
            aria-label="Equipment class"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Criticality
          <select
            value={form.criticality}
            onChange={(e) => setForm({ ...form, criticality: e.target.value as Equipment['criticality'] })}
            aria-label="Equipment criticality"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          >
            {CRITICALITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Manufacturer
          <input
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            aria-label="Equipment manufacturer"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Model
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            aria-label="Equipment model"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Serial Number
          <input
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            aria-label="Equipment serial number"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Asset Tag
          <input
            value={form.assetTag}
            onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
            aria-label="Equipment asset tag"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Installation Date
          <input
            type="date"
            value={form.installationDate}
            onChange={(e) => setForm({ ...form, installationDate: e.target.value })}
            aria-label="Equipment installation date"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Warranty Expiry
          <input
            type="date"
            value={form.warrantyExpiryDate}
            onChange={(e) => setForm({ ...form, warrantyExpiryDate: e.target.value })}
            aria-label="Equipment warranty expiry"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          />
        </label>
        <label className={labelCls}>
          Operational Status
          <select
            value={form.operationalStatus}
            onChange={(e) => setForm({ ...form, operationalStatus: e.target.value as Equipment['operationalStatus'] })}
            aria-label="Equipment operational status"
            className={inputCls}
            style={{ backgroundColor: '#27272A' }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-amber font-medium disabled:opacity-50"
          style={{ color: '#111113' }}
        >
          {submitting ? (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving...
            </span>
          ) : isEdit ? (
            'Save Changes'
          ) : (
            'Create Equipment'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-subtle text-secondary hover:text-primary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
