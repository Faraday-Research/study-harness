---
name: edu-v2-character-scene
description: Create the cast, place and introductions for an artifact from the story arc, plus the scene and hero picture briefs. Writes cast-scene.
max_output_tokens: 10000
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
- **Appearance.** Give each person one line the illustrator can draw: skin tone (`--illus-skin-1` light to `--illus-skin-5` deep, with variety across the cast), hair (colour and style), clothes (what they wear, in which `--illus-cloth-1` to `--illus-cloth-6` colour) and one signature item (a cap, a cricket bat, a satchel, glasses). Make the two main people easy to tell apart. Keep it respectful: no caricature, no stereotype props.

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

## 5. Picture briefs
`edu-v2-layout-and-drawing` draws the pictures as detailed flat illustrations (filled shapes, depth, expressive people). Give it a brief rich enough to draw from, like a picture-book art note.

**Scene brief** (`scene_svg_brief`, the Meet picture, viewBox 640x260):
- `composition`: one or two sentences: the moment shown, where the eye goes first, what is in front and what is behind. Put the main character and the key thing on a third (around x 210 or x 430), not in the dead centre.
- `background`: the layers behind the action, back to front (for example "pale sky", "far rooftops and a water tank", "school wall with a notice board").
- `characters`: the main character and the guide (and any other), each with a position, a pose doing something ("leans on the counter, pointing at the price board") and an expression ("puzzled, eyebrows up").
- `objects`: the place's three or four things, each with a position and size, `details` (what makes it look real: "striped awning, glass jars of snacks, a chalk price board"), a short label and its position (labels never overlap each other or a face), and a main colour token (an `--illus-…` colour such as `--illus-wood`, `--illus-metal`, `--illus-cloth-4`, or a `--q-<id>` from the colour map for the thing the concept is about).
- `aria_label`: one sentence that says what is in the picture.

**Hero brief** (`hero_brief`, the wide opening picture, viewBox 640x200): `description` of the place seen wide, with the main character in it mid-action at the moment of the story's hook, and the mood (busy, quiet, morning light). No labels. Plus its `aria_label`.

## 6. Output
Reply with only this JSON object inside `<cast_scene>` tags. No text outside the tags, no ``` fences.

<cast_scene>
{
  "main": {"name": "", "gender": "female|male", "age": 0, "hobby": "", "job": "", "appearance": "skin, hair, clothes and colours, signature item"},
  "guide": {"name": "", "gender": "female|male", "manner": "", "appearance": ""},
  "others": [{"role": "", "name": "", "appearance": ""}],
  "place": {"name": "", "things": ["", "", ""]},
  "intro_lines": [""],
  "scene_svg_brief": {
    "viewBox": "0 0 640 260",
    "composition": "",
    "background": ["", ""],
    "characters": [{"name": "", "pos": "x,y (feet)", "pose": "", "expression": ""}],
    "objects": [{"name": "", "pos": "x,y (and size)", "details": "", "label": "", "label_pos": "x,y", "colour_token": "--illus-wood"}],
    "aria_label": ""
  },
  "hero_brief": {"description": "", "aria_label": ""}
}
</cast_scene>
