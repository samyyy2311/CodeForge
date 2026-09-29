const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const PAGE = '/BITS_Digital_CodeForge_Challenge.html';
const SAMPLE = path.join(__dirname, '..', 'sample-marks.xlsx');
const fixture = name => path.join(__dirname, 'fixtures', name);

test.beforeEach(async ({ page }) => {
  // use a local copy of SheetJS if the CDN is blocked
  if (process.env.SHEETJS_PATH) {
    await page.route(/cdn\.sheetjs\.com/, route =>
      route.fulfill({ path: process.env.SHEETJS_PATH, contentType: 'application/javascript' }));
  }
  await page.goto(PAGE);
});

async function upload(page, file) {
  await page.locator('#file').setInputFiles(file);
}

async function openCourse(page, courseName = 'Course A', file = SAMPLE) {
  await page.locator('#instructor').fill('Dr. Sharma');
  await upload(page, file);
  await expect(page.locator('#welcome')).toContainText('Loaded');
  await page.locator('#course').selectOption(courseName);
  await expect(page.locator('#Amin')).toBeVisible();
}

async function setCutoff(input, value) {
  await input.fill(value);
  await input.press('Enter');
}

function gradeOf(page, bitsId) {
  return page.locator('#previewBody tr', { has: page.getByRole('cell', { name: bitsId, exact: true }) }).locator('td').nth(2);
}

async function downloadCsv(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  return { name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

async function downloadExcel(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadXlsx').click()]);
  const base64 = fs.readFileSync(await download.path()).toString('base64');
  const book = await page.evaluate(base64 => {
    const wb = XLSX.read(Uint8Array.from(atob(base64), c => c.charCodeAt(0)), { type: 'array' });
    const rows = name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const hasFormula = Object.keys(wb.Sheets.Grades).some(key => !key.startsWith('!') && wb.Sheets.Grades[key].f);
    return { sheets: wb.SheetNames, grades: rows('Grades'), summary: rows('Summary'), hasFormula };
  }, base64);
  return { name: download.suggestedFilename(), ...book };
}

// builds a workbook in the page so small edge cases don't need fixture files
async function uploadRows(page, rows, name = 'marks.xlsx') {
  await page.waitForFunction(() => window.XLSX);
  const base64 = await page.evaluate(rows => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Marks');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, rows);
  await page.locator('#file').setInputFiles({
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(base64, 'base64'),
  });
}

async function dropFile(page, filePath, name) {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataTransfer = await page.evaluateHandle(({ base64, name }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], name));
    return transfer;
  }, { base64, name });
  await page.dispatchEvent('body', 'drop', { dataTransfer });
}

test('shows N/A statistics and an empty state before a course is chosen', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'No course selected' })).toBeVisible();
  for (const id of ['#min', '#max', '#avg', '#med']) await expect(page.locator(id)).toHaveText('N/A');
  await expect(page.locator('#download')).toBeHidden();
});

test('requires the instructor name before a course can be selected', async ({ page }) => {
  await upload(page, SAMPLE);
  await page.locator('#course').selectOption('Course A');
  await expect(page.locator('#welcome')).toHaveText('Enter the instructor name before selecting a course.');
  await expect(page.locator('#course')).toHaveValue('');
  await expect(page.locator('#instructor')).toBeFocused();
});

test('loads an .xlsx workbook and lists each course once, even after a second upload', async ({ page }) => {
  await upload(page, SAMPLE);
  await expect(page.locator('#welcome')).toHaveText('Loaded 50 student records across 2 courses.');
  await expect(page.locator('#fileName')).toHaveText('sample-marks.xlsx');
  await upload(page, SAMPLE);
  await expect(page.locator('#course option')).toHaveText(['Select a course to begin', 'Course A', 'Course B']);
});

test('loads the sample workbook deployed next to the app', async ({ page }) => {
  let githubRequested = false;
  await page.route('https://raw.githubusercontent.com/**', route => {
    githubRequested = true;
    return route.abort();
  });
  await page.getByRole('button', { name: 'Use sample' }).click();
  await expect(page.locator('#welcome')).toHaveText('Loaded 50 student records across 2 courses.');
  expect(githubRequested).toBe(false);
  await expect(page.locator('#fileName')).toHaveText('sample-marks.xlsx');
  await page.locator('#instructor').fill('Dr. Sharma');
  await page.locator('#course').selectOption('Course A');
  await expect(page.locator('#previewCount')).toHaveText('40 students in Course A. 14 within 2 marks of the next grade.');
});

test('falls back to the GitHub copy of the sample workbook', async ({ page }) => {
  let requested = '';
  await page.route(/127\.0\.0\.1:\d+\/sample-marks\.xlsx$/, route => route.fulfill({ status: 404 }));
  await page.route('https://raw.githubusercontent.com/**', route => {
    requested = route.request().url();
    return route.fulfill({ path: SAMPLE });
  });
  await page.getByRole('button', { name: 'Use sample' }).click();
  await expect(page.locator('#welcome')).toHaveText('Loaded 50 student records across 2 courses.');
  expect(requested).toBe('https://raw.githubusercontent.com/samyyy2311/CodeForge/main/sample-marks.xlsx');
});

test('explains when the sample workbook cannot be downloaded', async ({ page }) => {
  await page.route(/127\.0\.0\.1:\d+\/sample-marks\.xlsx$/, route => route.abort());
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
  await page.getByRole('button', { name: 'Use sample' }).click();
  await expect(page.locator('#welcome')).toHaveText('The sample workbook could not be downloaded. Check your internet connection and try again.');
  await expect(page.locator('#course option')).toHaveCount(1);
  await expect(page.locator('#fileName')).toHaveText('.xls or .xlsx');
});

test('shows correct statistics, percentages and a reconciliation check', async ({ page }) => {
  await openCourse(page);
  await expect(page.locator('#min')).toHaveText('0');
  await expect(page.locator('#max')).toHaveText('100');
  await expect(page.locator('#avg')).toHaveText('49.98');
  await expect(page.locator('#med')).toHaveText('49.5');
  for (const grade of ['A', 'A-', 'B', 'B-', 'C', 'C-', 'D', 'E']) {
    await expect(page.locator(`[id="${grade}count"]`)).toHaveText('5 (12.5%)');
  }
  await expect(page.locator('#gradeReconciliation')).toHaveText('All 40 students have one grade. The grade counts add up to 40.');
  await expect(page.locator('#histDescription')).toContainText('80 to 84: 1 student');
  await expect(page.locator('#histDescription')).toContainText('95 to 100: 2 students');
});

test('moves a student when a cut-off changes, derives the band below, and undoes the change', async ({ page }) => {
  await openCourse(page);
  await expect(gradeOf(page, '20240002')).toHaveText('A');
  await setCutoff(page.locator('#Amin'), '81');
  await expect(gradeOf(page, '20240002')).toHaveText('A-');
  await expect(page.locator('[id="A-max"]')).toHaveText('80');
  await page.getByRole('button', { name: 'Undo range change' }).click();
  await expect(gradeOf(page, '20240002')).toHaveText('A');
  await expect(page.locator('[id="A-max"]')).toHaveText('79');
  await expect(page.getByRole('button', { name: 'Undo range change' })).toBeDisabled();
});

test('undoes several range changes one step at a time', async ({ page }) => {
  await openCourse(page);
  await setCutoff(page.locator('#Amin'), '81');
  await setCutoff(page.locator('#Amin'), '82');
  const undo = page.getByRole('button', { name: 'Undo range change' });
  await undo.click();
  await expect(page.locator('#Amin')).toHaveValue('81');
  await undo.click();
  await expect(page.locator('#Amin')).toHaveValue('80');
  await expect(undo).toBeDisabled();
});

test('reset ranges asks for confirmation once and can be undone', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', dialog => { dialogs++; dialog.accept(); });
  await openCourse(page);
  await setCutoff(page.locator('#Amin'), '85');
  await page.getByRole('button', { name: 'Reset ranges' }).click();
  expect(dialogs).toBe(1);
  await expect(page.locator('#Amin')).toHaveValue('80');
  await page.getByRole('button', { name: 'Undo range change' }).click();
  await expect(page.locator('#Amin')).toHaveValue('85');
});

test('allows a one-mark band and blocks export when cut-offs are out of order', async ({ page }) => {
  await openCourse(page);
  await setCutoff(page.locator('[id="A-min"]'), '79');
  await expect(page.locator('[id="A-max"]')).toHaveText('79');
  await expect(page.locator('#rangeError')).toHaveText('');
  await expect(page.locator('#download')).toBeEnabled();

  await setCutoff(page.locator('[id="A-min"]'), '80');
  await expect(page.locator('#rangeError')).toHaveText('A- must start below A, which starts at 80.');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#downloadHint')).toHaveText('Fix the grade ranges before downloading.');
  await expect(gradeOf(page, '20240001')).toHaveText('—');
  await expect(page.locator('#previewCount')).toHaveText('40 students in Course A. Fix the grade ranges to see their grades.');
  await expect(page.locator('#nearOnly')).toBeDisabled();
  await expect(page.locator('#downloadXlsx')).toBeDisabled();
  await expect(page.locator('#gradeReconciliation')).toHaveText('Fix the grade ranges to check the totals.');
});

test('keeps custom ranges for each course across course switches and reloads', async ({ page }) => {
  await openCourse(page);
  await setCutoff(page.locator('#Amin'), '85');
  await expect(page.locator('#bandsSource')).toHaveText('Custom ranges, saved in this browser');

  await page.locator('#course').selectOption('Course B');
  await expect(page.locator('#Amin')).toHaveValue('80');
  await expect(page.locator('#bandsSource')).toHaveText('Default ranges');
  await page.locator('#course').selectOption('Course A');
  await expect(page.locator('#Amin')).toHaveValue('85');

  await page.reload();
  await openCourse(page);
  await expect(page.locator('#Amin')).toHaveValue('85');

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reset ranges' }).click();
  await page.reload();
  await openCourse(page);
  await expect(page.locator('#Amin')).toHaveValue('80');
});

test('sorts and searches the student preview', async ({ page }) => {
  await openCourse(page);
  const firstMark = page.locator('#previewBody tr').first().locator('td').nth(1);
  await page.getByRole('button', { name: 'Marks', exact: true }).click();
  await expect(page.locator('#marksHeader')).toHaveAttribute('aria-sort', 'ascending');
  await expect(firstMark).toHaveText('0');
  await page.getByRole('button', { name: 'Marks', exact: true }).click();
  await expect(page.locator('#marksHeader')).toHaveAttribute('aria-sort', 'descending');
  await expect(firstMark).toHaveText('100');

  await page.getByPlaceholder('Find a BITS ID').fill('0016');
  await expect(page.locator('#previewBody tr')).toHaveCount(1);
  await expect(page.locator('#previewCount')).toHaveText('Showing 1 of 40 students.');
  await page.getByPlaceholder('Find a BITS ID').fill('nobody');
  await expect(page.locator('#previewCount')).toHaveText('No students match this BITS ID.');
});

test('flags students just below the next grade and can show only them', async ({ page }) => {
  await openCourse(page);
  const noteOf = id => page.locator('#previewBody tr', { has: page.getByRole('cell', { name: id, exact: true }) }).locator('td').nth(3);
  await expect(noteOf('20240003')).toHaveText('1 mark below A');
  await expect(noteOf('20240004')).toHaveText('');
  await page.getByLabel('Near a cut-off only').check();
  await expect(page.locator('#previewBody tr')).toHaveCount(14);
  await expect(page.locator('#previewCount')).toHaveText('Showing 14 of 40 students.');
  await setCutoff(page.locator('#Amin'), '82');
  await expect(noteOf('20240002')).toHaveText('2 marks below A');
  await expect(page.locator('#previewBody tr', { has: page.getByRole('cell', { name: '20240003', exact: true }) })).toHaveCount(0);
  await expect(page.locator('#previewBody tr')).toHaveCount(13);
});

test('loads a workbook dropped onto the page and rejects other file types', async ({ page }) => {
  await dropFile(page, fixture('wrong-columns.xlsx'), 'notes.txt');
  await expect(page.locator('#welcome')).toHaveText('Only .xls and .xlsx files can be uploaded.');
  await dropFile(page, SAMPLE, 'sample-marks.xlsx');
  await expect(page.locator('#welcome')).toHaveText('Loaded 50 student records across 2 courses.');
  await expect(page.locator('#fileName')).toHaveText('sample-marks.xlsx');
});

test('explains when the spreadsheet library cannot be loaded', async ({ page }) => {
  await page.route(/cdn\.sheetjs\.com/, route => route.abort());
  await page.reload();
  await page.locator('#file').setInputFiles(SAMPLE);
  await expect(page.locator('#welcome')).toHaveText('The spreadsheet library did not load. Check your internet connection and reload the page.');
});

test('lists every invalid row and rejects duplicate students', async ({ page }) => {
  await upload(page, fixture('invalid-rows.xlsx'));
  await expect(page.locator('#welcome')).toHaveText('Found 4 workbook row issues.');
  await expect(page.locator('#uploadErrorList li')).toHaveText([
    'Row 2: enter a BITS ID, course, and whole-number mark from 0 to 100.',
    'Row 3: enter a BITS ID, course, and whole-number mark from 0 to 100.',
    'Row 4: enter a BITS ID, course, and whole-number mark from 0 to 100.',
    'Row 6: BITS ID 2024X004 appears more than once in Course A.',
  ]);
  await expect(page.locator('#course option')).toHaveCount(1);
});

test('rejects a worksheet with the wrong columns', async ({ page }) => {
  await upload(page, fixture('wrong-columns.xlsx'));
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');
  await expect(page.locator('#uploadErrors')).toBeHidden();
});

test('only enables export once the instructor, course and ranges are ready', async ({ page }) => {
  await openCourse(page);
  await expect(page.locator('#downloadHint')).toHaveText('Ready to download the grades for this course.');
  await page.locator('#instructor').fill('');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#downloadHint')).toHaveText('Enter the instructor name to continue.');
  await page.locator('#instructor').fill('Dr. Sharma');
  await expect(page.locator('#download')).toBeEnabled();
});

test('exports every student in the course to CSV', async ({ page }) => {
  await openCourse(page);
  const { name, text } = await downloadCsv(page);
  expect(name).toBe('Course_A_grades.csv');
  const lines = text.trim().split('\r\n');
  expect(lines.slice(0, 4)).toEqual(['Instructor,"Dr. Sharma"', 'Course,"Course A"', '', 'BITS ID,Total Marks,Grade']);
  expect(lines).toHaveLength(4 + 40);
  expect(lines).toContain('"20240002","80","A"');
  expect(lines).toContain('"20240016","0","E"');
  await expect(page.locator('#thankyou')).toHaveText('Grades for Course A were exported.');
});

test('exports grades and a grade summary to Excel', async ({ page }) => {
  await openCourse(page);
  const book = await downloadExcel(page);
  expect(book.name).toBe('Course_A_grades.xlsx');
  expect(book.sheets).toEqual(['Grades', 'Summary']);
  expect(book.grades.slice(0, 4)).toEqual([
    ['Instructor', 'Dr. Sharma', '', ''],
    ['Course', 'Course A', '', ''],
    ['', '', '', ''],
    ['BITS ID', 'Total Marks', 'Grade', 'Near a cut-off'],
  ]);
  expect(book.grades).toHaveLength(4 + 40);
  expect(book.grades).toContainEqual(['20240003', 79, 'A-', '1 mark below A']);
  expect(book.summary[0]).toEqual(['Grade', 'From', 'To', 'Students', 'Share']);
  expect(book.summary[1]).toEqual(['A', 80, 100, 5, 0.125]);
  expect(book.summary.at(-1)).toEqual(['Total', '', '', 40, 1]);
});

test('quotes punctuation and neutralises formulas in the CSV, and handles identical marks', async ({ page }) => {
  await openCourse(page, 'Course X', fixture('tricky-values.xlsx'));
  await expect(page.locator('#min')).toHaveText('50');
  await expect(page.locator('#max')).toHaveText('50');
  await expect(page.locator('#med')).toHaveText('50');
  const { text } = await downloadCsv(page);
  const lines = text.trim().split('\r\n');
  expect(lines).toContain(`"'=1+1","50","B-"`);
  expect(lines).toContain('"A,B","50","B-"');
  expect(lines).toContain('"Q""uote","50","B-"');

  const book = await downloadExcel(page);
  expect(book.grades).toContainEqual(['=1+1', 50, 'B-', '']);
  expect(book.hasFormula).toBe(false);
});

test('accepts column headings with extra spaces or the wording from the challenge brief', async ({ page }) => {
  await uploadRows(page, [[' BITS ID ', 'Course', 'Total Marks'], ['2024A001', 'Course A', 82]]);
  await expect(page.locator('#welcome')).toHaveText('Loaded 1 student record across 1 course.');
  await uploadRows(page, [['Student’s BITS ID', 'Course', 'Total Marks (out of 100)'], ['2024A001', 'Course A', 82], ['2024A002', 'Course A', 71]]);
  await expect(page.locator('#welcome')).toHaveText('Loaded 2 student records across 1 course.');
  await uploadRows(page, [['BITS ID', 'Course', 'Marks'], ['2024A001', 'Course A', 82]]);
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');
});

test('treats course names that differ only in capitals or spacing as one course', async ({ page }) => {
  await uploadRows(page, [
    ['BITS ID', 'Course', 'Total Marks'],
    ['2024A001', 'Course A', 82],
    ['2024A002', 'course a', 71],
    ['2024A003', 'Course  A ', 64],
  ]);
  await expect(page.locator('#welcome')).toHaveText('Loaded 3 student records across 1 course.');
  await expect(page.locator('#course option')).toHaveText(['Select a course to begin', 'Course A']);
  await uploadRows(page, [
    ['BITS ID', 'Course', 'Total Marks'],
    ['2024A001', 'Course A', 82],
    ['2024A001', 'course a', 71],
  ]);
  await expect(page.locator('#welcome')).toHaveText('Found 1 workbook row issue.');
  await expect(page.locator('#uploadErrorList li')).toHaveText(['Row 3: BITS ID 2024A001 appears more than once in Course A.']);
});

test('trims the instructor name in the CSV export', async ({ page }) => {
  await openCourse(page);
  await page.locator('#instructor').fill('  Dr. Sharma  ');
  const { text } = await downloadCsv(page);
  expect(text.split('\r\n')[0]).toBe('Instructor,"Dr. Sharma"');
});

test('cut-off steppers respond to buttons, arrow keys and typed values', async ({ page }) => {
  await openCourse(page);
  const a = page.locator('#Amin');
  await page.getByRole('button', { name: 'Raise the A cut-off' }).click();
  await expect(a).toHaveValue('81');
  await expect(gradeOf(page, '20240002')).toHaveText('A-');
  await a.press('ArrowDown');
  await expect(a).toHaveValue('80');
  await a.press('PageUp');
  await expect(a).toHaveValue('85');
  await setCutoff(a, '250');
  await expect(a).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Raise the A cut-off' })).toBeDisabled();
  await setCutoff(a, 'abc');
  await expect(a).toHaveValue('100');
  await page.locator('#undoRanges').click();
  await expect(a).toHaveValue('85');
});

test('course menu shows student counts and works with the mouse and keyboard', async ({ page }) => {
  const button = page.locator('#courseButton');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('Upload a workbook first');
  await page.locator('#instructor').fill('Dr. Sharma');
  await upload(page, SAMPLE);
  await expect(button).toBeEnabled();
  await button.click();
  const options = page.getByRole('option');
  await expect(options).toHaveText(['Course A40 students', 'Course B10 students']);
  await options.nth(1).click();
  await expect(page.locator('#course')).toHaveValue('Course B');
  await expect(button).toHaveText('Course B');
  await expect(page.getByRole('listbox')).toBeHidden();

  await setCutoff(page.locator('#Amin'), '85');
  await button.press('ArrowDown');
  await expect(page.getByRole('option', { selected: true })).toHaveText('Course B10 students · custom ranges');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(button).toHaveText('Course A');
  await expect(button).toBeFocused();
  await expect(page.locator('#previewCount')).toContainText('40 students in Course A');

  await button.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(button).toHaveText('Course A');
});

test('indicates sample data when the sample workbook is loaded and hides it on custom upload', async ({ page }) => {
  await expect(page.locator('#sampleTag')).toBeHidden();
  await page.getByRole('button', { name: 'Use sample' }).click();
  await expect(page.locator('#sampleTag')).toBeVisible();
  await expect(page.locator('#sampleTag')).toHaveText('Sample data');

  await uploadRows(page, [
    ['BITS ID', 'Course', 'Total Marks'],
    ['2024A001', 'Course A', 82],
  ]);
  await expect(page.locator('#sampleTag')).toBeHidden();
});

test('clears the loaded workbook and resets the application state without page reload', async ({ page }) => {
  await page.locator('#instructor').fill('Dr. Sharma');
  await page.getByRole('button', { name: 'Use sample' }).click();
  await expect(page.locator('#clearFile')).toBeVisible();
  await expect(page.locator('#sampleTag')).toBeVisible();
  await page.locator('#course').selectOption('Course A');
  await expect(page.locator('#Amin')).toBeVisible();
  await expect(page.locator('#download')).toBeEnabled();

  await page.locator('#clearFile').click();

  await expect(page.locator('#fileName')).toHaveText('.xls or .xlsx');
  await expect(page.locator('#clearFile')).toBeHidden();
  await expect(page.locator('#sampleTag')).toBeHidden();
  await expect(page.locator('#course option')).toHaveCount(1);
  await expect(page.locator('#courseButton')).toBeDisabled();
  await expect(page.locator('#courseButton')).toHaveText('Upload a workbook first');
  await expect(page.getByRole('heading', { name: 'No course selected' })).toBeVisible();
  await expect(page.locator('#download')).toBeHidden();
  for (const id of ['#min', '#max', '#avg', '#med']) {
    await expect(page.locator(id)).toHaveText('N/A');
  }
});

test('rejects workbooks with duplicate canonical headers, extra columns, or missing columns', async ({ page }) => {
  await uploadRows(page, [
    ['BITS ID', "Student's BITS ID", 'Total Marks'],
    ['2024A001', '2024A001', 82],
  ]);
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');

  await uploadRows(page, [
    ['BITS ID', 'Course', 'Total Marks', 'Remarks'],
    ['2024A001', 'Course A', 82, 'Good'],
  ]);
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');

  await uploadRows(page, [
    ['BITS ID', 'Course', 'Total Marks'],
    ['2024A001', 'Course A', 82, 'Unexpected extra cell'],
  ]);
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');

  await uploadRows(page, [
    ['BITS ID', 'Course'],
    ['2024A001', 'Course A'],
  ]);
  await expect(page.locator('#welcome')).toHaveText('The worksheet must contain exactly these columns: BITS ID, Course, Total Marks.');
});

