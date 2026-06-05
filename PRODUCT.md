# Product

## Register

product

## Users

People who run or sit in meetings and calls on macOS (Apple Silicon) and want their
own private record of what was said. Their context is mid-work: the app sits in a
second window beside a video call or in the room during a conversation, then gets
revisited afterward to read back and clean up notes. The job to be done: capture both
sides of the audio (system + microphone), get an accurate, speaker-attributed
transcript, and keep written notes beside it, without any of it leaving the machine.

## Product Purpose

Transcriper is a local-first meeting-notes app. It records system and microphone
audio, transcribes it on-device with WhisperKit, labels who spoke with FluidAudio,
and stores notes (with their transcripts) locally. It exists for people who can't or
won't send meeting audio to a cloud service. Success looks like a user trusting it
with a real, sensitive meeting and walking away with usable, attributed notes, never
having had to think about where their data went or how to set it up.

## Brand Personality

Warm and editorial; private and trustworthy. The voice is plain, specific, and calm.
It treats the user's words as worth reading, not as rows in a database. It is not
chatty, not salesy, and never performs busyness at the user. Three words: warm,
trustworthy, unhurried.

## Anti-references

- The interchangeable gray-card, system-font SaaS/AI dashboard.
- Loud interfaces: neon accents, heavy glows, shouting gradients.
- Glassmorphism as decoration (frosted blur on every surface).
- Cluttered, dense screens that put everything on at once.
- Internally inconsistent surfaces (e.g. a transcript panel that looks like a
  different app than the notes around it).

## Design Principles

- **Privacy you can feel.** The local-only nature should be legible and reassuring in
  the interface, not buried in a settings page.
- **The words come first.** Transcript and notes are the product; chrome recedes so
  reading and writing lead.
- **Calm over clever.** Quiet, legible, low-distraction. Motion appears only when it
  tells the user something (state, feedback), never as decoration.
- **Earned familiarity.** Standard affordances for standard tasks; novelty is spent on
  small moments, not on reinventing buttons, lists, or scrollbars.
- **One warm identity, everywhere.** Every surface belongs to the same world; no
  clashing subsystems.

## Accessibility & Inclusion

WCAG AA, with readability as the explicit priority: body text meets >=4.5:1 against the
plum surfaces (no light-gray-on-dark "for elegance"). Honor `prefers-reduced-motion`
with crossfade/instant alternatives. Speakers are distinguished by more than hue
(explicit label + consistent left/right position), so color-vision differences don't
lose the attribution.
