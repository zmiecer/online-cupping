const CONFIG = {
  // Backend: 'firebase' (fast) or 'sheets' (Google Sheets fallback)
  BACKEND: 'firebase',

  // Firebase Realtime Database — fill in after creating your project
  FIREBASE: {
    apiKey: '',
    databaseURL: '',
    projectId: '',
  },

  // Google Sheets fallback (kept for easy switch-back)
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxCFii6AET4NB1DFsmSWbhLUVDagLBvHH-IIwpPmrfUvGzLhoQ9s9Nir200HXmgb0DIPQ/exec',

  // Set to true when voting is over to reveal full stats
  VOTING_ENDED: false,

  PARTICIPANTS: [
    'Zmicier',
    'Lericheskaya',
    'Tempur',
    'Michael',
    'Manechka',
    // Add your friends' names here
  ],
};
