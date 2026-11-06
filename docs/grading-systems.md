# Grading systems

GPA is the unit-weighted average **Σ(grade points × units) / Σ units** over graded courses only. Credit-only grades (`P`) are left out of the GPA, but their units count toward the unit totals. Marks such as `INC`, `DROP`/`DRP`/`W` and `NP` are saved with the term but left out of both.

| System | Better | Grades | Not counted in GPA |
| --- | :---: | --- | --- |
| **MSU-IIT (1.00–5.00)** | lower | `1.00` Excellent · `1.25`–`1.50` Very good · `1.75`–`2.00` Good · `2.25`–`2.50` Satisfactory · `2.75`–`3.00` Passing · `5.00` Failed | `P` (units credited), `INC`, `DROP` |
| **PH 1.00–5.00 (with 4.00 conditional)** | lower | `1.00`–`1.25` Excellent · `1.50`–`1.75` Very good · `2.00`–`2.25` Good · `2.50`–`2.75` Satisfactory · `3.00` Passing · `5.00` Failed | `4.00` conditional (until resolved), `P` (units credited), `INC`, `DRP` |
| **PH percentage (75 passing)** | higher | Any number from 0 to 100, counted at its own value (kept to 2 decimals). Standing: 95+ Excellent · 90+ Very good · 85+ Good · 80+ Satisfactory · 75+ Passing | `P` (units credited), `INC`, `DROP` |
| **PH 4.0 (0.0–4.0)** | higher | `4.0` Excellent · `3.5` Superior · `3.0` Very good · `2.5` Good · `2.0` Satisfactory · `1.5` Fair · `1.0` Passing · `0.0` Failed | `P` (units credited), `INC`, `W` |
| **US letter grades (A–F, 4.0)** | higher | `A+`/`A` 4.0 · `A-` 3.7 · `B+` 3.3 · `B` 3.0 · `B-` 2.7 · `C+` 2.3 · `C` 2.0 · `C-` 1.7 · `D+` 1.3 · `D` 1.0 · `D-` 0.7 · `F` 0.0 | `P` (units credited), `NP`, `I`, `W` |

Common spellings are accepted and stored in the system's own form: `1` → `1.00`, `drp` → `DROP`, `inc` → `I` on the US scale.

Percentage grades are typed; the other systems use a dropdown. Each account has a default system (set in **Settings**), and every saved term remembers its own, so you can switch for a single term (for example after transferring schools). Switching a term keeps only the grades that mean the same on both systems. A CGPA only combines terms on one system, because there is no official conversion between schools.

**Check your school's handbook.** The presets other than MSU-IIT follow common Philippine and US conventions, not one school's official rules. Labels and cut-offs differ between schools.

## Adding or fixing a system

Systems are plain data in [`public/grading-scales.js`](../public/grading-scales.js), shared by the server and the dashboard. Never change the points of a system that has shipped, because saved terms are recomputed from it: add a new id (for example `ph-1to5-v2`) instead. User-defined systems can later plug in through `resolveScale` in [`lib/scales.js`](../lib/scales.js).
