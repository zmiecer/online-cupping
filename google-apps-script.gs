/**
 * Google Apps Script for Coffee Cupping ratings storage.
 *
 * Setup:
 * 1. Create a Google Sheet, name the first tab "Ratings"
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL into config.js GOOGLE_SCRIPT_URL
 *
 * The sheet headers (row 1) will be created automatically on first submission.
 */

var SHEET_NAME = 'Ratings';

var HEADERS = [
  'timestamp',
  'participant',
  'sample_number',
  'fragrance_aroma',
  'flavor',
  'aftertaste',
  'acidity',
  'sweetness',
  'mouthfeel',
  'overall',
  'fragrance_aroma_notes',
  'flavor_notes',
  'aftertaste_notes',
  'acidity_notes',
  'sweetness_notes',
  'mouthfeel_notes',
  'overall_notes'
];

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var data = body.data || body;

    var sheet = getOrCreateSheet();
    var row = HEADERS.map(function(h) { return data[h] || ''; });
    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'getRatings';

    if (action === 'submit') {
      var data = JSON.parse(e.parameter.data);
      var sheet = getOrCreateSheet();
      var row = HEADERS.map(function(h) { return data[h] || ''; });
      sheet.appendRow(row);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getRatings') {
      var sheet = getOrCreateSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return ContentService
          .createTextOutput(JSON.stringify({ ratings: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var dataRange = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
      var values = dataRange.getValues();

      var ratings = values.map(function(row) {
        var obj = {};
        HEADERS.forEach(function(h, i) { obj[h] = row[i]; });
        return obj;
      });

      return ContentService
        .createTextOutput(JSON.stringify({ ratings: ratings }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
