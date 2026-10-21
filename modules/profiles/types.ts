export type FieldCategory = 'identity' | 'financial' | 'date' | 'contact' | 'metadata' | 'other';

/** One extracted (or user-edited) field of a document. */
export interface RecordField {
  key: string;
  label: string;
  value: string;
  confidence?: number;
  category?: FieldCategory | string;
}

export type NotionPropertyType = 'number' | 'rich_text' | 'date' | 'select';

export interface NotionPropertySpec {
  /** Property name in the Notion database. */
  name: string;
  type: NotionPropertyType;
  /** Candidate field keys/labels, matched case- and punctuation-insensitively. */
  from: string[];
}

/**
 * A document profile is one self-contained "utility app" (NGO receipts, weight slips, …).
 * Everything specific to a document type lives in its profile file; shared modules
 * (extraction, Sheets, Notion) read these definitions instead of hard-coding profile IDs.
 */
export interface DocumentProfile {
  id: string;
  /** Home-page card title, e.g. "NGO Donation Receipts". */
  title: string;
  /** Singular name shown while scanning, e.g. "NGO Donation Receipt". */
  documentName: string;
  description: string;
  /** Google Sheets tab that receives this profile's rows. */
  sheetTab: string;
  /** Title for a newly created spreadsheet. */
  sheetTitle: string;
  sampleDocument?: { href: string; fileName: string };
  extraction: {
    /** Extra context for the extraction prompt. */
    context: string;
    /** Fields the model should always look for. */
    priorityFields: string[];
  };
  /** Returned when no AI provider is configured (demo / CI). */
  mockFields: RecordField[];
  notion: {
    titleFrom: string[];
    dateFrom: string[];
    properties: NotionPropertySpec[];
  };
  /** Adds computed fields (e.g. net weight). Must not throw; failures are contained anyway. */
  derive?(fields: RecordField[]): RecordField[];
  /** Business-rule checks; each string is a warning shown to the user. */
  validate?(fields: RecordField[]): string[];
}

export interface ComingSoonProfile {
  title: string;
  description: string;
}
