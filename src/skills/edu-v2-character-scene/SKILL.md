---
name: edu-v2-character-scene
description: Create the cast, place and introductions for an artifact from the story arc, plus a scene SVG brief. Writes cast-scene.
max_output_tokens: 8000
---
# edu-v2-character-scene

Create the people and the place so a student relates at once. This is the Meet section: cast, place, picture. It comes before any physics, engineering or economics on the page.

## 1. Inputs
`<story_arc>` (roles and place needs), the `<track>`, `<colour_map>` (quantity colour tokens), and optionally `<used_names>` and `<used_places>` already taken in the course.

## 2. Cast
- **Main character.** A name, an age close to the audience, one hobby and one job they do. One main character per chapter.
- **Guide.** Patient. Almost never gives a straight answer. Hands the main character something to try. Turns to the student in a short line: "Now try to break it."
- **Other** (only if the arc's Roles needed lists one). A name and a one-line role.
- High school: a character in a familiar world. Undergraduate: a design case with a colleague voice.
- Choose names and settings the audience knows. Avoid stereotypes.

### 2a. Names
Pick names from the pool below. Use a plain given name: short and general.
- Given name only, no surname. A surname signals caste, religion or region.
- 3 to 6 letters, one to three syllables, spelled the way it is said.
- No pet names or home names (Ammu, Chinnu, Pinky, Bunty, Munna, Babu).
- No kinship or title words (Anna, Akka, Didi, Bhaiya, Uncle).
- No famous people, gods, brands or words with another meaning in English.
- Main character and guide start with different letters and differ in gender where possible. Never use a name in `<used_names>`.
- High school track: draw from the India pools by default. Undergraduate: either pool.

| Pool | Names |
|---|---|
| India, female | Anita, Asha, Divya, Farah, Geeta, Kavya, Leela, Meera, Neha, Nisha, Pooja, Priya, Rekha, Sana, Usha, Mary |
| India, male | Anil, Arjun, Ajay, Farhan, Gopal, Harish, Joseph, Manoj, Mohan, Naveen, Ravi, Ramesh, Salim, Sunil, Suresh, Tarun |
| International, female | Alice, Clara, Emma, Grace, Hana, Lena, Lucy, Maria, Mei, Nina, Sara |
| International, male | Ben, Bob, Carl, David, Hugo, Ivan, Ken, Leo, Mark, Omar, Paul, Tom |
| Either | Kiran, Sam |

## 3. Place
- One setting the audience knows, with three or four concrete things in it. Each thing is used in a beat of the arc (take them from Place needs).
- Keep the same place for all stages except Transfer and the Doors.
- Already used in this course: a hill-town market with a cart mender (friction), a samosa stall at a fair (demand), plus anything in `<used_places>`. Pick a new setting.

## 4. Introductions
Write short lines that introduce the cast and the place. Each line stays under 12 words. Use "I" and "you" only for the narrator. No jargon. The guide never gives a straight answer.

## 5. Scene SVG brief
Give `edu-v2-layout-and-drawing` what it needs: the objects, their positions in the 640x260 viewBox, one label per object placed beside it (labels never overlap), the colours by token name (`--ink`, `--muted`, `--sand`, or a `--q-<id>` from the colour map), and an `aria-label` sentence that says what is in the picture.

## 6. Output
Reply with only this JSON object inside `<cast_scene>` tags. No text outside the tags, no ``` fences.

<cast_scene>
{
  "main": {"name": "", "gender": "female|male", "age": 0, "hobby": "", "job": ""},
  "guide": {"name": "", "gender": "female|male", "manner": ""},
  "others": [{"role": "", "name": ""}],
  "place": {"name": "", "things": ["", "", ""]},
  "intro_lines": [""],
  "scene_svg_brief": {
    "viewBox": "0 0 640 260",
    "objects": [{"name": "", "pos": "x,y (and size)", "label": "", "label_pos": "x,y", "colour_token": "--ink"}],
    "aria_label": ""
  }
}
</cast_scene>
