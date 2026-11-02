import {readFileSync} from 'node:fs';
export function sqlTransicao(){
  return readFileSync('supabase/migrations/20261030215141_simplificar_admin.sql','utf8');
}
