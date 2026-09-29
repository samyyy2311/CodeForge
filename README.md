# CodeForge

A small grading tool I made for the BITS Digital CodeForge challenge.

It takes an Excel file with student marks, lets the instructor set grade cut-offs, shows the grades for a selected course, and exports them as a CSV or Excel file.

Live app: https://samyyy2311.github.io/CodeForge/

## How to use

1. Enter the instructor name.
2. Upload an `.xls` or `.xlsx` file (or drag it onto the page), or click **Use sample**.
3. Select a course.
4. Adjust the grade cut-offs if needed, using the − / + buttons, the arrow keys (Page Up/Down moves by 5), or by typing a value.
5. Download the grades as a CSV or Excel file.

The Excel file should contain:

- `BITS ID`
- `Course`
- `Total Marks`

Marks should be whole numbers from 0 to 100. Students who did not appear for the trimester-end examination and are to be awarded an NC grade should not be included.

The app also lets you search and sort students, see who is within 2 marks of the next grade, check the marks distribution, undo grade range changes, and save custom ranges for each course in the browser.

## Run locally

The app is a single HTML file and uses SheetJS to read and write Excel files.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/BITS_Digital_CodeForge_Challenge.html
```

## Tests

There are Playwright tests for file upload, validation, grade ranges, undo, saved ranges, search, sorting and both exports.

Run them with:

```sh
npm ci
npx playwright install chromium
npm test
```

The tests also run through GitHub Actions.

## Files

- `BITS_Digital_CodeForge_Challenge.html` - main app
- `tests/console.spec.js` - Playwright tests
- `tests/fixtures/` - test Excel files
- `BUG_FIX_LOG.md` - bugs I found and fixed
- `AI_USAGE.md` - note about AI use during development

## Note

The grading and file processing happen in the browser. The uploaded marks file is not sent to a backend server.
