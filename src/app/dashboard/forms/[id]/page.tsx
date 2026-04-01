'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'number' | 'phone' | 'date';

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
] as const;

function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyField(): FormField {
  return {
    id: generateFieldId(),
    type: 'text',
    label: '',
    placeholder: '',
    required: false,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FormBuilderPage() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isNew = params.id === 'new';

  // Form metadata
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState('Thank you!');
  const [honeypotField, setHoneypotField] = useState('');
  const [active, setActive] = useState(true);

  // Fields
  const [fields, setFields] = useState<FormField[]>([createEmptyField()]);

  // Loading state for existing form
  const formQuery = trpc.forms.get.useQuery(
    { id: params.id },
    { enabled: !isNew }
  );

  // Populate form data when fetched
  useEffect(() => {
    if (formQuery.data) {
      const form = formQuery.data;
      setName(form.name);
      setSlug(form.slug);
      setRecipientEmail(form.recipientEmail ?? '');
      setSuccessMessage(form.successMessage ?? 'Thank you!');
      setHoneypotField(form.honeypotField ?? '');
      setActive(form.active);
      const formFields = form.fields as FormField[];
      if (Array.isArray(formFields) && formFields.length > 0) {
        setFields(formFields);
      }
    }
  }, [formQuery.data]);

  const createForm = trpc.forms.create.useMutation({
    onSuccess: (data) => {
      toast.success(__('Form created'));
      router.push(`/dashboard/forms/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateForm = trpc.forms.update.useMutation({
    onSuccess: () => {
      toast.success(__('Form saved'));
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = createForm.isPending || updateForm.isPending;

  // ---------------------------------------------------------------------------
  // Field management
  // ---------------------------------------------------------------------------

  const addField = useCallback(() => {
    setFields((prev) => [...prev, createEmptyField()]);
  }, []);

  const removeField = useCallback((index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
    setFields((prev) => {
      const newFields = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newFields.length) return prev;
      [newFields[index], newFields[targetIndex]] = [
        newFields[targetIndex]!,
        newFields[index]!,
      ];
      return newFields;
    });
  }, []);

  const updateField = useCallback(
    (index: number, updates: Partial<FormField>) => {
      setFields((prev) =>
        prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
      );
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  function handleSave() {
    if (!name.trim()) {
      toast.error(__('Form name is required'));
      return;
    }

    const validFields = fields.filter((f) => f.label.trim());
    if (validFields.length === 0) {
      toast.error(__('At least one field with a label is required'));
      return;
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      fields: validFields,
      recipientEmail: recipientEmail.trim() || undefined,
      successMessage: successMessage.trim() || undefined,
      honeypotField: honeypotField.trim() || undefined,
      active,
    };

    if (isNew) {
      createForm.mutate(payload);
    } else {
      updateForm.mutate({ id: params.id, ...payload });
    }
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (!isNew && formQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!isNew && formQuery.isError) {
    return (
      <div className="py-24 text-center text-sm text-(--text-muted)">
        {__('Form not found.')}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="admin-form-builder-page">
      {/* Header */}
      <div className="admin-form-builder-header flex items-center justify-between">
        <div className="admin-form-builder-header-left flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/forms')}
            className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {isNew ? __('New Form') : __('Edit Form')}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="admin-btn admin-btn-primary disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {__('Save')}
        </button>
      </div>

      {/* Form settings */}
      <div className="admin-form-builder-settings admin-card mt-4 p-6">
        <h2 className="admin-h2">{__('Form Settings')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
              {__('Name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={__('e.g. Contact Form')}
              className="admin-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
              {__('Slug')}
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={__('Auto-generated from name')}
              className="admin-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
              {__('Recipient Email')}
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder={__('Notifications sent to this email')}
              className="admin-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
              {__('Success Message')}
            </label>
            <input
              type="text"
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              placeholder={__('Thank you!')}
              className="admin-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
              {__('Honeypot Field Name')}
            </label>
            <input
              type="text"
              value={honeypotField}
              onChange={(e) => setHoneypotField(e.target.value)}
              placeholder={__('e.g. website (leave empty to disable)')}
              className="admin-input"
            />
            <p className="mt-1 text-xs text-(--text-muted)">
              {__('Hidden field to catch bots. Submissions with this field filled are rejected.')}
            </p>
          </div>
          <div className="flex items-center gap-2 self-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--text-secondary)">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-(--border-primary)"
              />
              {__('Active')}
            </label>
            <p className="text-xs text-(--text-muted)">
              {__('Inactive forms reject submissions')}
            </p>
          </div>
        </div>
      </div>

      {/* Form fields builder */}
      <div className="admin-form-builder-fields admin-card mt-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="admin-h2">{__('Fields')}</h2>
          <button
            type="button"
            onClick={addField}
            className="admin-btn admin-btn-secondary"
          >
            <Plus className="h-4 w-4" />
            {__('Add Field')}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="admin-form-builder-field-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-4"
            >
              <div className="admin-form-builder-field-row flex items-start gap-3">
                {/* Grip + ordering */}
                <div className="admin-form-builder-field-grip flex flex-col items-center gap-1 pt-1">
                  <GripVertical className="h-4 w-4 text-(--text-muted)" />
                  <button
                    type="button"
                    onClick={() => moveField(index, 'up')}
                    disabled={index === 0}
                    className={cn(
                      'rounded p-0.5 text-(--text-muted) hover:bg-(--surface-secondary)',
                      index === 0 && 'opacity-30'
                    )}
                    title={__('Move up')}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(index, 'down')}
                    disabled={index === fields.length - 1}
                    className={cn(
                      'rounded p-0.5 text-(--text-muted) hover:bg-(--surface-secondary)',
                      index === fields.length - 1 && 'opacity-30'
                    )}
                    title={__('Move down')}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Field config */}
                <div className="admin-form-builder-field-config flex-1">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                        {__('Type')}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateField(index, { type: e.target.value as FieldType })
                        }
                        className="admin-select w-full py-1.5"
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.value} value={ft.value}>
                            {__(ft.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                        {__('Label')} *
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) =>
                          updateField(index, { label: e.target.value })
                        }
                        placeholder={__('Field label')}
                        className="admin-input py-1.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                        {__('Placeholder')}
                      </label>
                      <input
                        type="text"
                        value={field.placeholder ?? ''}
                        onChange={(e) =>
                          updateField(index, { placeholder: e.target.value })
                        }
                        placeholder={__('Placeholder text')}
                        className="admin-input py-1.5"
                      />
                    </div>
                  </div>

                  {/* Options for select field */}
                  {field.type === 'select' && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                        {__('Options (comma-separated)')}
                      </label>
                      <input
                        type="text"
                        value={field.options ?? ''}
                        onChange={(e) =>
                          updateField(index, { options: e.target.value })
                        }
                        placeholder={__('Option 1, Option 2, Option 3')}
                        className="admin-input py-1.5"
                      />
                    </div>
                  )}

                  {/* Required toggle */}
                  <div className="mt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
                      <input
                        type="checkbox"
                        checked={field.required ?? false}
                        onChange={(e) =>
                          updateField(index, { required: e.target.checked })
                        }
                        className="h-3.5 w-3.5 rounded border-(--border-primary)"
                      />
                      {__('Required')}
                    </label>
                  </div>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  disabled={fields.length <= 1}
                  className={cn(
                    'rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600',
                    fields.length <= 1 && 'opacity-30'
                  )}
                  title={__('Remove field')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {fields.length === 0 && (
          <p className="mt-4 text-center text-sm text-(--text-muted)">
            {__('No fields yet. Click "Add Field" to start building your form.')}
          </p>
        )}
      </div>

      {/* Embed info (only for existing forms) */}
      {!isNew && (
        <div className="admin-form-builder-embed admin-card mt-4 p-6">
          <h2 className="admin-h2">{__('Embed')}</h2>
          <p className="mt-2 text-sm text-(--text-secondary)">
            {__('Use this component to embed the form on any page:')}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-(--surface-secondary) p-3 text-xs text-(--text-primary)">
            {`<ContactForm formSlug="${slug || 'your-slug'}" />`}
          </pre>
          <p className="mt-3 text-sm text-(--text-secondary)">
            {__('API endpoint for direct submissions:')}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-(--surface-secondary) p-3 text-xs text-(--text-primary)">
            {`POST /api/forms/${params.id}/submit`}
          </pre>
        </div>
      )}
    </div>
  );
}
