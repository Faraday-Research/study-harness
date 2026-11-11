---
name: edu-v2-story-arc
description: Bind a story to one concept from the concept plan - premise, want, hook surprise, a beat per stage, payoff, and the Builder and Explorer story chapters. Roles only, no names. Writes the story arc.
max_output_tokens: 8000
---
# edu-v2-story-arc

Bind one story to one concept so the story is the reason the relationship matters. This step writes the plot with roles only. Names, looks and places are made by `edu-v2-character-scene`. Voice is `edu-v2-story-and-scene`.

## 1. Inputs
`<concept_plan>` (relationship, misconceptions, Doors), the `<track>`, and optionally `<running_case>` (the chapter's running character or case).

## 2. Principles
- The relationship is what solves the character's problem. If the story works without it, change the story.
- The world is the audience's own. High school: a familiar world, one character per chapter. Undergraduate: a design case with real systems and a colleague voice.
- The story never states the relationship before stage 5.
- Use no idea from a later chapter.
- Keep the model honest. The story's failure in Break is a real limit of the simple model.
- Roles only. Write "the main character", "the guide", "the other". No personal names, no looks, no named places. A kind of place ("a fair", "a workshop") is fine in Place needs.

## 3. The arc
- **Premise.** Who (by role), where (by kind), one line.
- **Want.** One small, concrete problem the character must solve.
- **Surprise.** The Hook. Something that looks wrong. It raises a question the student cannot answer yet.
- **Beats.** One or two lines for each stage:

| Stage | Story beat |
|---|---|
| 1 Hook | The surprise |
| 2 Predict | The character guesses, the student guesses too |
| 3 Play | The character tries things, the student's runs drive it |
| 4 Notice | The character asks what you saw |
| 5 Name | The guide gives the word after the experience |
| 6 Break | A visible failure the student finds (high school) or an assumption that fails at a value (undergraduate) |
| 7 Transfer | A new place, same idea |
| 8 Check | The payoff: the character solves the want |

- **Payoff.** What changes for the character, in one line.

## 4. Doors
Doors come from the concept plan unchanged. They come from different domains than the story. The story never mentions them in stages 2 to 7.

## 5. Three story chapters, one plot
Foundation, Builder and Explorer are three connected chapters of one story, not the same story told three times. The same character, guide and place carry on.
- **Foundation.** The eight beats above. It ends with the character's first small win and a loose end the Foundation view cannot close.
- **Builder.** The loose end becomes a new problem that needs numbers or ratios. The character cannot settle it by feel. The student's runs give the numbers.
- **Explorer.** The numbers raise a harder case, such as a limit, a trade-off or a rule across many cases. The student's runs and the equation settle it.
- Each chapter needs the earlier one to make sense. No chapter repeats an earlier beat or restates the same scene.
- Each chapter names the same two roles. No new main character appears.
- The chapter problem never uses an idea that its own level has not taught yet.

With a running case, keep the same character across the chapter; each artifact is a new problem for them.

## 6. Check before you reply
1. Each beat is at most two lines.
2. Beat 4 does not reveal what the student should see.
3. The word in beat 5 comes after the experience.
4. No beat tells the student what they will feel or learn.
5. Only one main character and one guide.
6. The Builder and Explorer chapters each have a problem and a turn. Each follows from the one before. Same roles, same place.
7. The Foundation payoff leaves a loose end that the Builder problem picks up.

## 7. Output
Reply with only the arc inside `<story_arc>` tags, in exactly this Markdown form (keep every label):

<story_arc>
# <concept> story arc
Premise:
Want:
Surprise:
Beats:
1 Hook:
2 Predict:
3 Play:
4 Notice:
5 Name:
6 Break:
7 Transfer:
8 Check:
Payoff:
Loose end:
Builder chapter: problem: … / turn: …
Explorer chapter: problem: … / turn: …
Roles needed: main, guide[, other]
Place needs: 3 to 4 concrete things used in the beats, comma-separated
</story_arc>
