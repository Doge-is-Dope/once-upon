export type AttributeId = 'wits' | 'nerve' | 'grace';
export type LocationId = 'main_hall' | 'upstairs_room' | 'cellar';
export type EndingId = 'escape' | 'new_keeper' | 'true_name';
export type AbilityId =
  | 'reveal_hidden_ink'
  | 'ask_the_raven'
  | 'speak_the_true_name';

export function isAttributeId(value: string): value is AttributeId {
  return value === 'wits' || value === 'nerve' || value === 'grace';
}
