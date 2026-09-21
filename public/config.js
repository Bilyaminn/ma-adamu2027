/* ---------------------------------------------------------------------
   Connect the website to your free Supabase project.
   Supabase dashboard -> Project Settings -> API:
     Project URL   -> supabaseUrl   (looks like https://abcdxyz.supabase.co -
                                     NOT the supabase.com/dashboard/... address in your browser bar)
     anon / publishable key -> supabaseAnonKey   (this key is meant to be public;
                                                  the database rules protect your data)
   NEVER put the "service_role" / secret key in this file.
   --------------------------------------------------------------------- */
window.SITE_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-OR-PUBLISHABLE-KEY'
};
