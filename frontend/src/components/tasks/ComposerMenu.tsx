import {
  Check,
  Cpu,
  MessageSquareText,
  Paperclip,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExecutorConfig, Tag } from 'shared/types';

/**
 * A model identifier, as the agent's own interface writes it.
 *
 * Two forms reach us. An alias — `opus`, `sonnet` — names whatever the latest of that family is.
 * A full id — `claude-opus-5`, `claude-haiku-4-5-20251001` — pins one version, and its dashes are
 * a version number wearing a disguise: 4-5 is 4.5.
 *
 * Parsed rather than mapped, so a model released after this was written still gets a proper name
 * instead of appearing as a raw id. Anything that does not match is shown exactly as configured,
 * which is the honest fallback: it is what will be passed to the agent.
 */
const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

export function modelLabel(model: string): string {
  const family = MODEL_FAMILIES.find((f) => model === f);
  if (family)
    return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)}`;

  const match = model.match(
    /^claude-(opus|sonnet|haiku|fable)-(\d+(?:-\d+)?)(?:-\d{8})?$/
  );
  if (!match) return model;

  const [, name, version] = match;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${version.replace('-', '.')}`;
}

/**
 * A configuration's name, as a word rather than a shout.
 *
 * They are written as constants in the profiles file — DEFAULT, APPROVALS — which is right for a
 * config key and wrong for a menu: full caps read as emphasis, and a menu of four emphasised
 * words has none.
 */
function modeLabel(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function modelOf(config: ExecutorConfig[string]): string | null {
  if (!config) return null;
  const inner = Object.values(config)[0] as
    | { model?: string | null }
    | undefined;
  const model = inner?.model;
  return model ? modelLabel(model) : null;
}

/**
 * Everything you can add to a message, behind one control.
 *
 * The composer used to spend two slots of its own row on this — a paperclip and a chip naming the
 * current configuration — for two things you touch rarely and never while typing. One button that
 * opens a menu is the shape every chat app has converged on, and it leaves the row to the message.
 *
 * The configurations are a submenu rather than a flat list because they are a choice among named
 * things, not an action: the current one is named on the row that opens them, so the model is
 * still one glance away rather than hidden.
 */
export function ComposerMenu({
  onUpload,
  tags,
  onInsertPrompt,
  currentProfile,
  selectedVariant,
  onVariantChange,
  disabled,
}: {
  onUpload: () => void;
  /** The tags usable here: this project's, then the global ones. */
  tags: Tag[];
  onInsertPrompt: (text: string) => void;
  /** The agent's configurations, keyed by name. Null before the profile loads. */
  currentProfile: ExecutorConfig | null;
  selectedVariant: string | null;
  onVariantChange: (variant: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('tasks');

  const variants = Object.entries(currentProfile ?? {}).map(
    ([name, config]) => ({
      name,
      model: modelOf(config),
    })
  );
  const current = selectedVariant ?? 'DEFAULT';

  // Two menus over one setting. A configuration either pins a model or it does not, and the
  // message carries exactly one of them — so choosing a model and choosing a mode are the same
  // act, and each submenu shows a dash when the other one holds the current choice.
  // Sorted by name: the profiles file has no order of its own, so without this the list changes
  // shape whenever a configuration is added.
  const models = variants
    .filter((v) => v.model)
    .sort((a, b) => a.model!.localeCompare(b.model!));
  const modes = variants.filter((v) => !v.model);
  const activeModel = models.find((v) => v.name === current)?.model ?? null;
  const activeMode = modes.find((v) => v.name === current)?.name ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 shrink-0 rounded-full"
          title={t('followUp.menu.label', 'Add to message')}
          aria-label={t('followUp.menu.label', 'Add to message')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      {/* Opens upward: the composer sits at the bottom of the pane. */}
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuItem onClick={onUpload}>
          <Paperclip className="mr-2 h-3.5 w-3.5" />
          {t('followUp.menu.uploadImages', 'Upload images')}
        </DropdownMenuItem>

        {tags.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MessageSquareText className="mr-2 h-3.5 w-3.5" />
              {t('followUp.menu.tags', 'Tags')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {tags.map((tag) => (
                <DropdownMenuItem
                  key={tag.id}
                  onClick={() => onInsertPrompt(tag.content)}
                  // The content, for a name that does not say enough on its own.
                  title={tag.content}
                >
                  <span className="min-w-0 flex-1 truncate">
                    @{tag.tag_name}
                  </span>
                  {/* A tag with no project is available everywhere; saying so here is the only
                      place the difference is visible while you are working. */}
                  {!tag.project_id && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      global
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {models.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Cpu className="mr-2 h-3.5 w-3.5" />
                {t('followUp.menu.model', 'Model')}
                <span className="ml-auto mr-1 max-w-[8rem] truncate text-xs text-muted-foreground">
                  {activeModel ?? '—'}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {models.map(({ name, model }) => (
                  <DropdownMenuItem
                    key={name}
                    onClick={() => onVariantChange(name)}
                  >
                    <span className="min-w-0 flex-1 truncate">{model}</span>
                    {name === current && (
                      <Check className="ml-1.5 h-3 w-3 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {modes.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
              {t('followUp.menu.mode', 'Mode')}
              <span className="ml-auto mr-1 max-w-[7rem] truncate text-xs text-muted-foreground">
                {activeMode ? modeLabel(activeMode) : '—'}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {modes.map(({ name }) => (
                <DropdownMenuItem
                  key={name}
                  onClick={() => onVariantChange(name)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {modeLabel(name)}
                  </span>
                  {name === current && (
                    <Check className="ml-1.5 h-3 w-3 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
