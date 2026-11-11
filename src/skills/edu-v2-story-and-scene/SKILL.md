---
name: edu-v2-story-and-scene
description: Write the student-facing voice of an edu-v2 artifact - the Foundation copy (Meet, Doors, stage narration, handoff) and the Builder and Explorer chapter stories. Cast and plot come from character-scene and story-arc.
max_output_tokens: 16000
---
# edu-v2-story-and-scene

Write the voice so the student feels the page is talking to them. This step owns voice, stage narration, Doors wording and level voice. Plot is `edu-v2-story-arc`. Cast, place and picture are `edu-v2-character-scene`. Page assembly is `edu-v2-content-presentation`.

You run twice:
- `<task>foundation-copy</task>`: you receive the plan, arc, cast and demo spec, and write the Foundation copy (section 8a).
- `<task>chapter-stories</task>`: you also receive the Foundation copy, and write the Builder and Explorer chapter stories (section 8b).

## 1. Voice
- Talk to the student: "I" and "you". Never "the student" or "learners".
- Short, active, plain sentences. In Foundation, narration lines stay under 12 words.
- Say a new term only after the picture or analogy for it. Few terms per artifact. Mark a term where it is first defined with `*term*` (it is shown in italics).
- Kind feedback. "Let's look again", not "Wrong". Return the student's own words or guess to them later ("you guessed...").
- The guide turns to the student in a "says" line: "Now try to break it." Then turns and looks at you. "You too."
- Humour is welcome. Opinions about conventions are not.
- The narrator stays plain. The characters speak in the story.
- No meta notes about the page itself (no "this takes ten minutes", no instructions about the tabs).
- Read every stage aloud. If it sounds like a textbook, rewrite it.

## 2. Order on the page
Meet comes first, before any physics, engineering or economics: cast, place, picture, from the cast-scene. Then the Doors, then the eight stages.

## 3. Doors (the opening, part 1)
- Use the doors of the concept plan. Each door is one plain line. No concept name and no hint of the link.
- Ask "What do you think these three have in common?" (use "two" if there are two doors).
- Stages 2 to 7 never mention the Doors.
- At the end, "Back to the three things" uses the plan's `link_statement`.

## 4. Stage voice
| Stage | Voice |
|---|---|
| Hook | One surprising thing from the story. Ask a question you cannot answer yet. |
| Predict | "Guesses are free. A guess makes the next part more interesting." |
| Play | Short instructions. The character reacts to what the student does. |
| Notice | "Before I give you any new words, tell me what you saw." |
| Name | "Scientists call this..." (or "Economists", "Engineers") in one plain sentence. The word comes after the experience. |
| Break | The guide says "Now try to break it." The student finds where the idea fails. |
| Transfer | A new place, the same idea. Use a different domain from the story. |
| Check | "Just to see what stuck. No timer, no score." |

## 5. Narration
The text column carries this stage narration in book style: plain words first, picture or metaphor before formula, short blocks. No notes about the page itself and no explainer side notes. Keep only a note that explains a lock ("Make your guess first").

## 6. Speech
Speech is a speaker plus their words: `{"speaker": "<cast name>", "words": "…"}`. The words never contain braces, key names, stage labels, or "who:" / "say:".

## 7. Three story chapters and level voice
The story is three connected chapters with the same cast and plot: the Foundation story (hook story, eight beats), then the Builder chapter, then the Explorer chapter. Take the Builder and Explorer problem and turn from the story arc. Do not tell the Foundation story again at a deeper level.
- Each chapter has a short title, a few lines (under 12 words each), and names both the main character and the guide.
- Each chapter story opens by picking up what the last one left open. The Builder chapter starts from the Foundation loose end. The Explorer chapter starts from what the Builder numbers showed.
- A `toBuilder` handoff line closes the Foundation check, and a `toExplorer` handoff line closes the Builder check. Each is one line that turns the student to the next chapter, with no new idea in it.
- Lines are plain text. Keep each line standing alone; the story player shows a few lines at a time.
- The characters do the new thing in the story. The student's runs drive it, as in Play.
- Foundation: everyday scene, pictured choices, no formula. Builder: same cast, a new problem, numbers and ratios ("half the grip, twice the slide"). Explorer: the equation appears only here, with the character's numbers.

## 8a. Output for foundation-copy
Reply with only this JSON object inside `<copy>` tags. No text outside the tags, no ``` fences. Every `lines` entry is one narration line under 12 words. `says` holds speech. The title is two to four words.

<copy>
{
  "title": "",
  "epigraph": {"words": "", "speaker": ""},
  "meet": {"lines": [""], "says": [{"speaker": "", "words": ""}]},
  "doors": {"lines": [""], "cards": [{"door": "door-1", "line": ""}], "question": "What do you think these three have in common?"},
  "stages": {
    "hook": {"lines": [""], "says": []},
    "predict": {"lines": [""], "says": []},
    "play": {"lines": [""], "says": []},
    "notice": {"lines": [""], "says": []},
    "name": {"lines": [""], "says": []},
    "break": {"lines": [""], "says": [{"speaker": "", "words": "Now try to break it."}]},
    "transfer": {"lines": [""], "says": []},
    "check": {"lines": ["Just to see what stuck. No timer, no score."], "says": []}
  },
  "back_to_doors": {"lines": [""]},
  "summary": "plain prose, at most three short paragraphs separated by blank lines",
  "toBuilder": "one handoff line"
}
</copy>

## 8b. Output for chapter-stories
Reply with only this JSON object inside `<stories>` tags. No text outside the tags, no ``` fences.

<stories>
{
  "builder": {"title": "", "lines": [""], "says": [{"speaker": "", "words": ""}]},
  "explorer": {"title": "", "lines": [""], "says": [{"speaker": "", "words": ""}]},
  "toExplorer": "one handoff line"
}
</stories>

## 9. Check before you reply
- Every stage uses the same cast and place, except Transfer and the Doors.
- No jargon before its picture.
- No sentence tells the student what they are about to feel or learn.
- Doors lines are plain, and from different domains.
- The Builder and Explorer chapters use the same characters and place, and each follows from the one before. No chapter retells the Foundation story.
- Every line is under 12 words and has no braces or key names.
