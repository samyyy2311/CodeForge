# Bug Fix and Enhancement Log

This log covers the bugs identified and fixed in the starter code (Stage 1), along with the practical enhancements added to make the grading console more useful for instructors (Stage 2).

---

## Stage 1: Bug Fixes (Starter Code)

The table below lists the issues found in the original code, how they were reproduced, the root cause, what was changed, and how the fix was verified.

| # | Bug / Issue Identified | How You Reproduced It | Root Cause | Fix Implemented | How You Tested the Fix |
|---|---|---|---|---|---|
| 1 | Couldn't upload `.xlsx` files | Opened the file picker and tried to select an `.xlsx` workbook | The file input `<input type="file">` accepted `.xls` only, and the file reader was not configured for binary array buffers | Updated accept filter to `.xls,.xlsx` and read file data as `ArrayBuffer` for modern Excel compatibility | Uploaded the `sample-marks.xlsx` workbook; all student records parsed cleanly (automated test) |
| 2 | Course list kept old courses and showed duplicates | Uploaded two files sequentially | New `<option>` elements were appended for every row without clearing existing options or deduplicating course names | Clear `<select>` options on each upload and generate unique sorted course options | Uploaded sample twice; course picker retained exactly one entry per course (automated test) |
| 3 | Min and Max statistics were swapped | Selected a course with known lowest and highest marks | DOM element IDs and data assignments were reversed between minimum and maximum | Corrected element ID mappings and statistical calculations | Course A displays Min 0 and Max 100 accurately (automated test) |
| 4 | Malformed files loaded without validation | Uploaded files with missing columns, empty marks, decimals, and marks > 100 | Workbook ingestion lacked structural and type validation | Implemented comprehensive row validation: verified BITS ID, course name, and integer marks in the [0, 100] range | Uploaded invalid workbooks; rejected with descriptive row error notices (automated test) |
| 5 | Statistics and curve crashed on empty data or identical marks | Selected a course with no students or a dataset where all students had identical marks | Statistical functions lacked zero-element guards; Gaussian curve computation attempted division by zero when standard deviation was 0 | Added empty-dataset guards returning `N/A`, replaced brittle curve with a dynamic histogram | Verified empty state shows `N/A`, and uniform-mark dataset (marks=50) renders properly (automated test) |
| 6 | CSV export broke on IDs containing commas or quotes | Exported student records with commas or quotes in BITS ID | CSV fields were concatenated with commas without RFC 4180 escaping or wrapping | Enclosed all values in quotes and escaped internal double quotes (`""`) | Exported student IDs `A,B` and `Q"uote`; verified valid CSV structure (automated test) |
| 7 | Session timer was inaccurate and halted after first export | Monitored timer before starting grading and exported twice | Timer initiated on initial page load (measuring idle time) and lacked recurring interval resets | Removed non-essential timer to keep instructor workflow focused and uncluttered | Verified clean UI without distracting or inaccurate timer display |
| 8 | Reset ranges triggered two confirmation popups | Clicked "Reset ranges" button | Event handler registered redundant confirmation prompts | Retained a single explicit confirmation dialog before resetting | Clicked Reset ranges; confirmed single popup appears before reverting (automated test) |
| 9 | Grade bands allowed gaps and disallowed single-mark bands | Attempted to set a grade band with width of 1 mark or non-contiguous ranges | Validation required `Min < Max` (preventing `Min == Max`) and permitted discontinuous range boundaries | Enabled single-mark grade bands and derived adjacent bounds automatically to eliminate gaps | Set A- to 79 (single mark); verified valid grade assignment (automated test) |
| 10 | CSV formula injection and export active without instructor name | Cleared instructor name after selecting course; exported student ID starting with `=` | Export enabled state only checked range validity, and exported cells were not sanitized against spreadsheet formula execution | Require non-empty instructor name, course, and valid ranges before export; prefixed formula triggers (`=`, `+`, `-`, `@`) with `'` | Verified export disabled when name cleared; `=1+1` sanitized to `'=1+1` (automated test) |
| 11 | Chart bars overflowed and animations collided on course switch | Switched courses during active chart animation | Histogram used a fixed vertical scale and animation frames were not cancelled on state change | Scaled bar heights dynamically to peak frequency and cancelled active `requestAnimationFrame` before redrawing | Rapidly toggled courses; verified smooth redraw without visual artifacts |
| 12 | Editing instructor name did not update download button state | Cleared or edited instructor name after course selection | Input event listener on instructor field did not trigger download button re-evaluation | Attached reactive input listener updating download button state and guidance text dynamically | Cleared instructor name; verified export immediately disabled and hint updated (automated test) |
| 13 | Duplicate student records in the same course were not detected | Uploaded a file with the same BITS ID repeated in a single course | Data parser lacked composite course-and-ID uniqueness verification | Added uniqueness tracker flagging duplicate student entries per course with exact row numbers | Uploaded duplicate record; verified rejection with "appears more than once" notice (automated test) |
| 14 | Export button disabled without explanation | Opened application with incomplete setup | Export button disabled state lacked explanatory messaging | Added dynamic hint text explaining exactly what step is required to proceed | Verified hint updates across file upload, instructor name entry, and course selection (automated test) |
| 15 | Row validation stopped at the first encountered error | Uploaded a workbook with multiple erroneous rows | Validator threw on the first failing row | Collected all row errors into an aggregated list before reporting | Uploaded fixture with 4 row issues; all 4 rows reported simultaneously (automated test) |
| 16 | Misleading rounding guidance in documentation | Read starter format instructions stating "80.2 rounds to 81" | Starter guidance suggested decimal rounding while system required integer marks | Clarified guidance to reflect strict whole-number marks (0-100) and rejected floating-point numbers | Uploaded decimal mark (80.2); rejected with row number (automated test) |
| 17 | Outdated SheetJS library with security vulnerabilities | Checked loaded `xlsx` script version | Starter referenced unversioned CDN distribution resolving to 0.18.5 (vulnerable to CVE-2023-30533, CVE-2024-22363) | Migrated to official SheetJS 0.20.3 CDN with local fallback bundle | Verified parsing and export functionality under SheetJS 0.20.3 (automated test) |
| 18 | Unassigned students silently omitted from CSV export | Created range gaps and exported CSV | Export filtered exclusively for students matching defined ranges without notifying user | Enforced contiguous 0-100 ranges, added reconciliation counter, and highlighted unassigned students | Verified all enrolled students are accounted for in CSV export (automated test) |
| 19 | Cancelling file picker threw error; re-uploading same file failed | Cancelled file picker dialog, or selected the same file twice | File handler accessed `files[0]` without existence check, and `file.value` was not reset post-load | Added null check for cancelled selection and cleared `file.value` to allow re-upload of identical files | Cancelled picker and re-selected identical workbook cleanly (automated test) |
| 20 | Reselecting placeholder course threw runtime errors | Picked a valid course then re-selected "Select a course to begin" | Course change handler assumed valid course selection, attempting calculation on empty string | Reset workspace, analytics, and export controls when placeholder is selected | Re-selected placeholder; verified clean return to empty state |
| 21 | Reduced-motion OS setting was overridden | Enabled system `prefers-reduced-motion` and adjusted ranges | Duplicate CSS animation rule re-enabled transition effects | Consolidated motion media queries to honor user OS accessibility preferences | Tested with reduced-motion active; verified transitions and pulse effects are disabled |
| 22 | Grade count animation flashed on course change | Switched between courses | Count animation compared new counts against previous course counts | Reset count animation baseline when course changes | Switched courses; verified counts update without spurious pulse animation |
| 23 | Static export filename across all courses | Exported multiple courses sequentially | Export filename hardcoded to `grades.csv` | Sanitized course name into export filename: `{Course}_grades.csv` | Exported Course A; generated `Course_A_grades.csv` (automated test) |
| 24 | Case and spacing variations fragmented course names | Uploaded file with `"Course A"` and `"course a"` | Course names were grouped case-sensitively for options but case-insensitively for duplicates | Normalized course names by trimming whitespace and unifying case-insensitive matches | Uploaded mixed case variations; unified into a single course entry (automated test) |
| 25 | Message pluralization and whitespace bugs | Loaded single-student or single-course file; exported with spaces | String templates lacked pluralization helper; instructor names were untrimmed in exports | Added `plural()` helper ("1 student record across 1 course") and trimmed instructor names | Verified singular grammar and trimmed CSV instructor field (automated test) |

---

## Stage 2: Enhancements

After fixing the bugs, I made several improvements to make the grading experience smoother and more practical:

### 1. Easier Cut-Off Adjustments
- Replaced the 100-item dropdown menus with stepper inputs that support `-` and `+` buttons, arrow keys, `PageUp`/`PageDown` (±5 marks), or direct typing.
- Connected adjacent grade ranges so adjusting the bottom of one grade automatically updates the top of the next grade, preventing accidental gaps.
- Added an **Undo** button to easily step back through cut-off changes.
- Custom grade ranges for each course are automatically saved in `localStorage` so they stay when switching courses or refreshing the page.

### 2. Live Student Table & Borderline Review
- Added a student roster table that shows each student's BITS ID, marks, assigned grade, and notes in real time as cut-offs move.
- Flags borderline students who are within 1 or 2 marks of the next higher grade (e.g., "1 mark below A") to help with moderation decisions.
- Added a search box to find students by BITS ID and a checkbox to filter for only borderline students.
- Supported sorting the table by clicking any column header (BITS ID, marks, or grade).

### 3. Clearer Analytics & Visuals
- Replaced the fragile bell curve with a clean histogram showing marks grouped in 5-mark buckets, along with cut-off lines and student counts.
- Displays Minimum, Maximum, Average (mean), and Median marks for the selected course.
- Added a reconciliation check that confirms all enrolled students have exactly one grade assigned.
- Formatted grade counts clearly as `Count (Percentage%)`.

### 4. Better File Upload & Validation
- Requires exactly the three expected columns (`BITS ID`, `Course`, `Total Marks`) and checks all rows.
- Rejects invalid rows with clear messages showing the exact row number and issue (empty cells, out-of-range marks, decimals, or duplicate student IDs).
- Added a **Use sample** button so anyone can try the tool right away without finding a file first.
- Added drag-and-drop file upload and a **Clear** button to reset the tool.

### 5. Excel & CSV Export
- Clean CSV export with proper escaping and protection against spreadsheet formula injection.
- Added an Excel (`.xlsx`) export option that produces two sheets: `Grades` (full roster with notes) and `Summary` (grade distribution table).

### 6. Design & Accessibility
- Clean, responsive layout that works well on different screen sizes.
- Added dark mode support based on system preference.
- Full keyboard support for inputs and menus, proper contrast, and screen-reader labels.

