/**
 * Content moderation configuration.
 *
 * Default blocked-word list used for comment and form-submission filtering.
 * Extend via the `moderation.wordList` DB option to add project-specific terms.
 */

export const DEFAULT_BLOCKED_WORDS: string[] = [
  // Slurs & hate speech
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'tranny',
  'spic',
  'kike',
  'chink',
  'wetback',
  'coon',

  // Threats / violence
  'kill yourself',
  'kys',
  'i will kill you',

  // Spam patterns
  'buy now',
  'click here',
  'free money',
  'earn cash',
];

/**
 * Get the active blocked-words list.
 * Currently returns the static default list.
 * Can be extended to merge with DB-stored options.
 */
export function getBlockedWords(): string[] {
  return DEFAULT_BLOCKED_WORDS;
}
