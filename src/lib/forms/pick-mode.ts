/** "סימון בטופס": the builder marks the fields a source field opens, by clicking them, then saves. */
export interface PickMode {
  sourceId: string;
  /** Field ids currently marked. */
  ids: ReadonlySet<string>;
  onToggle: (fieldId: string) => void;
}
