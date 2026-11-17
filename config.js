/* Account sync settings.
   Leave both empty and the app keeps everything on the device.
   To turn on accounts and sync: create a Supabase project, run supabase/schema.sql
   in its SQL editor, then paste the project URL and the public "anon" key here.
   The anon key is meant to be public; row-level security keeps each person's rows private. */
window.HA_CONFIG = {
  supabaseUrl: "",
  supabaseKey: ""
};
