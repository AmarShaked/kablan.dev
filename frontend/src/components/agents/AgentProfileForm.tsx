import { useMemo, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { RJSFSchema } from '@rjsf/utils';
import { BaseCodingAgent } from 'shared/types';
import schemas from 'virtual:executor-schemas';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  defaultAgentCommand,
  profileFieldCopy,
  profileFieldGroup,
} from '@/utils/agentProfileFields';

type SchemaProp = {
  type?: string | string[];
  enum?: Array<string | null>;
  format?: string;
  items?: { type?: string };
  title?: string;
  description?: string;
};

function schemaProps(
  agent: BaseCodingAgent
): Array<[string, SchemaProp]> {
  const schema = schemas[agent] as RJSFSchema | undefined;
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object') return [];
  return Object.entries(properties) as Array<[string, SchemaProp]>;
}

function typesOf(prop: SchemaProp): string[] {
  const t = prop.type;
  if (Array.isArray(t)) return t.filter((item) => item !== 'null');
  if (typeof t === 'string' && t !== 'null') return [t];
  return [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asLines(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').join('\n')
    : '';
}

function parseLines(raw: string): string[] | null {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

function ConfigField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function EnvEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string> | null) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const entries = Object.entries(value);

  const commit = (next: Record<string, string>) => {
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <Input value={key} disabled className="font-mono text-sm" />
          <Input
            value={val}
            className="font-mono text-sm"
            onChange={(event) =>
              commit({ ...value, [key]: event.target.value })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Remove ${key}`}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              commit(next);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={newKey}
          placeholder="KEY"
          className="font-mono text-sm"
          onChange={(event) => setNewKey(event.target.value)}
        />
        <Input
          value={newValue}
          placeholder="value"
          className="font-mono text-sm"
          onChange={(event) => setNewValue(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!newKey.trim()}
          aria-label="Add environment variable"
          onClick={() => {
            commit({ ...value, [newKey.trim()]: newValue });
            setNewKey('');
            setNewValue('');
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SchemaField({
  agent,
  fieldKey,
  prop,
  value,
  onChange,
}: {
  agent: BaseCodingAgent;
  fieldKey: string;
  prop: SchemaProp;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const copy = profileFieldCopy(fieldKey, agent);
  const types = typesOf(prop);
  const id = `profile-${fieldKey}`;

  if (types.includes('boolean')) {
    return (
      <ToggleRow
        id={id}
        label={copy.label}
        hint={copy.hint}
        checked={value === true}
        onChange={onChange}
      />
    );
  }

  if (fieldKey === 'env' || types.includes('object')) {
    const record =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, string>)
        : {};
    return (
      <ConfigField label={copy.label} hint={copy.hint} htmlFor={id}>
        <EnvEditor
          value={record}
          onChange={(next) => onChange(next)}
        />
      </ConfigField>
    );
  }

  if (prop.enum && prop.enum.length > 0) {
    const options = prop.enum.filter(
      (item): item is string => typeof item === 'string'
    );
    return (
      <ConfigField label={copy.label} hint={copy.hint} htmlFor={id}>
        <Select
          value={asString(value) || '__default__'}
          onValueChange={(next) =>
            onChange(next === '__default__' ? null : next)
          }
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Default</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigField>
    );
  }

  if (types.includes('array')) {
    return (
      <ConfigField label={copy.label} hint={copy.hint} htmlFor={id}>
        <Textarea
          id={id}
          value={asLines(value)}
          rows={2}
          className="font-mono"
          placeholder={
            fieldKey === 'additional_params' ? '--verbose' : undefined
          }
          onChange={(event) => onChange(parseLines(event.target.value))}
        />
      </ConfigField>
    );
  }

  if (prop.format === 'textarea') {
    return (
      <ConfigField label={copy.label} hint={copy.hint} htmlFor={id}>
        <Textarea
          id={id}
          value={asString(value)}
          rows={3}
          placeholder="Always answer in the repo’s language…"
          onChange={(event) => {
            const next = event.target.value;
            onChange(next.trim() === '' ? null : next);
          }}
        />
      </ConfigField>
    );
  }

  return (
    <ConfigField label={copy.label} hint={copy.hint} htmlFor={id}>
      <Input
        id={id}
        value={asString(value)}
        placeholder={
          fieldKey === 'base_command_override'
            ? defaultAgentCommand(agent)
            : fieldKey === 'model'
              ? 'Default model'
              : undefined
        }
        onChange={(event) => {
          const next = event.target.value;
          onChange(next.trim() === '' ? null : next);
        }}
      />
    </ConfigField>
  );
}

export function AgentProfileForm({
  agent,
  name,
  description,
  nameError,
  formData,
  onNameChange,
  onDescriptionChange,
  onFormDataChange,
}: {
  agent: BaseCodingAgent;
  name: string;
  description: string;
  nameError: string | null;
  formData: Record<string, unknown>;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onFormDataChange: (formData: Record<string, unknown>) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fields = useMemo(() => schemaProps(agent), [agent]);
  const behavior = fields.filter(
    ([key]) => profileFieldGroup(key) === 'behavior'
  );
  const instructions = fields.filter(
    ([key]) => profileFieldGroup(key) === 'instructions'
  );
  const advanced = fields.filter(
    ([key]) => profileFieldGroup(key) === 'advanced'
  );

  const patch = (key: string, value: unknown) => {
    onFormDataChange({ ...formData, [key]: value });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-base font-semibold">{name || 'Untitled'}</h2>
        <ConfigField
          label="Name"
          hint="What tasks pick. Letters, numbers, hyphens and underscores."
          htmlFor="profile-name"
        >
          <Input
            id="profile-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
          {nameError ? (
            <p className="text-xs text-destructive">{nameError}</p>
          ) : null}
        </ConfigField>
        <ConfigField
          label="Description"
          hint="Shown in the profile list. A short line for what this setup is for."
          htmlFor="profile-description"
        >
          <Input
            id="profile-description"
            value={description}
            placeholder="Everyday run"
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </ConfigField>
      </div>

      {behavior.length > 0 && (
        <div className="space-y-4 border-t pt-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">How it behaves</h2>
            <p className="text-sm text-muted-foreground">
              Model and permission flags for this profile.
            </p>
          </div>
          {behavior.map(([key, prop]) => (
            <SchemaField
              key={key}
              agent={agent}
              fieldKey={key}
              prop={prop}
              value={formData[key]}
              onChange={(next) => patch(key, next)}
            />
          ))}
        </div>
      )}

      {instructions.length > 0 && (
        <div className="space-y-4 border-t pt-6">
          <h2 className="text-base font-semibold">Instructions</h2>
          {instructions.map(([key, prop]) => (
            <SchemaField
              key={key}
              agent={agent}
              fieldKey={key}
              prop={prop}
              value={formData[key]}
              onChange={(next) => patch(key, next)}
            />
          ))}
        </div>
      )}

      {advanced.length > 0 && (
        <div className="border-t pt-4">
          <button
            type="button"
            className={cn(
              'text-sm font-medium text-muted-foreground',
              'hover:text-foreground'
            )}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            {advancedOpen ? 'Hide advanced' : 'Advanced — how it is launched'}
          </button>
          {advancedOpen && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Kablan starts this CLI for every task. Override the command
                only if you installed the agent yourself, or need extra flags
                and env.
              </p>
              {advanced.map(([key, prop]) => (
                <SchemaField
                  key={key}
                  agent={agent}
                  fieldKey={key}
                  prop={prop}
                  value={formData[key]}
                  onChange={(next) => patch(key, next)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
