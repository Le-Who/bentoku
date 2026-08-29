## 2024-05-23 - Optimization in Hot Recursion Loops
**Learning:** In a constraint satisfaction solver, higher-order functions like `.some()` and `.every()` inside deep recursive loops impose substantial performance overhead due to closure creation and callback execution on every cell checked.
**Action:** When optimizing constraint satisfaction or deep search algorithms in JS/TS, convert deep `.every()`/`.some()` loops to nested `for` loops and cache valid possibilities/offsets statically where possible to significantly improve iteration times.
