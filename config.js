// =====================================================================
// Amoyni — Local Configuration
// -----------------------------------------------------------------
// This file is loaded directly by every page. Replace the two values
// below with your real Supabase project's URL and anon key before
// deploying (see config.example.js for instructions).
//
// NOTE: the values below are for the LOCAL TEST ENVIRONMENT used
// while building/testing this project (a local Postgres + PostgREST
// instance, not a real Supabase cloud project). They let every page
// run and be tested against a real Postgres database (not mock data).
// Swap them for your actual Supabase project before shipping.
// =====================================================================

window.AMOYNI_CONFIG = {
  SUPABASE_URL: "https://jdsgumfjbvshckcnyuey.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impkc2d1bWZqYnZzaGNrY255dWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDQ2MDcsImV4cCI6MjEwMDcyMDYwN30.O_mLRHkPqRz9Afq3-GHvvkrMA2_9Di4BvUYxEL_vt6E",

  SCAN_TIMEOUT_SECONDS: 60,
  LEADERBOARD_LIMIT: 10,
  DEFAULT_LANGUAGE: "ar",
};
