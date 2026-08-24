# PawGuide — New-Pet-Parent Care Assistant
### Complete Project Algorithm & Build Spec (for Antigravity handoff)

---

## 1. Project Summary

**Goal:** Help first-time pet adopters take care of their pet correctly by generating a
personalized care guide (feeding, grooming, exercise, vaccination schedule) based on
species/breed/age, and offering a symptom-triage tool that either gives safe home-care
advice or directs the user to a nearby vet, with clinic search built in.

**Core modules:**
1. Pet Profile Intake
2. Personalized Care Guide Generator
3. Symptom Triage / Health Advisor
4. Nearby Vet/Clinic Locator
5. Dashboard / Reminders (optional stretch goal)

**Important design principle (read before building Module 3):**
This app is **not a substitute for veterinary diagnosis**. The triage module must never
output a specific drug name or dosage. It classifies severity and gives general,
non-prescriptive home care. Anything beyond basic care always routes to "find a vet."
This keeps the tool safe, legally sane, and honest about what a data-driven app can
responsibly do.

---

## 2. User Input Schema (Pet Profile Intake)

```
PetProfile {
  pet_id: UUID
  species: enum [Dog, Cat]              # expand later if you want rabbits/birds
  breed: string                         # dropdown, searchable, from breed dataset
  age_years: float
  age_stage: derived [Puppy/Kitten, Adult, Senior]   # computed from age + breed size
  weight_kg: float
  sex: enum [Male, Female]
  neutered_spayed: boolean
  activity_level: enum [Low, Medium, High]
  known_allergies: string[] (optional)
  existing_conditions: string[] (optional)
  vaccination_records: [{vaccine_name, date_given}] (optional)
  location: {lat, lng} or pincode        # for vet locator, ask permission explicitly
}
```

**Derivation rule for age_stage** (needed because "puppy" cutoff differs by breed size):
```
IF species == Dog:
    IF breed_size == Small  AND age_years < 1:    stage = Puppy
    IF breed_size == Medium AND age_years < 1:     stage = Puppy
    IF breed_size == Large  AND age_years < 1.5:   stage = Puppy
    IF age_years >= senior_threshold[breed_size]:  stage = Senior   # e.g. 7 for large, 10 for small
    ELSE: stage = Adult
IF species == Cat:
    IF age_years < 1: stage = Kitten
    IF age_years >= 11: stage = Senior
    ELSE: stage = Adult
```

### 2.1 Age-Based Feeding Frequency Rule + Onboarding Popup

Young pets can't eat like adults — small stomachs, fast metabolism, risk of hypoglycemia
if underfed. This needs to trigger **immediately after age is entered**, before the user
moves to the next onboarding step, so they see it while it's relevant instead of buried
later in the care guide.

**Feeding frequency by age (dogs and cats — puppies/kittens follow the same broad
pattern, exact portion size still comes from `nutrition.csv` × weight):**

| Age range | Meals/day | Portion size | Notes |
|---|---|---|---|
| Under 3 months | 4–6 | Small, little-and-often | Free access to water; never let a very young pet go >4-5h without food during the day |
| 3–6 months | 3–4 | Small-moderate | Start spacing meals out a bit more as they grow |
| 6–12 months | 2–3 | Moderate | Transitioning toward adult schedule |
| 12+ months (Adult) | 1–2 | Full daily portion split across meals | Exact calories from `nutrition.csv` |
| Senior | 2 | Moderate, sometimes smaller/more frequent | Vet-guided if underlying conditions exist |

```
FUNCTION get_feeding_frequency(age_months):
    IF age_months < 3:      RETURN {meals_per_day: "4-6", portion: "small"}
    ELIF age_months < 6:    RETURN {meals_per_day: "3-4", portion: "small-moderate"}
    ELIF age_months < 12:   RETURN {meals_per_day: "2-3", portion: "moderate"}
    ELIF age_stage == Senior: RETURN {meals_per_day: "2", portion: "moderate, vet-adjusted"}
    ELSE:                   RETURN {meals_per_day: "1-2", portion: "full daily portion"}
```

**Onboarding trigger — fires as soon as age is submitted, before the user continues:**

```
FUNCTION on_age_submitted(pet_profile):
    age_months = pet_profile.age_years * 12
    freq = get_feeding_frequency(age_months)

    IF age_months < 6:
        show_popup({
            type: "info_reminder",
            title: "Young pet — feeding schedule matters",
            message: f"At {age_months} months old, your pet should be fed "
                     f"{freq.meals_per_day} times a day, in {freq.portion} amounts — "
                     f"not the same as an adult meal schedule. We'll build this into "
                     f"your care guide, and you can set meal-time reminders below.",
            actions: ["Set meal reminders", "Continue"]
        })

    # This value feeds directly into Module 2's feeding plan (4.1) —
    # guide.feeding.meals_per_day should come from get_feeding_frequency(),
    # overriding nutrition.csv's default meals_per_day when the pet is under 12 months.
    pet_profile.feeding_frequency = freq
```

**UI note:** make this a light, non-alarming popup/toast (uses the amber accent, not the
emergency red) — it's guidance, not a warning. If the user taps "Set meal reminders,"
carry that into the optional Reminders module (Section 11) so it's not just a one-time
popup they forget.

---

## 3. Dataset Requirements

You need three reference tables. Build these as CSV/JSON lookup files (this is the "DS"
part of your project — data prep + a rules/lookup engine, optionally a light ML layer).

| Table | Key columns |
|---|---|
| `breeds.csv` | breed_name, species, size_category (Small/Med/Large), avg_adult_weight_kg, energy_level, coat_type, common_health_risks[], senior_age_threshold |
| `nutrition.csv` | species, size_category, age_stage, daily_calories_per_kg, meals_per_day, recommended_food_type, foods_to_avoid[] |
| `symptoms.csv` | symptom_name, species, severity_flags[], home_care_steps[], red_flag_triggers[], escalation_message |

**Good public sources to seed this data (verify licensing before use):**
- AKC breed database (dog breed traits)
- Kaggle "Dog Breeds" / "Cat Breeds" datasets
- ASPCA "toxic foods for pets" list (for foods_to_avoid)
- WSAVA / AAHA general wellness guidelines (for vaccination schedule templates — cite, don't copy verbatim)

---

## 4. Module 2 — Care Guide Generator (Algorithm)

```
FUNCTION generate_care_guide(pet_profile):
    breed_data = lookup(breeds.csv, pet_profile.breed)
    nutrition_data = lookup(nutrition.csv,
                             species=pet_profile.species,
                             size=breed_data.size_category,
                             stage=pet_profile.age_stage)

    guide = {}

    # 4.1 Feeding plan
    daily_calories = nutrition_data.daily_calories_per_kg * pet_profile.weight_kg

    # Use age-based frequency (Section 2.1) for pets under 12 months instead of the
    # nutrition.csv default, since young pets need more, smaller meals
    meals = IF pet_profile.age_years * 12 < 12:
                pet_profile.feeding_frequency.meals_per_day   # set during onboarding, see 2.1
            ELSE:
                nutrition_data.meals_per_day

    guide.feeding = {
        calories_per_day: daily_calories,
        meals_per_day: meals,
        food_type: nutrition_data.recommended_food_type,
        avoid: nutrition_data.foods_to_avoid,
        note: IF pet_profile.known_allergies not empty:
                  filter avoid_list += known_allergies
    }

    # 4.2 Exercise plan
    guide.exercise = rules_by(breed_data.energy_level, pet_profile.age_stage, pet_profile.activity_level)
    # e.g. High energy + Adult -> "45-60 min active play/walk daily, split into 2 sessions"

    # 4.3 Grooming plan
    guide.grooming = rules_by(breed_data.coat_type)
    # e.g. Double coat -> "Brush 2-3x/week, more during shedding season"

    # 4.4 Vaccination / checkup schedule (template, not medical advice)
    guide.vaccination_schedule = generate_schedule_template(pet_profile.species, pet_profile.age_stage)
    guide.next_vet_checkup = IF stage == Puppy/Kitten: "every 3-4 weeks until 16 weeks"
                              ELSE IF stage == Senior: "every 6 months"
                              ELSE: "annually"

    # 4.5 Breed-specific health watchlist
    guide.watch_for = breed_data.common_health_risks
    # displayed as "your breed is predisposed to X, Y — mention this at vet visits"

    RETURN guide
```

---

## 5. Module 3 — Symptom Triage / Health Advisor

This is the sensitive module. Keep it strictly rule-based (no free-text diagnosis, no
drug suggestions).

```
FUNCTION triage_symptom(pet_profile, selected_symptom, duration_hours, additional_flags):

    symptom_data = lookup(symptoms.csv, selected_symptom, species=pet_profile.species)

    severity = "MILD"

    IF any(flag in additional_flags for flag in symptom_data.red_flag_triggers):
        severity = "EMERGENCY"
    ELIF duration_hours > symptom_data.moderate_duration_threshold:
        severity = "MODERATE"
    ELIF pet_profile.age_stage in [Puppy, Kitten, Senior]:
        severity = upgrade_one_level(severity)   # young/old pets get less benefit of doubt
    ELIF pet_profile.existing_conditions not empty:
        severity = upgrade_one_level(severity)

    RETURN build_response(severity, symptom_data)


FUNCTION build_response(severity, symptom_data):
    IF severity == "EMERGENCY":
        RETURN {
          message: "This could be serious. Please take your pet to a vet now.",
          action: "SHOW_NEAREST_CLINICS",     # triggers Module 4
          home_care: null
        }
    IF severity == "MODERATE":
        RETURN {
          message: "This needs a vet's attention soon (within 24h) if it doesn't improve.",
          home_care: symptom_data.home_care_steps,   # general only: hydration, bland diet, rest
          action: "SUGGEST_CLINICS_OPTIONAL"
        }
    IF severity == "MILD":
        RETURN {
          message: "Monitor for now. Seek vet care if it doesn't improve in "
                    + symptom_data.escalation_window + " or worsens.",
          home_care: symptom_data.home_care_steps,
          action: "NONE"
        }
```

**Example `symptoms.csv` row (diarrhea, dog) — showing the safe framing:**
```
symptom_name: Diarrhea
red_flag_triggers: [blood_in_stool, vomiting_blood, lethargy_severe, known_toxin_ingestion, puppy_under_12_weeks]
moderate_duration_threshold: 24 (hours)
home_care_steps: [
  "Withhold food for 12-24h (adult dogs only — never fast puppies/kittens/seniors)",
  "Keep fresh water available at all times",
  "Once eating resumes, offer small bland meals (plain boiled chicken + rice) for 2-3 days",
  "Track frequency and consistency of stools"
]
escalation_window: "24 hours"
escalation_message: "If diarrhea continues past 24h, contains blood, or your dog seems weak, see a vet."
```
Notice: **no medicine name, no dosage** — anywhere. That's intentional across every
symptom row you build.

---

## 6. Module 4 — Nearby Vet/Clinic Locator

```
FUNCTION find_nearby_clinics(user_location, radius_km=10):
    IF user_location not provided:
        prompt_user_for_location_permission()
        IF denied: allow manual pincode/city entry

    results = call_places_api(
        query = "veterinary clinic OR animal hospital",
        location = user_location,
        radius = radius_km
    )

    sort results BY distance ASC, rating DESC
    RETURN results[0:5] with {name, address, phone, distance_km, open_now, maps_link}
```

**Implementation note for Antigravity:** use Google Places API ("Nearby Search" with
`type=veterinary_care`) or OpenStreetMap/Overpass API (`amenity=veterinary`) if you want
a free/no-API-key option for a student project. Always show a "Call clinic" and "Get
directions" button — don't just show a static list.

---

## 7. End-to-End Flow

```
START
 → Onboarding: collect PetProfile (Module 1)
 → Home screen: shows generated Care Guide (Module 2)
 → "Something feels off?" button → Symptom Triage (Module 3)
     → EMERGENCY or user opts in → Vet Locator (Module 4)
 → Reminders panel (optional): next vet visit, next vaccination, feeding times
END
```

---

## 8. Frontend / UX Direction

You said you don't want it empty/plain, but not overloaded either — here's a "medium
density" direction: enough color and visual hierarchy to feel warm and alive, without
turning into a cluttered dashboard.

**Suggested palette** (warm, pet-friendly, not clinical-white):
- Primary: soft teal `#2F8F8A` (trust, calm — good for a "care" app)
- Accent/warm: warm amber `#F2A65A` (used for CTAs, alerts use a separate red)
- Alert red (emergency only): `#E4572E`
- Background: warm off-white `#FBF7F0`, not pure white
- Cards: white with soft shadow, 12–16px rounded corners

**Layout guidance:**
- Home screen = card-based, not a single long form. One card per section: "Feeding
  Today," "Exercise," "Grooming," "Health Watchlist" — each with a small icon and 1-2
  line summary, expandable for detail.
- Use pet-illustration icons (paw, bone, bowl, heart) rather than generic dashboard
  icons — keeps it from feeling like a spreadsheet.
- Symptom triage screen: chat-style or step-wizard (not a big form) — feels more
  reassuring for a worried new pet owner.
- Emergency state: full-width red banner + a prominent "Find Vet Now" button — this is
  the one place it's okay to be visually loud.
- Typography: rounded sans-serif (e.g. Nunito, Quicksand) for a friendly, non-clinical
  feel; keep body text on a plain serif/sans like Inter for readability.

**Component checklist for Antigravity:**
- Onboarding stepper (multi-step form, breed autocomplete)
- Dashboard with 4 summary cards
- Expandable detail modals per card
- Symptom picker (searchable list or category tiles: Digestive / Skin / Behavior / Injury)
- Triage result card (color-coded by severity: green/amber/red)
- Clinic list with map pins
- Simple bottom nav: Home / Symptom Check / Reminders / Profile

---

## 9. Suggested Tech Stack

- **Frontend:** React + Tailwind (fits "medium density card UI" well)
- **Backend:** Python (FastAPI or Flask) — good fit since this is a DS project, keeps
  your rules engine and any ML/lookup logic in Python
- **Data layer:** CSV/JSON lookup tables to start → SQLite/Postgres once it grows
- **Location/Places:** Google Places API or OSM Overpass API
- **Optional ML extension:** a simple classifier trained on a labeled symptom-severity
  dataset instead of pure rules, if your DS project needs a "real model" component —
  the rule engine above can be your baseline/fallback either way

---

## 10. Safety & Scope Disclaimers (put these in the actual app UI, not just this doc)

- "PawGuide provides general care information and is not a substitute for professional
  veterinary advice, diagnosis, or treatment."
- Never surface specific medication names or dosages anywhere in the app.
- Always keep an emergency vet-locator path reachable within one tap from any screen.
