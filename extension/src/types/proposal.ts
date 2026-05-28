export interface ProposalJson {
  /** Short opening hook tied to the JD's primary need. */
  opener: string;
  /** Body paragraphs — typically 2–4 short paragraphs. */
  body: string[];
  /** Bulleted highlights tying candidate strengths to JD asks. */
  highlights: string[];
  /** Closing CTA / availability line. */
  closer: string;
  /** Suggested subject line for emails / Upwork message threads. */
  subject?: string;
  /** Tone label the model was asked to hit. */
  tone: ProposalTone;
}

export type ProposalTone = 'confident' | 'consultative' | 'warm' | 'concise' | 'enthusiastic';
