-- Initial scope: Cuarto Grado de Educación General Básica — Paralelo A.
-- Subjects carry the language the homework is DONE in (not the language it is explained in):
-- subjects taught in English → 'en' even when a Spanish explanation is provided for parents.
-- The administrator can rename, add or change these in the admin console.
with c as (
  insert into public.classes (grade_label, grade_short, parallel, timezone)
  values ('Cuarto Grado de Educación General Básica', '4.º EGB', 'A', 'America/Guayaquil')
  returning id
)
insert into public.subjects (class_id, name, language, emoji, sort_order)
select c.id, s.name, s.lang::public.hw_language, s.emoji, s.ord
from c, (values
  ('Matemática',                       'es', '➗', 1),
  ('Lengua y Literatura',              'es', '📖', 2),
  ('Estudios Sociales',                'es', '🌎', 3),
  ('Ciencias Naturales',               'es', '🌱', 4),
  ('Educación Cultural y Artística',   'es', '🎨', 5),
  ('Educación en la Fe',               'es', '🙏', 6),
  ('Educación Física',                 'es', '⚽', 7),
  ('Language Arts',                    'en', '📚', 10),
  ('English',                          'en', '🔤', 11),
  ('Science',                          'en', '🔬', 12),
  ('Spelling',                         'en', '✏️', 13)
) as s(name, lang, emoji, ord);
