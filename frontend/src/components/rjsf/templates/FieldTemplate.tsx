import { FieldTemplateProps } from '@rjsf/utils';
import { toPrettyCase } from '@/utils/string';

/**
 * A label RJSF made up from the property name, rather than one somebody wrote.
 *
 * No executor schema declares titles, so every one of these forms falls back to
 * the raw field name — 'dangerously_skip_permissions' set in bold next to a
 * checkbox. An authored title has spaces or capitals in it; a bare lowercase
 * identifier is the fallback, and is worth prettifying.
 */
function isRawPropertyName(label: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(label);
}

/** Words `toPrettyCase` would sentence-case, that are read as initialisms. */
const INITIALISMS = new Set([
  'api',
  'cli',
  'id',
  'ide',
  'json',
  'mcp',
  'pr',
  'sdk',
  'ssh',
  'url',
]);

/** 'disable_api_key' -> 'Disable API Key'. */
function prettyLabel(label: string): string {
  return toPrettyCase(label)
    .split(' ')
    .map((word) =>
      INITIALISMS.has(word.toLowerCase()) ? word.toUpperCase() : word
    )
    .join(' ');
}

export const FieldTemplate = (props: FieldTemplateProps) => {
  const {
    children,
    rawErrors = [],
    rawHelp,
    rawDescription,
    label,
    required,
    schema,
  } = props;

  if (schema.type === 'object') {
    return children;
  }

  const title = label && isRawPropertyName(label) ? prettyLabel(label) : label;

  // Two columns: what the setting is on the left, the control on the right.
  return (
    <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2 py-3 md:grid-cols-2">
      {/* Left column: label and description */}
      <div className="space-y-1">
        {title && (
          <div className="text-sm font-medium">
            {title}
            {required && <span className="text-destructive ml-1">*</span>}
          </div>
        )}

        {rawDescription && (
          <p className="text-sm text-muted-foreground">{rawDescription}</p>
        )}

        {rawHelp && <p className="text-sm text-muted-foreground">{rawHelp}</p>}
      </div>

      {/* Right column: field content */}
      <div className="space-y-2">
        {children}

        {rawErrors.length > 0 && (
          <div className="space-y-1">
            {rawErrors.map((error, index) => (
              <p key={index} className="text-sm text-destructive">
                {error}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
