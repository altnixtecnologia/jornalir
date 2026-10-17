export interface EditorialBirthdayRow {
  id: string;
  origin: "cadastro" | "familiar" | "manual";
  source_client_id: string | null;
  group_client_id: string | null;
  display_name: string;
  birth_month: number;
  birth_day: number;
  birth_year: number | null;
  city: string | null;
  relationship: string | null;
  profession: string | null;
  organization: string | null;
  known_as: string | null;
  message_context: string | null;
  notes: string | null;
  active: boolean;
  publish_in_print: boolean;
  photo_media_asset_id: string | null;
}
export interface EditorialBirthdayMessage {
  birthday_entry_id: string;
  edition_week_start: string;
  message: string;
  family: string;
  opening: string;
  ending: string;
  manually_edited?: boolean;
}
export interface EditorialBirthdayInput {
  id?: string;
  displayName: string;
  birthDate: string;
  city: string;
  groupClientId: string | null;
  relationship: string;
  profession: string;
  organization: string;
  knownAs: string;
  messageContext: string;
  notes: string;
  publishInPrint: boolean;
  active?: boolean;
}
