/** Mirrors server's InputFieldDescriptor (services/types.ts). */
export interface InputFieldDescriptorDTO {
  key: string;
  label: string;
  kind: "number" | "array" | "grid" | "stringPair";
  min?: number;
  max?: number;
  /** Optional separate range for the column slider of grid inputs. */
  colsRange?: [number, number];
  valueRange?: [number, number];
  /** stringPair only: character-class body overriding the default `[a-z]` sanitizer (e.g. "[a-z*?]"). */
  allow?: string;
}
