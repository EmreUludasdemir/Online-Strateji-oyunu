# First 5 Minutes Playability Audit (Phase 4)

## 1. What the player understands immediately
- The Bozkır Kağanlığı theme is prominent and immersive (e.g., "Oba", "Töre", "Başbuğ", "Akın").
- The Dashboard acts as a clear hub. The 3-queue system (Build, Train, Research) is visible.
- The "Buyruk" (Tutorial/Tasks) section correctly identifies the next immediate goal.

## 2. What is still confusing
- The labels for starting queues on the Dashboard are a bit abstract (e.g., "Yapı", "Ordu", "Bilge" instead of actionable verbs like "İnşa Et", "Talim Et", "Araştır").
- Empty states on the Commander page leave the player at a dead end without explaining *how* to get a commander.
- The distinction between "Harita" (Map) and "Sefer" (March/Campaign) in some dock actions can be ambiguous.

## 3. What the first recommended action should be
- The player should immediately click the first action in the "Buyruk" (Briefing) panel, which typically guides them to upgrade the Town Hall (Kağan Otağı) or claim a reward.

## 4. Which screen should guide the player next
- The Dashboard should always be the anchor. After initiating a task (like building), the player should be naturally drawn back to the "Buyruk" list or the Map for their first scout/attack.

## 5. Where the game has unclear labels
- Dashboard Queue Buttons: "Ordu" -> should be "Talim" or "Talim Et". "Bilge" -> should be "Araştır".
- Dashboard Dock: "Yapı" -> "İnşa Et".
- Auth Page: The alpha/demo explanations are slightly wordy.

## 6. Where the UI feels blocked or dead
- Commander Page when `selectedCommander` is null: It just says "Başbuğ kadrosu boş" and offers no exit or explanation.
- Research Page when nothing is active: "Aktif töre yok" is fine, but the body text is a bit dry.

## 7. Which buttons need stronger feedback
- Task "Claim" (Ödül Al) buttons in the Briefing section should feel more rewarding or visually distinct (using `variant="primary"`).
- The primary action in empty states needs to visually pop.

## 8. Which pages still have too much text
- AuthPage: The 3-step journey text is slightly verbose for a login screen.
- ResearchPage: The lane descriptions in the Töre Atlası take up a lot of cognitive space.

## 9. Which screens need better empty/loading/error states
- CommanderPage: Needs a descriptive empty state explaining how to recruit.
- ResearchPage: The empty state for "No active research" could be more encouraging.

## 10. Top 10 Quick Wins (Implemented)
1. **Dashboard Queue Labels:** Change "Ordu" to "Talim Et" and "Bilge" to "Araştır" for clearer verbs.
2. **Dashboard Dock Labels:** Change "Yapı" to "İnşa Et".
3. **Dashboard Task CTA:** Ensure claim buttons in the briefing are clear and rewarding.
4. **CommanderPage Empty State:** Add helpful text explaining how to get a commander ("Oba seviyesini yükselt veya görevleri tamamla").
5. **ResearchPage Empty State:** Shorten and punch up the "Aktif töre yok" body text.
6. **AuthPage Text:** Trim the onboarding text slightly for faster reading.
7. **ResearchPage Button:** Change "Kademe X'i başlat" to just "Başlat (L[X])" to save space.
8. **Dashboard Tooltips:** Make the empty queue hints more actionable.
9. **Dashboard Briefing:** Ensure the primary action stands out.
10. **Map Quick Routes:** Rename "Akın" to "Raporlar" if it goes to `/app/reports` to avoid confusion.
