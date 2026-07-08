# Hundo — Flutter Build Plan

> One goal · 100 days · guided by **Ignis the Phoenix** 🔥
> Theme: **Royal Purple + Gold**. Character: strict, friendly, joyful — grows/brightens as you progress, rises from ashes when a streak breaks.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Flutter 3.41 / Dart 3.11** | Single codebase, iOS + Android |
| State mgmt | **Riverpod** (riverpod_generator) | Testable, compile-safe, great async support |
| Navigation | **go_router** | Declarative routes, deep links for proof callbacks |
| Backend | **Supabase** (already in your stack) | Auth + Postgres + Storage + Edge Functions |
| AI plan gen | **Claude API via Supabase Edge Function** | Keep the key server-side; generate phases + daily quests |
| Local cache | **Isar** (or Drift) | Offline "today's quest", instant launch |
| Character | **Rive** (state machine) | One interactive phoenix with emotion + growth states |
| Notifications | **flutter_local_notifications** + **FCM** | Daily nudge + 5-hour engagement re-check |
| Background | **workmanager** (Android) / **BGTaskScheduler** (iOS) | The 5-hour post re-check |
| Focus lock | **Native platform channels** (see §7) | Hardest part — Swift FamilyControls / Kotlin UsageStats |

---

## 2. Royal Purple Design System

Define once in `lib/theme/`. Material 3 `ColorScheme` seeded from royal purple, with gold as the "earned/reward" accent.

```
Primary       #6D28D9  (royal purple)
Primary dark  #4C1D95  (button shadows, depth)
Primary deep  #2E1065  (dark-mode bg)
Gold accent   #F5C518  (rewards, streaks, crown/flame highlights)
Violet glow   #A855F7  (phoenix flame, progress)
Lavender surf #F3EFFF  (light cards / soft surfaces)
Success       #22C55E  · Warn #FB923C · Danger #EF4444
Ink           #2A2140  · Ink soft #6B5E86
```

- **Chunky 3D buttons** (the satisfying press): a `PrimaryButton` widget = filled purple with a solid darker bottom edge (`Container` + `Transform.translate` on tap-down) — recreate the prototype's `box-shadow:0 4px 0` feel natively.
- **Typography**: display = `Baloo 2` / `Fredoka` (rounded, bold), body = `Nunito`. Via `google_fonts`.
- Light + dark theme from day one (deep #2E1065 dark bg looks premium for purple).

---

## 3. Ignis the Phoenix (the character)

One Rive file, one **state machine** driving everything:

**Emotion triggers** (fired from app events):
- `idle` — gentle flame flicker
- `cheer` — quest completed / streak up
- `stern` — missed a day, "we don't break the chain"
- `thinking` — AI generating the plan
- `proud` — boss-day / phase complete

**Growth input** (`0.0 → 1.0`, = day/100): the phoenix starts as a small ember and grows into a full radiant phoenix by day 100. Streak break = drops a stage (back toward ashes), giving a real visual stake.

Deliverable: a Rive artboard + a `IgnisController` (Riverpod) mapping app state → Rive inputs. Placeholder: ship v1 with a Lottie/animated PNG stand-in, swap in the Rive art when the illustrator delivers.

---

## 4. Project Structure

```
lib/
  main.dart
  app.dart                  # MaterialApp.router + theme
  theme/
    colors.dart  typography.dart  app_theme.dart
  router/app_router.dart
  core/                     # supabase client, env, result types
  widgets/                  # PrimaryButton, QuestCard, ProgressTrack, Pill, PathNode
  character/                # IgnisView, ignis_controller.dart, *.riv
  features/
    onboarding/             # goal Qs -> creates plan
    plan/                   # AI generation + 100-day path
    today/                  # home / current quest
    proof/                  # link submit + verify
    celebrate/
    stats/
    focus/                  # opt-in app-limit screen + native channel
    profile/
  data/
    models/  repositories/  supabase/  local/(isar)
```

---

## 5. Data Model (Supabase / Postgres)

```
profiles(id, name, avatar, created_at)
goals(id, user_id, kind, answers_json, created_at)
plans(id, goal_id, phase_count, status, ignis_stage)
phases(id, plan_id, index, title, theme)        # e.g. "The Voice"
quests(id, plan_id, day_no, phase_id, title, body, difficulty,
       est_minutes, reward_gems, channel, status, due_date)
proofs(id, quest_id, url, screenshot_path, verified_at,
       recheck_at, likes, views, impressions)
streaks(id, user_id, current, best, last_done_date)
focus_rules(id, user_id, app_bundle, daily_limit_min, enabled)
```

- Only **today's quest** is fetched to the client (matches "user can only see current day").
- An **Edge Function** generates the full plan on signup, and a **scheduled function** runs the 5-hour proof re-check → adjusts the *next* quest's difficulty/channel.

---

## 6. Screens (port from the HTML prototype, re-skinned purple)

1. **Onboarding** — Ignis asks the goal questions → selectable cards
2. **Generating** — Ignis `thinking`, progress, "shaping your 100 days"
3. **Today** — streak/gems pills, day x/100 track, big **quest card**, Ignis nudge
4. **Proof** — paste link, verify-exists now + "re-check in 5h" note
5. **Celebrate** — confetti, streak +1, phoenix grows a stage
6. **Path** — 100-day node trail (done ✓ / today ★ / locked 🔒 / 👑 boss)
7. **Stats** — streaks, week dots, real-world impact (followers/views)
8. **Focus** — *opt-in, escapable* app-limit screen
9. **Profile/Settings** — goal, reminders, focus rules, theme

---

## 7. The Hard Native Parts (be realistic)

These need **platform channels** (Flutter can't do them in pure Dart):

- **iOS app-limit / focus**: Apple **FamilyControls + ManagedSettings + DeviceActivity** (Swift). Requires a special Apple **entitlement request** and is meant for parental-control style use. Build behind a feature flag; assume entitlement approval takes time.
- **Android app-limit / focus**: `UsageStatsManager` (read usage) + an **AccessibilityService** or foreground overlay to gate apps. Google Play scrutinizes Accessibility use — needs a clear declared purpose.
- **5-hour re-check**: `workmanager` (Android) / `BGTaskScheduler` (iOS) — OS throttles background runs, so the **server-side scheduled re-check is the source of truth**; background tasks just sync.
- **Engagement metrics (likes/views)**: largely **not available** via Instagram/Facebook APIs for arbitrary personal posts. Plan for: verify-link-exists ✅ reliably; treat metric-reading as best-effort / manual-entry / Reddit+LinkedIn where feasible. Don't hard-couple the core loop to metrics you can't get.

> Keep the focus-lock **opt-in and always escapable** (per our earlier discussion) — both for user safety and App Store approval.

---

## 8. Build Milestones

**Phase 0 — Scaffold (½ day)**
`flutter create`, theme + design tokens, go_router, Supabase client, env wiring, PrimaryButton/Pill/Track widgets.

**Phase 1 — Design system + Ignis placeholder (1–2 days)**
Full purple Material 3 theme (light+dark), reusable widgets, Ignis view with placeholder animation + controller.

**Phase 2 — Onboarding → AI plan (2–3 days)**
Question flow, Edge Function generating phases + day-1..100 quests, Isar caching, "Generating" screen.

**Phase 3 — Core daily loop (3–4 days)** ← the heart
Today screen, proof submit + verify-exists, celebrate + confetti + phoenix-grow, streak logic, miss/recovery flow.

**Phase 4 — Path + Stats (2 days)**
100-day node trail, stats, week dots, impact card.

**Phase 5 — Notifications + background (2 days)**
Daily reminder, 5-hour re-check (server scheduled fn + client sync), difficulty adjustment.

**Phase 6 — Focus mode native channels (3–5 days, risky)**
iOS FamilyControls + Android UsageStats behind a flag; opt-in UI; entitlement paperwork.

**Phase 7 — Polish + ship (ongoing)**
Empty/error states, animations, onboarding auth, paywall (optional), TestFlight + Play internal track.

**MVP = Phases 0–4** (a fully usable single-goal 100-day app). Phases 5–6 are the "power" layer.

---

## 9. Key Packages

```yaml
flutter_riverpod / riverpod_annotation
go_router
supabase_flutter
isar / isar_flutter_libs        # or drift
rive
google_fonts
flutter_local_notifications
firebase_messaging
workmanager
url_launcher
confetti
flutter_animate                 # micro-interactions
```

---

## 10. Open Decisions

- App + character names final? (working: **Hundo** / **Ignis**)
- Auth: email + Apple/Google sign-in?
- Monetization: free, or paywall after the first 100-day run?
- Do we want the recolored **purple HTML preview** first (cheap), before committing to Flutter?
