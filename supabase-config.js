/* Add your Supabase project URL and publishable/anon key here.
 * These browser values are public by design. Never put a service_role key here.
 */
window.SplitMoneyCloud = {
  url: '',
  anonKey: '',
  get configured() { return Boolean(this.url && this.anonKey); }
};
