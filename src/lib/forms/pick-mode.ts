/**
 * Marking fields by clicking them, in the form list or on the PDF:
 * - "סימון בטופס": the fields a source field opens (sourceId is that field);
 * - "עריכת שלבים": the fields that move to a step chosen above (no source).
 */
export interface PickMode {
  sourceId?: string;
  /** Field ids currently marked. */
  ids: ReadonlySet<string>;
  onToggle: (fieldId: string) => void;
  /** What a ticked box means, read after the field's label (e.g. "מסומן להעברה לשלב"). */
  checkLabel?: string;
  /** Only fields that take an answer can be marked (steps are about who fills what). */
  answersOnly?: boolean;
}
